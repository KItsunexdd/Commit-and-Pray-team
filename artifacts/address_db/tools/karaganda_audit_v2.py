"""Recheck local boundary evidence; never infer district polygons from place points."""
import argparse
import collections
import json
import pathlib
import re
import sys
import time
sys.path.insert(0, str(pathlib.Path(__file__).parent / 'vendor'))
import osmium
from shapely.geometry import shape, box
from db_common_v1 import digest, read_collection, write_json

PATTERN = re.compile(r'казыбек|қазыбек|kazybek|qazybek|али[хк]ан|әлихан|al[iy]khan|alikhan|b[öo]kei|б[өо]кей|октябрьск|oktyabr', re.I)
BOX = box(72.7, 49.5, 73.6, 50.2)

class Census(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.counts = collections.Counter()
        self.boundaries = []
        self.name_candidates = []

    def inspect(self, obj, kind):
        tags = dict(obj.tags)
        if 'boundary' in tags:
            self.counts[kind + '_boundary'] += 1
            if kind == 'relation' or tags.get('boundary') == 'administrative':
                self.boundaries.append({'id': f'osm:{kind}/{obj.id}', 'tags': tags})
        names = {k: v for k, v in tags.items() if 'name' in k}
        if any(PATTERN.search(v) for v in names.values()):
            row = {'id': f'osm:{kind}/{obj.id}', 'tags': tags}
            if kind == 'node' and obj.location.valid():
                row['point'] = [obj.location.lon, obj.location.lat]
            if kind == 'way':
                row['closed'] = bool(obj.nodes) and obj.nodes[0].ref == obj.nodes[-1].ref
            if kind == 'relation':
                row['members'] = [{'type': m.type, 'ref': m.ref, 'role': m.role} for m in obj.members]
            self.name_candidates.append(row)

    def node(self, obj): self.inspect(obj, 'node')
    def way(self, obj): self.inspect(obj, 'way')
    def relation(self, obj): self.inspect(obj, 'relation')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', type=pathlib.Path, required=True)
    ap.add_argument('--out', type=pathlib.Path, required=True)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    start = time.perf_counter()
    base = a.root / 'artifacts/address_db'
    old_path = a.root / 'Data/research/osm_observations.json'
    old = json.loads(old_path.read_text(encoding='utf-8'))
    old_bounds = old['boundaries']
    old_near = []
    for r in old_bounds:
        if shape(r['geometry']).intersects(BOX):
            old_near.append({k: v for k, v in r.items() if k != 'geometry'})
    del old
    extraction = base / 'extraction-v003-canonical/boundaries-000.jsonl'
    nearby, no_geometry, all_candidates = [], [], []
    with extraction.open(encoding='utf-8') as f:
        for line in f:
            r = json.loads(line)
            compact = {k: v for k, v in r.items() if k != 'geometry'}
            if not r.get('geometry'): no_geometry.append(compact)
            elif shape(r['geometry']).intersects(BOX): nearby.append(compact)
            if any(PATTERN.search(v) for k, v in r['tags'].items() if 'name' in k):
                all_candidates.append(compact)
    pbf = a.root / 'Data/research/raw/osm_kazakhstan_pbf.bin'
    h = Census()
    keys = ['boundary', 'place', 'name', 'name:ru', 'name:kk', 'old_name', 'old_name:ru',
            'old_name:kk', 'official_name', 'official_name:ru', 'official_name:kk',
            'alt_name', 'alt_name:ru', 'alt_name:kk', 'ref:kato', 'kato']
    h.apply_file(osmium.io.File(str(pbf), 'pbf'), filters=[osmium.filter.KeyFilter(*keys)])
    write_json(a.out / 'pbf_name_candidates.json', h.name_candidates)
    write_json(a.out / 'pbf_boundary_tags.json', h.boundaries)
    kar = collections.Counter()
    districts = collections.Counter()
    for r in read_collection(base / 'releases/v007-country', 'house_districts'):
        if r.get('locality_id') != 'kato:351010000': continue
        kar['observations'] += 1
        ids = {d['district_id'] for d in r['districts']}
        kar['with_district' if ids else 'without_district'] += 1
        if r.get('active_status') == 'inactive_in_source_snapshot': kar['inactive'] += 1
        districts.update(ids)
    result = {'scope': 'local Geofabrik snapshot only; no live OSM claim',
              'pbf_sha256': digest(pbf), 'old_observations_sha256': digest(old_path),
              'build_dataset_sha256': digest(a.root / 'Data/research/build_dataset.py'),
              'old_boundary_count': len(old_bounds), 'old_boundaries_intersecting_karaganda_bbox': old_near,
              'country_boundaries_intersecting_karaganda_bbox': nearby,
              'country_named_district_candidates': all_candidates,
              'country_boundaries_without_geometry': len(no_geometry),
              'raw_pbf_boundary_counts': dict(h.counts), 'raw_pbf_name_candidates': len(h.name_candidates),
              'karaganda_house_counts': dict(kar), 'district_counts': dict(districts),
              'elapsed_seconds': time.perf_counter() - start}
    write_json(a.out / 'audit.json', result)
    print(json.dumps(result, ensure_ascii=False), flush=True)

if __name__ == '__main__': main()
