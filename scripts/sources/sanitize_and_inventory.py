"""Remove irrelevant account metadata from address passports and inventory local evidence."""
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
REMOVED_KEYS = {"__lastchange_user_id", "__created_user_id", "user_id", "iin", "owner_iin"}


def sanitize(value, removed):
    if isinstance(value, dict):
        for key in list(value):
            if key in REMOVED_KEYS:
                removed.add(key)
                del value[key]
            else:
                sanitize(value[key], removed)
    elif isinstance(value, list):
        for item in value: sanitize(item, removed)


previous_path = ROOT / "source_inventory.json"
previous = {item["file"]: item for item in json.loads(previous_path.read_text(encoding="utf-8"))} if previous_path.exists() else {}
inventory = []
for path in sorted((ROOT / "raw").glob("*")):
    original = path.read_bytes()
    removed = set()
    try:
        content = json.loads(original)
        sanitize(content, removed)
        if removed:
            path.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    except (ValueError, UnicodeError):
        pass
    stored = path.read_bytes()
    record = {"file": str(path.relative_to(ROOT)), "bytes": len(stored), "sha256": hashlib.sha256(stored).hexdigest()}
    if removed:
        record.update(original_response_sha256=hashlib.sha256(original).hexdigest(),
                      redacted_irrelevant_metadata_keys=sorted(removed))
    elif record["file"] in previous:
        for key in ["original_response_sha256", "redacted_irrelevant_metadata_keys"]:
            if key in previous[record["file"]]: record[key] = previous[record["file"]][key]
    inventory.append(record)
for path in sorted(ROOT.glob("*.json")):
    if path.name in {"source_inventory.json"}: continue
    blob = path.read_bytes()
    inventory.append({"file": path.name, "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest()})
(ROOT / "source_inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
print("Evidence files inventoried:", len(inventory))
