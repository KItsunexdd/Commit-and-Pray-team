"""Validate graph references and the source-to-apartment import contract."""
import collections
import datetime as dt
import json
import pathlib
import hashlib
from openpyxl import load_workbook

ROOT = pathlib.Path(__file__).resolve().parent
DATA = ROOT.parent


def main():
    from build_dataset import number_key
    assert number_key("1/2") != number_key("12")
    assert number_key("12-1") != number_key("121")
    assert number_key("12a") != number_key("12а")
    dataset = json.loads((DATA / "kazakhstan_addresses.json").read_text(encoding="utf-8"))
    entities = dataset["entities"]
    by_id = {e["id"]: e for e in entities}
    sources = {s["id"] for s in dataset["sources"]}
    errors = []
    if len(entities) != len(by_id): errors.append("duplicate_entity_id")
    if len([e for e in entities if e["type"] == "country"]) != 1: errors.append("country_root_count")
    if len([e for e in entities if e["parent_id"] == "country:KZ"]) != 20: errors.append("top_level_unit_count")
    source_kato = {"kato:" + str(r[0]): r for r in list(load_workbook((ROOT / "raw/stat_kato_xlsx.bin").open("rb"), data_only=True, read_only=True).active.values)[1:] if r[0]}
    if {e["id"] for e in entities if e["id"].startswith("kato:")} != set(source_kato): errors.append("kato_source_rows_not_preserved")
    for e in entities:
        for field in ["parent_id", "locality_id", "address_object_id", "building_id", "entrance_id"]:
            if e.get(field) is not None and e[field] not in by_id: errors.append(["dangling_reference", e["id"], field, e[field]])
        for sid in [r["source_id"] for r in e["source_refs"]]:
            if sid not in sources: errors.append(["unknown_source", e["id"], sid])
        for candidate in e.get("parent_candidates", []):
            if candidate["entity_id"] not in by_id: errors.append(["dangling_parent_candidate", e["id"]])
        if e["id"] in source_kato:
            row = source_kato[e["id"]]
            if e["names"]["ru"] != row[7] or e["names"]["kk"] != row[6]: errors.append(["kato_names_changed", e["id"]])
        if e["type"] in {"apartment", "nonresidential_premise", "premise_unknown"}:
            if not isinstance(e.get("number"), str) or not e["number"]: errors.append(["bad_premise_number", e["id"]])
            if by_id[e["building_id"]]["type"] != "building": errors.append(["premise_parent_not_building", e["id"]])
        if e["type"] == "apartment" and e["source_room_type"]["id"] != 1: errors.append(["apartment_type_not_checked", e["id"]])
        if e["type"] == "building":
            for field in ["apartment_data", "entrance_data", "building_kind", "active_status"]:
                if field not in e: errors.append(["missing_building_status", e["id"], field])
    # Parent links must be acyclic. Only the country can have no parent.
    resolved = set()
    for e in entities:
        seen = set()
        current = e["id"]
        while current and current not in resolved:
            if current in seen:
                errors.append(["parent_cycle", current])
                break
            seen.add(current)
            current = by_id[current]["parent_id"] if current in by_id else None
        resolved.update(seen)
    for alias in dataset["historical_names"]:
        if alias["target_id"] not in by_id: errors.append(["dangling_alias", alias["id"]])
    for relation in dataset["relations"]:
        if relation["from_id"] not in by_id or relation["to_id"] not in by_id: errors.append(["dangling_relation", relation])
    # Every premise ID must actually occur in a downloaded source list.
    source_premises = {}
    source_buildings = {}
    for filename in ["karaganda_flats.json", "karaganda_flats_extended.json"]:
        for record in json.loads((ROOT / filename).read_text(encoding="utf-8")):
            for f in record["features"]:
                source_premises["rka:" + f["id"]] = str(f["properties"]["number"])
                source_buildings["rka:" + f["id"]] = "rka:" + record["building_rca"]
    active_by_building = collections.defaultdict(set)
    for e in entities:
        if e["type"] not in {"apartment", "nonresidential_premise", "premise_unknown"}: continue
        if source_premises.get(e["id"]) != e["number"]: errors.append(["invented_or_modified_premise_number", e["id"]])
        if source_buildings.get(e["id"]) != e["building_id"]: errors.append(["premise_parent_differs_from_source", e["id"]])
        if e["type"] == "apartment" and e["active_status"] == "active_in_source_snapshot": active_by_building[e["building_id"]].add(e["number"])
    examples = []
    for e in entities:
        if e["type"] != "building" or "apartment_numbers" not in e["apartment_data"]: continue
        if set(e["apartment_data"]["apartment_numbers"]) != active_by_building[e["id"]]: errors.append(["apartment_index_not_equal_to_active_source_numbers", e["id"]])
        if e["apartment_data"].get("source_premise_count") == 130:
            examples.append({"building_id": e["id"], "source_premises": 130,
                             "active_apartments": e["apartment_data"]["apartment_count"],
                             "unique_active_apartment_numbers": len(e["apartment_data"]["apartment_numbers"]),
                             "number_131_listed": "131" in e["apartment_data"]["apartment_numbers"],
                             "building_active_status": e["active_status"]})
    report = {"validated_at": dt.datetime.now(dt.timezone.utc).isoformat(), "passed": not errors,
              "artifact_sha256": hashlib.file_digest((DATA / "kazakhstan_addresses.json").open("rb"), "sha256").hexdigest(),
              "error_count": len(errors), "errors": errors,
              "checks": ["valid_json", "unique_ids", "one_country_and_20_top_units", "all_kato_rows_and_bilingual_names_preserved", "foreign_keys", "source_references", "acyclic_parents",
                         "historical_name_targets", "premise_numbers_and_parent_ids_equal_downloaded_source", "active_apartment_index_excludes_inactive_and_nonresidential_units"],
              "entity_counts": dict(collections.Counter(e["type"] for e in entities)),
              "active_apartment_records": sum(e["type"] == "apartment" and e["active_status"] == "active_in_source_snapshot" for e in entities),
              "inactive_apartment_records": sum(e["type"] == "apartment" and e["active_status"] == "inactive_in_source_snapshot" for e in entities),
              "buildings_with_enumerated_premises": sum(e["type"] == "building" and "apartment_numbers" in e["apartment_data"] for e in entities),
              "buildings_corroborated_by_osm": sum(e["type"] == "building" and e["verification"] == "address_and_location_corroborated_by_osm" for e in entities),
              "entrances_with_unique_building_link": sum(e["type"] == "entrance" and e.get("building_id") is not None for e in entities),
              "conflict_records": len(dataset["conflicts"]), "examples_source_count_130": examples,
              "real_world_existence_independently_certified": False}
    (ROOT / "validation_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors: raise SystemExit(1)


if __name__ == "__main__": main()
