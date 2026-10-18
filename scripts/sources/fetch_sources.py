"""Download public research sources, retaining exact responses and a hash manifest.

Usage: python Data/research/fetch_sources.py label URL [label URL ...]
No credentials, cookies, or authorization bypasses are used.
"""
import concurrent.futures
import datetime as dt
import hashlib
import json
import pathlib
import sys
import urllib.error
import urllib.request
import urllib.parse
import uuid

ROOT = pathlib.Path(__file__).resolve().parent
RAW = ROOT / "raw"
RAW.mkdir(exist_ok=True)


def fetch(pair):
    label, url = pair
    parts = urllib.parse.urlsplit(url)
    url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, urllib.parse.quote(parts.path, safe="/%:@"), urllib.parse.quote(parts.query, safe="%=&+;:,/?[]{}"), parts.fragment))
    entry = {"id": label, "url": url, "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "JanaAddress-research/1.0 (public address data collection)", "Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=45) as response:
            body = response.read()
            entry.update(status=response.status, final_url=response.url, content_type=response.headers.get("Content-Type"))
        filename = label + ".bin"
        (RAW / filename).write_bytes(body)
        entry.update(file="raw/" + filename, bytes=len(body), sha256=hashlib.sha256(body).hexdigest())
        print(label, entry["status"], len(body), flush=True)
    except Exception as exc:
        entry["error"] = str(exc)
        print(label, "ERROR", str(exc)[:180], flush=True)
    return entry


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "--jobs":
        args = [item for pair in json.loads(pathlib.Path(args[1]).read_text(encoding="utf-8")) for item in pair]
    if len(args) % 2:
        raise SystemExit("Expected label/URL pairs")
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        entries = list(pool.map(fetch, zip(args[::2], args[1::2])))
    # Separate files avoid races when several research downloads run concurrently.
    directory = ROOT / "manifests"
    directory.mkdir(exist_ok=True)
    path = directory / (dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8] + ".json")
    path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
