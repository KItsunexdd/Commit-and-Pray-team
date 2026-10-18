"""Extract source observations, not guessed addresses, from the Kazakhstan PBF.

Install osmium and shapely in a Python environment or the temporary vendor folder.
This stage preserves OSM identifiers and tags. City membership is resolved later
against the extracted administrative boundaries, not assumed from a bounding box.
"""
import collections
import datetime as dt
import json
import os
import pathlib
import sys

VENDOR = pathlib.Path(os.environ.get("TEMP", "/tmp")) / "jana-address-vendor"
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))
import osmium

ROOT = pathlib.Path(__file__).resolve().parent
PBF = ROOT / "raw/osm_kazakhstan_pbf.bin"
BBOX = {
    "astana": (70.5, 50.7, 72.3, 51.8),
    "almaty": (76.4, 42.8, 77.5, 43.8),
    "karaganda": (72.7, 49.5, 73.6, 50.2),
}


def regions(lon, lat):
    return [key for key, (x1, y1, x2, y2) in BBOX.items() if x1 <= lon <= x2 and y1 <= lat <= y2]


class Extractor(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.items = []
        self.settlements = []
        self.boundaries = []
        self.counts = collections.Counter()
        self.factory = osmium.geom.GeoJSONFactory()

    def node(self, obj):
        if not obj.location.valid():
            return
        tags = dict(obj.tags)
        lon, lat = obj.location.lon, obj.location.lat
        if tags.get("place") in {"city", "town", "village", "hamlet", "isolated_dwelling"}:
            self.settlements.append({"osm_type": "node", "osm_id": obj.id, "tags": tags, "point": [lon, lat]})
        scope = regions(lon, lat)
        if not scope:
            return
        if any(key in tags for key in ["addr:housenumber", "addr:flats", "addr:unit", "entrance"]) or tags.get("place") in {"suburb", "quarter", "neighbourhood"}:
            self.items.append({"osm_type": "node", "osm_id": obj.id, "timestamp": obj.timestamp.isoformat(),
                               "tags": tags, "point": [lon, lat], "candidate_cities": scope})
            self.counts["node"] += 1

    def way(self, obj):
        tags = dict(obj.tags)
        if not (tags.get("addr:housenumber") or tags.get("building") or
                (tags.get("highway") and any(k in tags for k in ["name", "name:ru", "name:kk"])) or
                tags.get("place") in {"suburb", "quarter", "neighbourhood"}):
            return
        if not obj.nodes:
            return
        try:
            first = obj.nodes[0].location
            if not first.valid() or not regions(first.lon, first.lat):
                return
            coords = [[node.lon, node.lat] for node in obj.nodes if node.location.valid()]
            if not coords:
                return
            xs, ys = zip(*coords)
            point = [(min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2]
            scope = regions(*point)
            if not scope:
                return
            item = {"osm_type": "way", "osm_id": obj.id, "timestamp": obj.timestamp.isoformat(),
                    "tags": tags, "point": point, "candidate_cities": scope}
            if tags.get("building") and coords[0] == coords[-1]:
                item["polygon"] = coords
            self.items.append(item)
            self.counts["way"] += 1
        except osmium.InvalidLocationError:
            self.counts["invalid_location"] += 1

    def area(self, obj):
        tags = dict(obj.tags)
        if tags.get("boundary") != "administrative" or tags.get("admin_level") not in {"4", "5", "6", "7", "8", "9"}:
            return
        try:
            geom = json.loads(self.factory.create_multipolygon(obj))
            coords = [pt for poly in geom["coordinates"] for ring in poly for pt in ring]
            if not coords:
                return
            xs, ys = zip(*coords)
            if not any(not (max(xs) < b[0] or min(xs) > b[2] or max(ys) < b[1] or min(ys) > b[3]) for b in BBOX.values()):
                return
            self.boundaries.append({"osm_type": "way" if obj.from_way() else "relation", "osm_id": obj.orig_id(),
                                    "tags": tags, "geometry": geom})
        except Exception as exc:
            self.counts["boundary_geometry_errors"] += 1


if __name__ == "__main__":
    source_file = osmium.io.File(str(PBF), "pbf")
    reader = osmium.io.Reader(source_file)
    header = reader.header()
    metadata = {key: header.get(key) for key in ["generator", "osmosis_replication_timestamp", "osmosis_replication_sequence_number"]}
    reader.close()
    handler = Extractor()
    tag_filter = osmium.filter.KeyFilter("addr:housenumber", "addr:flats", "addr:unit", "entrance", "place", "building", "highway", "boundary")
    # Native filtering runs after node locations have been indexed, and before
    # Python callbacks. This avoids invoking Python for millions of untagged nodes.
    handler.apply_file(source_file, locations=True, idx="flex_mem", filters=[tag_filter])
    result = {"source": "https://download.geofabrik.de/asia/kazakhstan-latest.osm.pbf", "header": metadata,
              "extracted_at": dt.datetime.now(dt.timezone.utc).isoformat(), "candidate_bboxes": BBOX,
              "items": handler.items, "settlements": handler.settlements, "boundaries": handler.boundaries,
              "counts": dict(handler.counts)}
    (ROOT / "osm_observations.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"counts": result["counts"], "boundaries": len(handler.boundaries),
                      "settlements": len(handler.settlements), "header": metadata}, ensure_ascii=False), flush=True)
