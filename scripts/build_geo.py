"""Сборка геоданных для карты: границы регионов Казахстана и список городов.

Источник: OpenStreetMap (© участники OpenStreetMap, лицензия ODbL).
Нужны интернет и Node.js (упрощение границ делает mapshaper через npx).

Запуск из корня репозитория:
    python scripts/build_geo.py
    python scripts/build_geo.py --simplify 4%

Результат пишется в data/geo/, сырые выгрузки кэшируются в data/raw/geo/.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "geo"
RAW = ROOT / "data" / "raw" / "geo"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
POLYGON_URL = "https://polygons.openstreetmap.fr/get_geojson.py?id={id}&params=0"
MAPSHAPER = "mapshaper@0.7.87"
USER_AGENT = "jana-address-geo/0.1"

KZ_AREA = 'area["ISO3166-1"="KZ"]["admin_level"="2"]->.kz;'
REGIONS_QUERY = f'[out:json][timeout:120];{KZ_AREA}rel(area.kz)["boundary"="administrative"]["admin_level"="4"];out tags;'
CITIES_QUERY = f'[out:json][timeout:180];{KZ_AREA}node(area.kz)["place"~"^(city|town)$"];out body;'

# Административные центры регионов (после реформы 2022 года).
REGION_CENTERS = {
    "KZ-10": "Семей",
    "KZ-11": "Кокшетау",
    "KZ-15": "Актобе",
    "KZ-19": "Конаев",
    "KZ-23": "Атырау",
    "KZ-27": "Уральск",
    "KZ-31": "Тараз",
    "KZ-33": "Талдыкорган",
    "KZ-35": "Караганда",
    "KZ-39": "Костанай",
    "KZ-43": "Кызылорда",
    "KZ-47": "Актау",
    "KZ-55": "Павлодар",
    "KZ-59": "Петропавловск",
    "KZ-61": "Туркестан",
    "KZ-62": "Жезказган",
    "KZ-63": "Усть-Каменогорск",
    "KZ-71": "Астана",
    "KZ-75": "Алматы",
    "KZ-79": "Шымкент",
}

# Исправления названий из OSM и дополнительные варианты для поиска.
REGION_NAME_FIX = {"KZ-62": "Улытауская область"}
REGION_ALIASES = {
    "KZ-10": ["область Абай"],
    "KZ-27": ["ЗКО"],
    "KZ-33": ["область Жетісу", "область Жетысу"],
    "KZ-59": ["СКО"],
    "KZ-61": ["Южно-Казахстанская область", "ЮКО"],
    "KZ-62": ["область Ұлытау", "область Улытау", "Улутауская область"],
    "KZ-63": ["ВКО"],
}

# Старые и разговорные названия городов.
CITY_ALIASES = {
    "Алматы": ["Алма-Ата"],
    "Астана": ["Нур-Султан", "Нұр-Сұлтан", "Целиноград", "Акмола"],
    "Шымкент": ["Чимкент"],
    "Актобе": ["Актюбинск"],
    "Атырау": ["Гурьев"],
    "Актау": ["Шевченко"],
    "Конаев": ["Капчагай", "Капшагай", "Қапшағай"],
    "Семей": ["Семипалатинск"],
    "Уральск": ["Орал"],
    "Петропавловск": ["Петропавл"],
    "Усть-Каменогорск": ["Оскемен", "Өскемен"],
    "Тараз": ["Джамбул", "Аулие-Ата"],
    "Кокшетау": ["Кокчетав"],
    "Костанай": ["Кустанай"],
    "Кызылорда": ["Кзыл-Орда"],
    "Талдыкорган": ["Талды-Курган"],
    "Жезказган": ["Джезказган"],
    "Алтай": ["Зыряновск"],
    "Жанаозен": ["Новый Узень"],
}


def fetch(url: str, data: bytes | None = None, attempts: int = 3) -> bytes:
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=300) as resp:
                return resp.read()
        except Exception as exc:  # сеть и перегруженный Overpass
            if attempt == attempts:
                raise
            print(f"  повтор {attempt}: {exc}")
            time.sleep(5 * attempt)
    raise RuntimeError("unreachable")


def overpass(query: str, cache: Path) -> dict:
    if not cache.exists():
        body = urllib.parse.urlencode({"data": query}).encode()
        cache.write_bytes(fetch(OVERPASS_URL, body))
    return json.loads(cache.read_text(encoding="utf-8"))


def norm(text: str) -> str:
    return re.sub(r"[^0-9a-zа-яёәғқңөұүһі]", "", text.lower()).replace("ё", "е")


def rings(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    if geometry["type"] == "MultiPolygon":
        return [ring for poly in geometry["coordinates"] for ring in poly]
    return []


def contains(geometry: dict, lon: float, lat: float) -> bool:
    """Точка внутри полигона: правило чётности по всем кольцам, дырки учитываются сами."""
    inside = False
    for ring in rings(geometry):
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
    return inside


def ring_contains(ring: list[list[float]], lon: float, lat: float) -> bool:
    return contains({"type": "Polygon", "coordinates": [ring]}, lon, lat)


def fix_holes(geometry: dict) -> dict:
    """Собирает дыры по вложенности колец.

    Сервис полигонов OSM отдаёт анклавы (например, Астану внутри Акмолинской области)
    отдельными полигонами, а не дырками. Кольцо внутри нечётного числа других колец — дыра.
    """
    all_rings = rings(geometry)
    parents = []
    for i, ring in enumerate(all_rings):
        lon, lat = ring[0]
        outer = [j for j, other in enumerate(all_rings) if j != i and ring_contains(other, lon, lat)]
        parents.append(outer)
    polygons: dict[int, list] = {i: [r] for i, r in enumerate(all_rings) if len(parents[i]) % 2 == 0}
    for i, ring in enumerate(all_rings):
        if len(parents[i]) % 2 == 1:
            host = min((j for j in parents[i] if j in polygons), key=lambda j: ring_area(all_rings[j]))
            polygons[host].append(ring)
    return {"type": "MultiPolygon", "coordinates": list(polygons.values())}


def first_geometry(collection: dict) -> dict:
    if "features" in collection:
        return collection["features"][0]["geometry"]
    if "geometries" in collection:
        return collection["geometries"][0]
    return collection.get("geometry", collection)


def bbox(geometry: dict) -> list[float]:
    xs = [p[0] for ring in rings(geometry) for p in ring]
    ys = [p[1] for ring in rings(geometry) for p in ring]
    return [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)]


def ring_area(ring: list[list[float]]) -> float:
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:]))) / 2


def mapshaper(*args: str) -> None:
    npx = shutil.which("npx")
    if not npx:
        sys.exit("Нужен Node.js: команда npx не найдена")
    subprocess.run([npx, "-y", MAPSHAPER, *args], check=True)


def build_regions(simplify: str) -> list[dict]:
    print("Регионы: список из OSM")
    tags = overpass(REGIONS_QUERY, RAW / "regions_tags.json")
    regions = []
    for el in tags["elements"]:
        t = el.get("tags", {})
        iso = t.get("ISO3166-2", "")
        if not iso.startswith("KZ-"):
            continue
        name_ru = REGION_NAME_FIX.get(iso, t.get("name:ru") or t["name"])
        regions.append(
            {
                "id": iso,
                "osm_id": el["id"],
                "name_ru": name_ru,
                "name_kz": t.get("name:kk") or t.get("name"),
                "name_en": t.get("name:en"),
                "kind": "oblast" if "облыс" in (t.get("name") or "") else "city",
            }
        )
    regions.sort(key=lambda r: r["id"])
    if len(regions) != 20:
        print(f"  ВНИМАНИЕ: ожидалось 20 регионов, получено {len(regions)}")

    print(f"Регионы: границы ({len(regions)} шт.)")
    features = []
    for r in regions:
        cache = RAW / f"region_{r['osm_id']}.json"
        if not cache.exists():
            cache.write_bytes(fetch(POLYGON_URL.format(id=r["osm_id"])))
            time.sleep(1)
        geometry = json.loads(cache.read_text(encoding="utf-8"))
        if geometry.get("type") == "GeometryCollection":
            geometry = geometry["geometries"][0]
        geometry = fix_holes(geometry)
        features.append({"type": "Feature", "properties": {"id": r["id"], "name_ru": r["name_ru"], "kind": r["kind"]}, "geometry": geometry})
    full = RAW / "kz-regions-full.geojson"
    full.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")

    print(f"Регионы: упрощение {simplify}")
    regions_file = OUT / "kz-regions.geojson"
    mapshaper(str(full), "-clean", "-simplify", simplify, "keep-shapes", "-o", str(regions_file), "precision=0.0001", "force")
    borders_file = OUT / "kz-region-borders.geojson"
    mapshaper(str(regions_file), "-innerlines", "-o", str(borders_file), "precision=0.0001", "force")
    # Без атрибутов mapshaper пишет GeometryCollection, а карте удобнее FeatureCollection.
    borders = json.loads(borders_file.read_text(encoding="utf-8"))
    if "geometries" in borders:
        borders = {
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": {}, "geometry": g} for g in borders["geometries"]],
        }
        borders_file.write_text(json.dumps(borders, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    country = RAW / "kz-country.geojson"
    mapshaper(str(regions_file), "-dissolve", "-o", str(country), "precision=0.0001", "force")

    # Внешний контур страны одной линией: по ней бежит световой импульс.
    country_geom = first_geometry(json.loads(country.read_text(encoding="utf-8")))
    outer = max((poly[0] for poly in (country_geom["coordinates"] if country_geom["type"] == "MultiPolygon" else [country_geom["coordinates"]])), key=ring_area)
    outline = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"part": "country"}, "geometry": country_geom},
            {"type": "Feature", "properties": {"part": "contour"}, "geometry": {"type": "LineString", "coordinates": outer}},
        ],
    }
    (OUT / "kz-outline.geojson").write_text(json.dumps(outline, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    simplified = json.loads(regions_file.read_text(encoding="utf-8"))
    geom_by_id = {f["properties"]["id"]: f["geometry"] for f in simplified["features"]}
    for r in regions:
        r["geometry"] = geom_by_id[r["id"]]
        r["bbox"] = bbox(r["geometry"])
        r["aliases"] = sorted({r["name_kz"], r["name_en"], r["name_ru"].replace(" область", ""), *REGION_ALIASES.get(r["id"], [])} - {None, r["name_ru"]})
    return regions


def build_cities(regions: list[dict]) -> list[dict]:
    print("Города: города и посёлки городского типа из OSM")
    data = overpass(CITIES_QUERY, RAW / "cities.json")
    cities = []
    for el in data["elements"]:
        t = el.get("tags", {})
        name = t.get("name:ru") or t.get("name")
        if not name:
            continue
        lon, lat = el["lon"], el["lat"]
        region = next((r for r in regions if contains(r["geometry"], lon, lat)), None)
        if region is None:
            continue
        digits = re.sub(r"\D", "", t.get("population", ""))
        cities.append(
            {
                "name": name,
                "name_kz": t.get("name:kk") or t.get("name"),
                "name_en": t.get("name:en"),
                "aliases": [],
                "region_id": region["id"],
                "province": region["name_ru"],
                "kind": t["place"],
                "population": int(digits) if digits else None,
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "is_region_center": False,
                "osm_id": el["id"],
            }
        )

    def names(city: dict) -> set[str]:
        return {norm(v) for v in (city["name"], city["name_kz"], city["name_en"]) if v}

    for r in regions:
        wanted = norm(REGION_CENTERS[r["id"]])
        # Ищем только внутри региона: в Карагандинской области тоже есть посёлок Актау.
        center = next((c for c in cities if c["region_id"] == r["id"] and wanted in names(c)), None)
        if center is None:
            in_region = [c for c in cities if c["region_id"] == r["id"]]
            center = max(in_region, key=lambda c: c["population"] or 0) if in_region else None
            print(f"  ВНИМАНИЕ: центр {REGION_CENTERS[r['id']]} для {r['id']} не найден по имени, взят {center and center['name']}")
        if center:
            center["is_region_center"] = True
            r["center"] = {"name": center["name"], "lat": center["lat"], "lon": center["lon"]}

    for c in cities:
        extra = CITY_ALIASES.get(c["name"], [])
        c["aliases"] = sorted({c["name_kz"], c["name_en"], *extra} - {None, c["name"]})

    cities.sort(key=lambda c: (not c["is_region_center"], -(c["population"] or 0), c["name"]))
    return cities


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--simplify", default="10%", help="доля точек, которая остаётся после упрощения границ")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)

    regions = build_regions(args.simplify)
    cities = build_cities(regions)

    index = [{k: r[k] for k in ("id", "name_ru", "name_kz", "name_en", "kind", "aliases", "center", "bbox") if k in r} for r in regions]
    (OUT / "kz-regions.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    (OUT / "kz-cities.json").write_text(json.dumps(cities, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    print("Готово:")
    for path in sorted(OUT.glob("kz-*")):
        print(f"  {path.relative_to(ROOT)}  {path.stat().st_size / 1024:.0f} КБ")
    print(f"  регионов: {len(regions)}, городов: {len(cities)}, центров: {sum(c['is_region_center'] for c in cities)}")


if __name__ == "__main__":
    main()
