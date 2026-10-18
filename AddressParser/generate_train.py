"""Воспроизводимые синтетические адреса и разметка по spec 1.1. Только stdlib."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import random
import re
import sys
import time
import unicodedata

VERSION = "train-v004"
FIELDS = ("province", "city", "district", "living_area", "street_type", "street_name",
          "house", "apartment", "entrance", "floor", "landmark")
FAMILIES = (
    "standard_ru", "postfix", "glued", "kk_markers", "latin_markers",
    "unmarked_street", "numeric_street", "micro_only", "micro_street", "jk_street",
    "fraction", "letter", "corpus", "landmark", "duplicate_city", "bilingual_city",
    "unicode_cf", "unicode_space", "typo", "case", "reorder", "no_city",
    "explicit_province", "district", "ambiguous_numbers",
)
INPUTS = {
    "database": "artifacts/address_db/runtime/v001-project/address_runtime.sqlite",
    "reader": "artifacts/address_db/tools/runtime_index_v1.py",
    "spec": "datasets/evaluation/gold/T3.1_A1/annotation_spec.md",
    "config": "datasets/evaluation/gold/T3.1_A1/evaluation_config.json",
    "split": "datasets/evaluation/releases/T3.1/split_manifest.json",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def digest(value):
    return sha(json.dumps(value, ensure_ascii=False, sort_keys=True,
                          separators=(",", ":")).encode("utf-8"))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path, records):
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")


def clean_component_name(name):
    """Отбор имён без встроенных типов и частей полного адреса; исходник не исправляется."""
    if not name or name != name.strip() or not 1 <= len(name) <= 65:
        return False
    if any(not (ch.isalnum() or ch in " .-ёЁәӘғҒқҚңҢөӨұҰүҮһҺіІ") for ch in name):
        return False
    marker = (r"(?iu)(?<!\w)(?:ул|улица|улицы|көшесі|көш|көшелер|даңғылы|пр|проспект|"
              r"пер|переулок|проезд|бульвар|мкр|микрорайон|квартал|шағын|аудан|"
              r"жк|ст|снт|дт|до|дом|корпус|корп|кв|район|районы|дачное|общество|"
              r"коттеджный|городок|кенті|ауылы|тупик|аллея|шоссе|тракт|бульвары)(?!\w)")
    return re.search(marker, name) is None


def load_inputs(root):
    paths = {key: root / path for key, path in INPUTS.items()}
    hashes = {key: sha(path.read_bytes()) for key, path in paths.items()}
    config, split = read_json(paths["config"]), read_json(paths["split"])
    if config["spec_version"] != "1.1" or split["spec_version"] != "1.1":
        raise ValueError("Требуется spec 1.1")
    if hashes["spec"] != split["spec_sha256"] or hashes["config"] != split["config_sha256"]:
        raise ValueError("Spec/config не соответствуют публичному manifest")
    module_spec = importlib.util.spec_from_file_location("train_runtime_reader", paths["reader"])
    reader = importlib.util.module_from_spec(module_spec)
    old = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        module_spec.loader.exec_module(reader)
    finally:
        sys.dont_write_bytecode = old
    db = reader.connect(paths["database"])
    localities, name_provinces = [], defaultdict(set)
    for row in db.execute("SELECT * FROM admin WHERE city_display IS NOT NULL ORDER BY id"):
        city, province = row["city_display"], row["province_display"]
        name_provinces[city].add(province)
        if row["type"] in ("city", "settlement", "rural_locality"):
            item = reader.admin_display(db, row["id"], profile="project")
            kk = item["names"].get("kk", city)
            kk = re.sub(r"\s+(?:қ\.|а\.|к\.|қаласы|ауылы|кенті)$", "", kk).strip()
            item["kk"] = kk
            localities.append(item)
    cities = [x for x in localities if x["type"] == "city"]
    settlements = [x for x in localities if x["type"] != "city"]
    streets, areas, numeric = [], [], []
    seen = set()
    for row in db.execute("SELECT id,role,names_json,type_json FROM geonims ORDER BY id"):
        names, types = json.loads(row["names_json"]), json.loads(row["type_json"]) or {}
        name = names.get("ru") or names.get("source_default")
        if not clean_component_name(name):
            continue
        key = (row["role"], name)
        if key in seen:
            continue
        seen.add(key)
        item = {"id": row["id"], "name": name, "type": (types.get("ru") or "").lower()}
        if (row["role"] == "street" and any(ch.isalpha() for ch in name)
                and types.get("ru") in ("УЛИЦА", "ПЕРЕУЛОК", "ПРОСПЕКТ", "ПРОЕЗД")):
            streets.append(item)
            if any(ch.isdigit() for ch in name):
                numeric.append(item)
        elif row["role"] == "address_area" and item["type"] == "микрорайон":
            areas.append(item)
    districts = []
    for row in db.execute("SELECT id,display_name FROM admin WHERE type='urban_district' ORDER BY id"):
        name = re.sub(r"^район\s+|\s+район$", "", row["display_name"]).strip()
        districts.append({"id": row["id"], "name": name})
    db.close()
    if not all((cities, settlements, streets, numeric, areas, districts)):
        raise ValueError("Недостаточно разрешённых справочных имён")
    return config, split, hashes, {
        "cities": cities, "settlements": settlements, "streets": streets,
        "numeric": numeric, "areas": areas, "districts": districts,
        "name_provinces": name_provinces,
    }


class RecordBuilder:
    def __init__(self):
        self.raw = ""
        self.expected = dict.fromkeys(FIELDS)
        self.origin = dict.fromkeys(FIELDS, "absent")
        self.spans = {f: [] for f in FIELDS}

    def add(self, text, field=None, transform="identity", expected=None):
        start = len(self.raw)
        self.raw += text
        if field:
            value = text if expected is None else expected
            if self.expected[field] is not None and self.expected[field] != value:
                raise ValueError("Несогласованный повтор поля")
            self.expected[field] = value
            self.origin[field] = "explicit"
            self.spans[field].append({"start": start, "end": len(self.raw), "transform": transform})

    def marked(self, value, field, marker, postfix=False, glue=False):
        gap = "" if glue else " "
        if postfix:
            self.add(value, field)
            self.add(gap + marker)
        else:
            self.add(marker + gap)
            self.add(value, field)


def changed_spans(spans, start, end, replacement):
    """Изменение внутри значения либо вне значений; пересечение границы запрещено."""
    delta = len(replacement) - (end - start)
    result = copy.deepcopy(spans)
    for entries in result.values():
        for s in entries:
            a, b = s["start"], s["end"]
            if end <= a:
                s["start"], s["end"] = a + delta, b + delta
            elif start >= b:
                pass
            elif a <= start and end <= b:
                s["end"] += delta
            else:
                raise ValueError("Мутация пересекла границу поля")
    return result


def mutate(record, start, end, replacement, operation):
    raw = record["raw_address"]
    new_spans = changed_spans(record["spans"], start, end, replacement)
    new_raw = raw[:start] + replacement + raw[end:]
    event = {"operation": operation, "start": start, "end": end,
             "before": raw[start:end], "after": replacement,
             "input_sha256": sha(raw.encode()), "output_sha256": sha(new_raw.encode())}
    record["raw_address"], record["spans"] = new_raw, new_spans
    for field, entries in new_spans.items():
        if entries and all(s["transform"] == "identity" for s in entries):
            values = {new_raw[s["start"]:s["end"]] for s in entries}
            if len(values) != 1:
                raise ValueError("Мутация нарушила равенство повторов")
            record["expected"][field] = values.pop()
    record["lineage"].append(event)


def patch(record, values, spans=None):
    fields = list(values)
    return {"expected": values,
            "origin": {f: ("absent" if values[f] is None else record["origin"][f]) for f in fields},
            "spans": {f: ([] if values[f] is None else copy.deepcopy(
                (spans or {}).get(f, record["spans"][f]))) for f in fields}}


def add_policies(record, config):
    province = record["expected"]["province"]
    forms = config["named_province_forms"]
    if province in forms:
        alt_spans = copy.deepcopy(record["spans"]["province"])
        for s in alt_spans:
            s["transform"] = "province_official"
        record["ambiguity"].append({"kind": "policy_sensitivity", "policy": "province_name_policy",
            "fields": ["province"], "reason": "до ответа организаторов",
            "alternatives": [patch(record, {"province": forms[province]["official"]},
                                   {"province": alt_spans})]})
        record["tags"].append("province_name_policy")
    if "corpus_policy" in record["tags"]:
        s = copy.deepcopy(record["spans"]["house"][0])
        value = record["expected"]["house"]
        base = re.match(r"\d+", value).group()
        s["end"] = s["start"] + len(base)
        record["ambiguity"].append({"kind": "policy_sensitivity", "policy": "corpus_policy",
            "fields": ["house"], "reason": "Оценить отдельно только базовый номер дома",
            "alternatives": [patch(record, {"house": base}, {"house": [s]})]})
    if record["template_family"] == "ambiguous_numbers":
        fields = ["house", "apartment"]
        house_span, apt_span = record["spans"]["house"][0], record["spans"]["apartment"][0]
        span = {"start": house_span["start"], "end": apt_span["end"], "transform": "identity"}
        value = record["raw_address"][span["start"]:span["end"]]
        record["ambiguity"].append({"kind": "unresolved", "policy": "unmarked_pair",
            "fields": fields, "reason": "Два числа без маркеров: дом/квартира либо единый номер",
            "alternatives": [patch(record, {"house": value, "apartment": None}, {"house": [span]})]})
    record["tags"] = sorted(set(record["tags"]))
    unresolved = {f for a in record["ambiguity"] if a["kind"] == "unresolved" for f in a["fields"]}
    record["supervision_fields"] = [f for f in FIELDS if f not in unresolved]


def choose_base(rng, family, index, pool):
    locality_pool = pool["settlements"] if index % 9 == 0 else pool["cities"]
    city = rng.choice(locality_pool)
    street = rng.choice(pool["numeric"] if family == "numeric_street" else pool["streets"])
    area, district = rng.choice(pool["areas"]), rng.choice(pool["districts"])
    base = {"family": family, "city": city["city"], "province": city["province"],
            "city_id": city["id"], "city_kind": city["type"], "city_kk": city["kk"],
            "street": street["name"], "street_id": street["id"],
            "area": area["name"], "area_id": area["id"],
            "district": district["name"], "district_id": district["id"],
            "house": str(rng.randint(1, 240)), "apartment": str(rng.randint(1, 180)),
            "entrance": str(rng.randint(1, 9)), "floor": str(rng.randint(1, 20)),
            "street_marker": rng.choice(("ул", "ул.", "ул .", "улица", "пр", "пр.", "проспект", "пер.", "переулок", "бульвар", "проезд")),
            "details": [f for f in ("apartment", "entrance", "floor") if rng.random() >= 0.25],
            "landmark": rng.choice(("магазин Береке", "аптека 24", "Qazpost Западный", "магазин Рассвет 🏠"))}
    if family == "fraction":
        base["house"] += "/" + str(rng.randint(1, 9))
    if family == "letter":
        base["house"] += rng.choice(("а", "Б", "A", "ә"))
    if family == "corpus":
        base["house"] += rng.choice((" корп. 3", " корпус Б", "к2"))
    if index % 13 == 0:
        base["apartment"] = "0" + base["apartment"]
    if index % 17 == 0:
        base["floor"] = "-1"
    return base


def render(base, index, pool, config):
    family = base["family"]
    b = RecordBuilder()
    tags = [family, "synthetic"]
    if family != "empty":
        tags.append("kk_markers" if family == "kk_markers" else "ru_markers")
    if family == "corpus":
        tags.append("corpus_policy")
    if base["apartment"].startswith("0") and ("apartment" in base["details"] or family == "ambiguous_numbers") and family not in ("empty", "city_only"):
        tags.append("leading_zero")
    if base["floor"] == "-1" and "floor" in base["details"] and family not in ("empty", "city_only", "ambiguous_numbers"):
        tags.append("negative_floor")
    if family == "empty":
        pass
    else:
        if family == "explicit_province":
            province = base["province"]
            if province in config["named_province_forms"]:
                surfaces = [k for k, v in config["named_province_forms"].items() if v["canonical"] == province]
                surface = surfaces[index % len(surfaces)]
                transform = "province_canonical"
            elif province.endswith(" область") and index % 2:
                surface = "область " + province[:-8]
                transform = "province_order"
            else:
                surface, transform = province, "identity"
            b.add(surface, "province", transform, province)
            b.add(", ")
        if family != "no_city":
            if family == "bilingual_city":
                b.add(base["city_kk"] + "/")
            marker = "г." if base["city_kind"] == "city" else ("с." if base["city_kind"] == "rural_locality" else "пос.")
            if family == "kk_markers":
                b.marked(base["city"], "city", "қаласы" if base["city_kind"] == "city" else "ауылы", True)
            else:
                b.marked(base["city"], "city", marker)
            if family == "duplicate_city":
                b.add(", ")
                b.marked(base["city"], "city", marker)
            if b.expected["province"] is None and pool["name_provinces"][base["city"]] == {base["province"]}:
                b.expected["province"], b.origin["province"] = base["province"], "inferred"
            if family != "city_only":
                b.add(", ")
        if family != "city_only":
            if family == "district":
                b.marked(base["district"], "district", "район")
                b.add(", ")
            if family in ("micro_street", "jk_street"):
                b.marked(base["area"], "living_area", "ЖК" if family == "jk_street" else "мкр.")
                b.add(", ")
            if family == "reorder" and "apartment" in base["details"]:
                b.marked(base["apartment"], "apartment", "кв.")
                b.add(", ")
            marker = base["street_marker"]
            name = base["street"]
            if family == "micro_only":
                marker, name = ("квартал", "мкр.", "шағын аудан")[index % 3], base["area"]
            if family == "kk_markers":
                marker = "көшесі" if index % 2 else "даңғылы"
            if family == "latin_markers":
                marker = "street" if index % 2 else "st"
            postfix = family in ("postfix", "kk_markers")
            gap = "" if family == "glued" else " "
            if family == "unmarked_street":
                b.add(name, "street_name")
            elif postfix:
                b.add(name, "street_name")
                b.add(gap)
                b.add(marker, "street_type", "street_type", config["street_type_markers"][marker])
            else:
                b.add(marker, "street_type", "street_type", config["street_type_markers"][marker])
                b.add(gap)
                b.add(name, "street_name")
            b.add(", ")
            if family == "ambiguous_numbers":
                b.add(base["house"], "house")
                b.add(" ")
                b.add(base["apartment"], "apartment")
                tags.append("unresolved")
            else:
                number_markers = ("үй", "пәтер", "кіреберіс", "қабат") if family == "kk_markers" else (
                    ("house", "apt", "entrance", "floor") if family == "latin_markers" else
                    ("дом", "кв.", "подъезд", "этаж"))
                for pos, field in enumerate(("house", "apartment", "entrance", "floor")):
                    if family == "reorder" and field == "apartment":
                        continue
                    if field != "house" and field not in base["details"]:
                        continue
                    if pos:
                        b.add("" if family == "glued" else ", ")
                    b.marked(base[field], field, number_markers[pos], postfix or family == "glued", family == "glued")
            if family == "landmark":
                b.add(", возле ")
                b.add(base["landmark"], "landmark")
                b.add(", позвонить перед доставкой")
    group_basis = {k: base[k] for k in ("city", "street", "house")}
    if family == "no_city":
        group_basis["city"] = None
    if family == "micro_only":
        group_basis["street"] = base["area"]
    if family == "city_only":
        group_basis = {"city": base["city"]}
    if family == "empty":
        group_basis = {"empty": True}
    entity = "train:entity:" + digest(group_basis)[:24]
    record = {"schema_version": "1.0.0", "spec_version": "1.1", "synthetic": True,
              "status": "candidate_pending_independent_overlap_check", "split": "train",
              "record_key": "", "raw_address": b.raw, "expected": b.expected, "origin": b.origin,
              "spans": b.spans, "ambiguity": [], "template_family": family,
              "entity_group": entity, "source_group": entity, "tags": tags,
              "lineage": [{"operation": "render", "assignment": "train_before_mutations",
                           "base_id": "train:base:" + digest(base)[:24], "base": base,
                           "raw_address": b.raw, "spans": copy.deepcopy(b.spans),
                           "expected": copy.deepcopy(b.expected), "origin": copy.deepcopy(b.origin),
                           "output_sha256": sha(b.raw.encode())}]}
    return record


def apply_noise(record, variant, index):
    family = record["template_family"]
    if family == "empty":
        if variant:
            mutate(record, 0, 0, " \t\u00a0", "empty_whitespace")
        return
    spans = record["spans"]["street_name"]
    if spans and family in ("unicode_cf", "typo", "case", "unicode_space"):
        s = spans[0]
        value = record["expected"]["street_name"]
        if family == "unicode_cf":
            text = value[:1] + ("\u200b" if variant else "\u200d") + value[1:]
            operation = "insert_format_character"
        elif family == "typo":
            mapping = str.maketrans({"а": "a", "о": "o", "е": "e", "А": "A", "О": "O", "Е": "E"})
            if variant:
                text = value.translate(mapping)
            else:
                text = value[:1] + value[1:2] * 2 + value[2:]
            if text == value:
                text = value[:1] + value[0] + value[1:]
            operation = "homoglyph_or_typo"
        elif family == "case":
            text = value.lower() if variant else value.upper()
            operation = "change_case"
        else:
            text = value.replace(" ", "\u00a0" if variant else "\u2009")
            if text == value:
                text = value[:1] + "\u0301" + value[1:]
            operation = "unicode_whitespace_or_combining_mark"
        mutate(record, s["start"], s["end"], text, operation)
    if variant:
        # Меняются только разделители вне размеченных значений.
        raw, entries = record["raw_address"], [s for values in record["spans"].values() for s in values]
        edits = [(m.start(), m.end()) for m in re.finditer(", ", raw)
                 if not any(m.start() < s["end"] and m.end() > s["start"] for s in entries)]
        separator = ("; ", "\n", "  ", "\t")[index % 4]
        for start, end in reversed(edits):
            mutate(record, start, end, separator, "separator_noise")
        mutate(record, 0, 0, "  ", "outer_whitespace")
        mutate(record, len(record["raw_address"]), len(record["raw_address"]), " ", "outer_whitespace")
        record["tags"].append("separator_noise")


def transformed(raw, span, field, config):
    text = raw[span["start"]:span["end"]]
    transform = span["transform"]
    if transform == "identity":
        return text
    if transform == "street_type" and field == "street_type":
        return config["street_type_markers"][text]
    if transform == "province_order" and field == "province" and text.startswith("область "):
        return text[8:] + " область"
    if transform in ("province_canonical", "province_official") and field == "province":
        return config["named_province_forms"][text]["canonical" if transform.endswith("canonical") else "official"]
    raise ValueError("Недопустимое преобразование интервала")


def validate_labels(raw, expected, origin, spans, config):
    assert set(expected) == set(origin) == set(spans) == set(FIELDS)
    occupied = []
    for field in FIELDS:
        value, source, entries = expected[field], origin[field], spans[field]
        assert value is None or isinstance(value, str) and value.strip()
        assert source in ("absent", "inferred", "explicit")
        assert isinstance(entries, list)
        if source == "absent":
            assert value is None and not entries
        elif source == "inferred":
            assert value is not None and not entries and field == "province"
        else:
            assert value is not None and entries
        for s in entries:
            assert set(s) == {"start", "end", "transform"}
            assert type(s["start"]) is int and type(s["end"]) is int
            assert 0 <= s["start"] < s["end"] <= len(raw)
            assert transformed(raw, s, field, config) == value, (field, value, s)
            assert not raw[s["start"]].isspace() and not raw[s["end"] - 1].isspace()
            occupied.append((s["start"], s["end"], field))
    occupied.sort()
    for left, right in zip(occupied, occupied[1:]):
        assert left[1] <= right[0], (left, right)


def validate_record(record, config):
    raw = record["raw_address"]
    validate_labels(raw, record["expected"], record["origin"], record["spans"], config)
    for a in record["ambiguity"]:
        assert a["kind"] in ("unresolved", "policy_sensitivity") and a["reason"]
        for alt in a["alternatives"]:
            assert set(alt) == {"expected", "origin", "spans"}
            assert all(set(alt[k]) == set(a["fields"]) for k in alt)
            merged = {k: dict(record[k], **alt[k]) for k in alt}
            validate_labels(raw, **merged, config=config)
    first = record["lineage"][0]
    replay, spans = first["raw_address"], copy.deepcopy(first["spans"])
    assert sha(replay.encode()) == first["output_sha256"]
    assert first["assignment"] == "train_before_mutations"
    for event in record["lineage"][1:]:
        start, end = event["start"], event["end"]
        assert sha(replay.encode()) == event["input_sha256"]
        assert replay[start:end] == event["before"]
        replay = replay[:start] + event["after"] + replay[end:]
        spans = changed_spans(spans, start, end, event["after"])
        assert sha(replay.encode()) == event["output_sha256"]
    assert replay == raw and spans == record["spans"]


def normalize_for_duplicates(text):
    return " ".join("".join(c for c in text.lower() if not unicodedata.category(c).startswith("P")).split())


def make_records(seed, count, pool, config):
    if count < 5000 or count > 10000 or count % 2:
        raise ValueError("Размер должен быть чётным, от 5000 до 10000")
    rng, records = random.Random(seed), []
    groups = count // 2 - 25
    plans = [(FAMILIES[i % len(FAMILIES)], i) for i in range(groups)]
    seen_base = set()
    for family, index in plans:
        for _ in range(1000):
            base = choose_base(rng, family, index, pool)
            canonical = (base["city"] if family != "no_city" else None,
                         base["area"] if family == "micro_only" else base["street"], base["house"])
            if canonical not in seen_base:
                seen_base.add(canonical)
                break
        else:
            raise ValueError("Не удалось выбрать уникальную основу")
        template = render(base, index, pool, config)
        for variant in range(2):
            r = copy.deepcopy(template)
            r["variant"] = variant
            apply_noise(r, variant, index)
            add_policies(r, config)
            records.append(r)
    for i in range(25):
        base = choose_base(rng, "city_only" if i < 24 else "empty", i, pool)
        if i < 24:
            city = pool["cities"][i]
            base.update(city=city["city"], city_id=city["id"], city_kind="city",
                        province=city["province"], city_kk=city["kk"])
        template = render(base, i, pool, config)
        for variant in range(2):
            r = copy.deepcopy(template)
            r["variant"] = variant
            apply_noise(r, variant, i)
            add_policies(r, config)
            records.append(r)
    for pos, record in enumerate(records):
        record["record_key"] = f"{VERSION}-{pos + 1:06d}"
        validate_record(record, config)
    assert len(records) == count
    return records


def audit(records, split, config):
    for record in records:
        validate_record(record, config)
    keys = [r["record_key"] for r in records]
    assert len(keys) == len(set(keys))
    public_keys = {k for data in split["splits"].values() for k in data["record_keys"]}
    assert not set(keys) & public_keys
    raw = Counter(r["raw_address"] for r in records)
    normalized = defaultdict(set)
    for r in records:
        normalized[normalize_for_duplicates(r["raw_address"])].add(r["entity_group"])
    assert all(len(groups) == 1 for groups in normalized.values()), "Дубли в разных группах train"
    counts = Counter(r["entity_group"] for r in records)
    assert all(n == 2 for n in counts.values())
    policies = Counter(a["policy"] for r in records for a in r["ambiguity"])
    return {"records": len(records), "entity_groups": len(counts),
            "source_groups": len({r["source_group"] for r in records}),
            "rows_per_entity_group": {str(k): v for k, v in sorted(Counter(counts.values()).items())},
            "families": dict(sorted(Counter(r["template_family"] for r in records).items())),
            "tags": dict(sorted(Counter(t for r in records for t in r["tags"]).items())),
            "policies": dict(sorted(policies.items())),
            "origin_counts": {f: dict(Counter(r["origin"][f] for r in records)) for f in FIELDS},
            "unique_city_values": len({r["expected"]["city"] for r in records if r["expected"]["city"]}),
            "unique_street_values": len({r["expected"]["street_name"] for r in records if r["expected"]["street_name"]}),
            "exact_duplicate_rows": sum(v - 1 for v in raw.values()),
            "normalized_duplicate_rows": len(records) - len(normalized),
            "cross_group_normalized_duplicates": 0,
            "public_record_key_overlap": 0,
            "closed_entity_overlap": None,
            "closed_overlap_status": "pending_independent_evaluator",
            "public_manifest_limitation": "entity_groups is a count; no entity/source identifiers or address fingerprints",
            "span_checks": "passed_main_alternatives_and_lineage_replay",
            "annotation_quality": "self_checked_synthetic_not_independent_gold"}


def select_review(records):
    buckets = defaultdict(list)
    for r in records:
        buckets[r["template_family"]].append(r)
    result = []
    for family in FAMILIES:
        group = buckets[family]
        for pos in (0, 3, len(group) // 2, len(group) - 1):
            result.append(group[pos])
    result += buckets["city_only"][:2] + buckets["empty"]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--out", default="datasets/train/v004")
    parser.add_argument("--seed", type=int, default=20261017)
    parser.add_argument("--count", type=int, default=6000)
    parser.add_argument("--verify", type=Path, help="Проверить существующий выпуск без записи")
    parser.add_argument("--replay-manifest", type=Path, help="Проверить хеши и повторить параметры выпуска")
    args = parser.parse_args()
    root = args.root.resolve()
    config, split, hashes, pool = load_inputs(root)
    source_hash = sha(Path(__file__).read_bytes())
    if args.verify:
        location = (root / args.verify).resolve()
        location.relative_to(root / "datasets" / "train")
        manifest = read_json(location / "manifest.json")
        assert manifest["input_hashes"] == hashes
        assert manifest["generator_sha256"] == source_hash
        for name, expected in manifest["output_sha256"].items():
            target = (location / name).resolve()
            target.relative_to(location)
            assert sha(target.read_bytes()) == expected, name
        records = [json.loads(line) for line in (location / "train.jsonl").read_text(encoding="utf-8").splitlines()]
        statistics = audit(records, split, config)
        assert statistics == read_json(location / "coverage.json")
        inputs = read_json(location / "input.json")
        assert len(inputs) == len(records)
        for pos, (item, record) in enumerate(zip(inputs, records)):
            assert item == {"id": pos // 2, "raw_address": record["raw_address"]}
        print(json.dumps({"verified": len(records), "closed_overlap": "pending"}))
        return
    if args.replay_manifest:
        manifest_path = (root / args.replay_manifest).resolve()
        manifest_path.relative_to(root / "datasets" / "train")
        manifest = read_json(manifest_path)
        assert manifest["input_hashes"] == hashes
        assert manifest["generator_sha256"] == source_hash
        args.seed, args.count = manifest["seed"], manifest["records"]
    out = (root / args.out).resolve()
    out.relative_to(root / "datasets" / "train")
    if out.exists():
        raise FileExistsError(f"Выпуск уже существует: {out}; выберите новый --out")
    start = time.perf_counter()
    records = make_records(args.seed, args.count, pool, config)
    statistics = audit(records, split, config)
    out.mkdir(parents=True)
    write_jsonl(out / "train.jsonl", records)
    write_json(out / "input.json", [{"id": i // 2, "raw_address": r["raw_address"]} for i, r in enumerate(records)])
    write_json(out / "coverage.json", statistics)
    review = select_review(records)
    write_jsonl(out / "review_104.jsonl", review)
    lines = ["# Выборочный просмотр: 104 строки", "", "repr сохраняет видимость Unicode и переносов.", ""]
    for i, r in enumerate(review, 1):
        lines += [f"## {i}. {r['record_key']} · {r['template_family']}",
                  "", repr(r["raw_address"]), "", json.dumps(r["expected"], ensure_ascii=False),
                  "", "ambiguity: " + json.dumps(r["ambiguity"], ensure_ascii=False), ""]
    (out / "review_104.md").write_text("\n".join(lines), encoding="utf-8")
    source_ids = {r["entity_group"]: {"source_group": r["source_group"],
                  "base": r["lineage"][0]["base"], "base_id": r["lineage"][0]["base_id"],
                  "raw_sha256": [], "record_keys": []} for r in records}
    for r in records:
        source_ids[r["entity_group"]]["raw_sha256"].append(sha(r["raw_address"].encode()))
        source_ids[r["entity_group"]]["record_keys"].append(r["record_key"])
    write_json(out / "group_manifest.json", {"split": "train", "assignment": "before_mutations", "groups": source_ids})
    names = ("train.jsonl", "input.json", "coverage.json", "review_104.jsonl", "review_104.md", "group_manifest.json")
    manifest = {"release": VERSION, "schema_version": "1.0.0", "spec_version": "1.1",
                "status": "candidate_pending_independent_overlap_check", "synthetic": True,
                "seed": args.seed, "records": len(records), "path_base": "project_root",
                "display_profile": "project", "inputs": INPUTS, "input_hashes": hashes,
                "generator": "AddressParser/generate_train.py", "generator_sha256": source_hash,
                "python": platform.python_version(), "dependencies": "Python standard library",
                "span_unit": "unicode_code_point", "grouping": "canonical base before mutations; two variants per entity",
                "supervision": "exclude unresolved fields listed by ambiguity; use supervision_fields",
                "validation": statistics["span_checks"], "closed_overlap_check": "pending_independent_evaluator",
                "manual_review": "see datasets/train/REPORT.md; selection is not a review result",
                "output_sha256": {name: sha((out / name).read_bytes()) for name in names}}
    write_json(out / "manifest.json", manifest)
    command = (f"python -B AddressParser/generate_train.py --replay-manifest {out.relative_to(root).as_posix()}/manifest.json "
               "--out datasets/train/reproduced-v004")
    (out / "REPRODUCE.txt").write_text(
        "Рабочая папка: корень проекта; пути относительно него.\n" + command + "\n" +
        f"python -B AddressParser/generate_train.py --verify {out.relative_to(root).as_posix()}\n" +
        "Существующие каталоги не перезаписываются. Для нового запуска выбирайте свободный --out.\n",
        encoding="utf-8")
    write_json(out / "run_environment.json", {"python": sys.version, "platform": platform.platform(),
        "cpu_count": os.cpu_count(), "duration_seconds": round(time.perf_counter() - start, 3),
        "network_required": False, "gpu_required": False})
    print(json.dumps({"output": out.relative_to(root).as_posix(), "records": len(records),
                      "groups": statistics["entity_groups"], "duration_seconds": round(time.perf_counter() - start, 3)}))


if __name__ == "__main__":
    main()
