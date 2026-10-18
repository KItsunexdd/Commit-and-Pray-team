"""Enumerate real source unit identifiers for selected apartment buildings.

Never expand an apartment count into an invented 1..N sequence.
"""
import concurrent.futures
import datetime as dt
import json
import pathlib
import time
from collect_karaganda import get, url

ROOT = pathlib.Path(__file__).resolve().parent
OUTPUT = ROOT / "karaganda_flats_extended.json"


def collect(feature):
    params = {"collection": "addreg-flat", "origincollection": "addreg-building_noedit",
              "relations[0][collection]": "addreg-flat", "relations[0][relfield_id]": "building_addreg_id",
              "relfeature_id": feature["id"], "lang": "ru"}
    record = {"building_rca": feature["id"], "source_url": url(params), "features": [], "complete": False,
              "declared_count_in_building_list": feature["properties"].get("addreg-flat[building_addreg_id]"),
              "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    try:
        for _ in range(100):
            data = get(params)
            record["features"].extend(data["features"])
            record["total_reported"] = data["total"]
            if not data.get("continuation"):
                record["complete"] = True
                break
            for i, val in enumerate(data["continuation"]): params[f"continuation[{i}]"] = str(val)
            time.sleep(0.15)
    except Exception as exc:
        record["error"] = str(exc)
    return record


if __name__ == "__main__":
    source = json.loads((ROOT / "karaganda_buildings.json").read_text(encoding="utf-8"))
    candidates = [f for f in source["features"] if 30 <= f["properties"].get("addreg-flat[building_addreg_id]", 0) <= 250]
    # Include 130-count examples explicitly to validate the distinction between
    # a unit count and the largest apartment number, requested by the user.
    selected = sorted(candidates, key=lambda f: (f["properties"]["addreg-flat[building_addreg_id]"] != 130, f["id"]))[:45]
    previous = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else []
    done = {r["building_rca"] for r in previous if r["complete"]}
    records = previous
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for job in concurrent.futures.as_completed([pool.submit(collect, f) for f in selected if f["id"] not in done]):
            record = job.result()
            records.append(record)
            OUTPUT.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
            print(record["building_rca"], len(record["features"]), record.get("total_reported"), record["complete"], flush=True)
