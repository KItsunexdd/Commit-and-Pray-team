"""Project only parser lookup data into a new immutable, standalone SQLite file."""
import argparse
import collections
import json
import pathlib
import sqlite3
import time
from db_common_v1 import digest, dumps, read_collection, street_types, write_json
from runtime_index_v1 import corpus_key
from verify_release_v1 import peak_memory

DDL = '''
CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE display_rules(entity_id TEXT PRIMARY KEY,field TEXT,project TEXT,official TEXT) WITHOUT ROWID;
CREATE TABLE admin(aid INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,type TEXT NOT NULL,parent INTEGER,
 locality INTEGER,province INTEGER,display_name TEXT,city_source TEXT,province_source TEXT,
 city_display TEXT,province_display TEXT,names_json TEXT NOT NULL,variants_json TEXT NOT NULL);
CREATE TABLE geonims(gid INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,locality INTEGER,role TEXT,
 type_json TEXT NOT NULL,type_origin TEXT,names_json TEXT NOT NULL,locality_status TEXT,
 active_status TEXT,identity_scope TEXT,type_conflict INTEGER NOT NULL);
CREATE TABLE name_targets(key TEXT NOT NULL,kind INTEGER NOT NULL,target INTEGER NOT NULL,
 name_class INTEGER NOT NULL,PRIMARY KEY(key,kind,target)) WITHOUT ROWID;
CREATE TABLE houses(locality INTEGER NOT NULL,geonim INTEGER NOT NULL,number TEXT NOT NULL,
 corpus TEXT NOT NULL,observations INTEGER NOT NULL,flags INTEGER NOT NULL,
 PRIMARY KEY(locality,geonim,number,corpus)) WITHOUT ROWID;
CREATE TABLE house_districts(locality INTEGER NOT NULL,geonim INTEGER NOT NULL,number TEXT NOT NULL,
 corpus TEXT NOT NULL,district INTEGER NOT NULL,status INTEGER NOT NULL,
 PRIMARY KEY(locality,geonim,number,corpus,district)) WITHOUT ROWID;
'''

def flags_for(row, relation_conflicts):
    return ((2 if row.get('active_status') == 'inactive_in_source_snapshot' else 1)
            | (4 if row.get('exact_conflict') else 0)
            | (8 if row['id'] in relation_conflicts else 0)
            | (16 if row.get('numeric_family') is None else 0))

def create(source, relations, out):
    out.mkdir(parents=True, exist_ok=False)
    start = time.perf_counter()
    path = out / 'address_runtime.sqlite'
    db = sqlite3.connect(path)
    db.execute('PRAGMA journal_mode=OFF')
    db.execute('PRAGMA synchronous=OFF')
    db.execute('PRAGMA temp_store=MEMORY')
    db.executescript(DDL)
    admin = list(read_collection(source, 'admin'))
    aids = {r['id']: i + 1 for i, r in enumerate(admin)}
    for r in admin:
        pid = r.get('display_policy', {}).get('province_entity_id')
        source_province = r.get('province') or (r.get('display_name') if r['type'] == 'province' else None)
        if not source_province and pid:
            source_province = admin[aids[pid] - 1]['display_name']
        variants = sorted({v['value'] for v in r.get('variants', []) if v.get('value')})
        db.execute('INSERT INTO admin VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                   (aids[r['id']], r['id'], r['type'], aids.get(r.get('parent_id')),
                    aids.get(r.get('locality_id')), aids.get(pid), r.get('display_name'), r.get('city'),
                    source_province, r.get('city_display'), r.get('province_display'), dumps(r['names']), dumps(variants)))
    policy = json.loads((source / 'display_rules.json').read_text(encoding='utf-8'))
    for eid, r in policy['overrides'].items():
        db.execute('INSERT INTO display_rules VALUES (?,?,?,?)', (eid, r['field'], r['project'], r['official']))
    gids = {}
    for i, r in enumerate(read_collection(source, 'geonims'), 1):
        gids[r['id']] = i
        db.execute('INSERT INTO geonims VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                   (i, r['id'], aids.get(r.get('locality_id')), r.get('role'), dumps(r.get('type')),
                    r.get('type_origin'), dumps(r['names']), r.get('locality_link', {}).get('status'),
                    r.get('active_status'), r.get('identity_scope'), int(len(street_types(r)) > 1)))
    print('admin/geonims indexed', len(aids), len(gids), flush=True)
    for r in read_collection(source, 'name_index'):
        targets = collections.defaultdict(int)
        for field, mask in [('current_ids', 1), ('historical_ids', 2), ('generated_latin_ids', 4)]:
            for eid in r[field]:
                if eid in aids: targets[(0, aids[eid])] |= mask
                elif eid in gids: targets[(1, gids[eid])] |= mask
                else: raise ValueError('Unresolved name target: ' + eid)
        db.executemany('INSERT INTO name_targets VALUES (?,?,?,?)',
                       [(r['key'], kind, target, mask) for (kind, target), mask in sorted(targets.items())])
    db.commit()
    print('name targets indexed', flush=True)
    conflicts = set()
    for r in read_collection(relations, 'relation_house_evidence'):
        if r.get('status') == 'conflicts_with_primary': conflicts.add(r['house_id'])
    stats = collections.Counter()
    house_batch, district_batch = [], []
    def flush():
        db.executemany('''INSERT INTO houses VALUES (?,?,?,?,?,?)
            ON CONFLICT(locality,geonim,number,corpus) DO UPDATE SET
            observations=observations+excluded.observations,flags=flags|excluded.flags''', house_batch)
        db.executemany('''INSERT INTO house_districts VALUES (?,?,?,?,?,?)
            ON CONFLICT(locality,geonim,number,corpus,district) DO UPDATE SET status=status|excluded.status''', district_batch)
        db.commit(); house_batch.clear(); district_batch.clear()
    for r in read_collection(source, 'house_districts'):
        stats['source_observations'] += 1
        loc, geo, number = r.get('locality_id'), r.get('geonim_id'), r.get('house_number')
        if loc not in aids or geo not in gids or number is None:
            stats['excluded_incomplete_component_observations'] += 1
            stats['missing_city'] += int(loc not in aids)
            stats['missing_geonim'] += int(geo not in gids)
            stats['missing_number'] += int(number is None)
            continue
        assert isinstance(number, str)
        key = (aids[loc], gids[geo], number, corpus_key(r.get('corpus_block')))
        flags = flags_for(r, conflicts)
        house_batch.append((*key, 1, flags))
        stats['indexed_observations'] += 1
        for d in r['districts']:
            district_batch.append((*key, aids[d['district_id']], flags & 3))
            stats['source_district_evidence_rows'] += 1
        if len(house_batch) >= 10000: flush()
    flush()
    metadata = {'schema_version': 'address-runtime/1', 'source_manifest_sha256': digest(source / 'manifest.json'),
                'display_policy': policy, 'name_class_bits': {'current': 1, 'historical': 2, 'generated_latin': 4},
                'house_flag_bits': {'non_archived_observation': 1, 'archived_observation': 2,
                                    'exact_conflict': 4, 'typed_street_relation_conflict': 8, 'noncanonical_number': 16},
                'snapshot_dates': json.loads((source / 'manifest.json').read_text(encoding='utf-8'))['snapshot_dates'],
                'lookup_semantics': 'Exact raw components; district IDs form a set; unknown is not missing house',
                'relations_manifest_sha256': digest(relations / 'manifest.json'),
                'inference_supported': False, 'runtime_dependencies': ['Python standard library'],
                'source_catalog': json.loads((source / 'source_catalog.json').read_text(encoding='utf-8'))}
    db.executemany('INSERT INTO metadata VALUES (?,?)', [(k, dumps(v)) for k, v in sorted(metadata.items())])
    db.commit()
    db.execute('VACUUM')
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    counts = {t: db.execute('SELECT COUNT(*) FROM ' + t).fetchone()[0]
              for t in ['admin', 'geonims', 'name_targets', 'houses', 'house_districts']}
    db.close()
    result = {'schema_version': 'runtime-build-report/1', 'source_release': source.name,
              'source_manifest_sha256': digest(source / 'manifest.json'), 'counts': counts,
              'observation_projection': dict(stats), 'bytes': path.stat().st_size, 'sha256': digest(path),
              'elapsed_seconds': time.perf_counter() - start, 'peak_process_working_set_bytes': peak_memory(),
              'integrity_check': 'ok', 'target_bytes': 150_000_000, 'within_target': path.stat().st_size <= 150_000_000,
              'runtime_file': path.name, 'runtime_dependencies': ['Python standard library'],
              'relation_conflicting_house_ids': len(conflicts)}
    assert result['within_target'], result['bytes']
    write_json(out / 'build_report.json', result)
    write_json(out / 'manifest.json', {'schema_version': 'address-runtime/1', 'release': out.name,
        'path_base': 'directory_containing_manifest', 'status': 'built_pending_independent_acceptance',
        'file': {'path': path.name, 'bytes': result['bytes'], 'sha256': result['sha256']},
        'source_manifest_sha256': result['source_manifest_sha256'], 'counts': counts,
        'display_policy': policy, 'standalone': True,
        'scope': 'All names; exact complete house keys only; no source payloads or neighbour inference',
        'code': {p.name: digest(p) for p in [pathlib.Path(__file__), pathlib.Path(__file__).with_name('runtime_index_v1.py')]}})
    print(dumps(result), flush=True)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=pathlib.Path, required=True)
    ap.add_argument('--relations', type=pathlib.Path, required=True)
    ap.add_argument('--out', type=pathlib.Path, required=True)
    a = ap.parse_args(); create(a.source, a.relations, a.out)
