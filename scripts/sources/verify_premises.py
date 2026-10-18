"""Verify the actual premise type; a portal 'flat' list also contains nonresidential units."""
import concurrent.futures
import datetime as dt
import hashlib
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request
import sys

ROOT = pathlib.Path(__file__).resolve().parent
OUTPUT = ROOT / "karaganda_premise_verification.json"
BUILDINGS = "--buildings" in sys.argv
if BUILDINGS: OUTPUT = ROOT / "karaganda_building_verification.json"
ALLOW = {"id", "number", "actual", "addregtype_id", "roomtype_id", "roomtype_code", "category_room",
         "building_addreg_id", "flat_addreg_id", "rca", "rca_building", "modified", "updated_date",
         "db_updated_date", "full_path", "full_path_kk", "old_path", "old_path_kk", "floor", "entrance",
         "dbuildingspointer_id", "dbuildingspointer_code", "buildingtype_id", "buildingtype_code"}


def verify(item):
    params = {"collection": "addreg-flat", "origincollection": "addreg-building_noedit",
              "relations[0][collection]": "addreg-flat", "relations[0][relfield_id]": "building_addreg_id",
              "feature_id": item["id"], "lang": "ru"}
    if BUILDINGS: params = {"collection": "addreg-building_noedit", "feature_id": item["id"], "lang": "ru"}
    url = "https://geo.qarobl.kz/api/passport?" + urllib.parse.urlencode(params)
    record = {"rca": item["id"], "source_url": url, "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "JanaAddress-research/1.0"})
            with urllib.request.urlopen(req, timeout=25) as response: body = response.read()
            data = json.loads(body)
            record["properties"] = {k: v for k, v in data["properties"].items() if k in ALLOW or k.startswith("roomtype_id/")}
            record["original_response_sha256"] = hashlib.sha256(body).hexdigest()
            return record
        except Exception as exc:
            if attempt == 2:
                record["error"] = str(exc)
            else:
                time.sleep(1 + attempt * 2)
    return record


if __name__ == "__main__":
    items = {}
    for filename in ["karaganda_flats.json", "karaganda_flats_extended.json"]:
        for building in json.loads((ROOT / filename).read_text(encoding="utf-8")):
            if BUILDINGS: items[building["building_rca"]] = {"id": building["building_rca"]}
            else:
                for item in building["features"]: items[item["id"]] = item
    records = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else []
    done = {r["rca"] for r in records if "properties" in r}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(verify, item) for key, item in items.items() if key not in done]
        for future in concurrent.futures.as_completed(futures):
            records.append(future.result())
            if len(records) % 50 == 0:
                OUTPUT.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
                print("verified", len(records), "/", len(items), flush=True)
    OUTPUT.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
