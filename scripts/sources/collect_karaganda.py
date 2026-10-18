"""Collect the public list view using its documented UI cursor, with checkpoints."""
import concurrent.futures
import datetime as dt
import json
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
BASE = "https://geo.qarobl.kz/api/list?"
END = time.monotonic() + 23 * 60


def url(params):
    return BASE + urllib.parse.urlencode(params)


def get(params):
    req = urllib.request.Request(url(params), headers={"User-Agent": "JanaAddress-research/1.0"})
    with urllib.request.urlopen(req, timeout=35) as response:
        return json.load(response)


def collect(label, collection, max_pages):
    path = ROOT / (label + ".json")
    checkpoint = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {
        "source_url": BASE, "collection": collection, "context": {"admterr_id": "kz.35.10"},
        "started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "pages": 0,
        "features": [], "continuation": None, "complete": False,
    }
    if checkpoint["complete"]:
        return
    params = {"collection": collection, "context[admterr_id]": "kz.35.10", "lang": "ru"}
    while checkpoint["pages"] < max_pages and time.monotonic() < END:
        query = dict(params)
        for i, val in enumerate(checkpoint.get("continuation") or []):
            query[f"continuation[{i}]"] = str(val)
        try:
            data = get(query)
            features = data["features"]
            if checkpoint.get("continuation") == data.get("continuation") and checkpoint["pages"]:
                raise RuntimeError("Cursor did not advance")
            checkpoint["features"].extend(features)
            checkpoint.update(total_reported=data["total"], continuation=data.get("continuation"),
                              pages=checkpoint["pages"] + 1, complete=not data.get("continuation"),
                              last_request_url=url(query), updated_at=dt.datetime.now(dt.timezone.utc).isoformat())
            if checkpoint["pages"] % 20 == 0 or checkpoint["complete"]:
                path.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")
                print(label, checkpoint["pages"], len(checkpoint["features"]), "/", data["total"], flush=True)
            if checkpoint["complete"]:
                break
            time.sleep(0.12)
        except Exception as exc:
            checkpoint["error"] = str(exc)
            print(label, "ERROR", exc, flush=True)
            break
    path.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")


def flats():
    # Related lists are a public UI action; use the exact relation syntax from page.js.
    buildings = json.loads((ROOT / "raw/kar_buildings_municipality.bin").read_text(encoding="utf-8"))["features"]
    candidates = [f for f in buildings if f["properties"].get("addreg-flat[building_addreg_id]", 0)]
    results = []
    for feature in candidates:
        params = {"collection": "addreg-flat", "origincollection": "addreg-building_noedit",
                  "relations[0][collection]": "addreg-flat", "relations[0][relfield_id]": "building_addreg_id",
                  "relfeature_id": feature["id"], "lang": "ru"}
        record = {"building_rca": feature["id"], "source_url": url(params), "features": [], "complete": False,
                  "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        try:
            while time.monotonic() < END:
                data = get(params)
                record["features"].extend(data["features"])
                record["total_reported"] = data["total"]
                if not data.get("continuation"):
                    record["complete"] = True
                    break
                for i, val in enumerate(data["continuation"]): params[f"continuation[{i}]"] = str(val)
        except Exception as exc:
            record["error"] = str(exc)
        results.append(record)
        print("flats", feature["id"], len(record["features"]), flush=True)
    (ROOT / "karaganda_flats.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs = [pool.submit(collect, "karaganda_geonims", "geonim-noedit", 200),
                pool.submit(collect, "karaganda_buildings", "addreg-building_noedit", 1500), pool.submit(flats)]
        for job in concurrent.futures.as_completed(jobs): job.result()
