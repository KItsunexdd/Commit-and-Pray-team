"""Independent full projection check and separate small-process lookup benchmark."""
import argparse
import collections
import hashlib
import json
import pathlib
import time
from db_common_v1 import digest, dumps, read_collection, write_json
from runtime_index_v1 import connect, find_geonims, find_house, admin_display, find_admin
from verify_release_v1 import peak_memory

def verify(source, relations, runtime, out):
    start = time.perf_counter(); db = connect(runtime)
    aids = {r['id']: r['aid'] for r in db.execute('SELECT id,aid FROM admin')}
    gids = {r['id']: r['gid'] for r in db.execute('SELECT id,gid FROM geonims')}
    relation_conflicts = {r['house_id'] for r in read_collection(relations, 'relation_house_evidence')
                          if r['status'] == 'conflicts_with_primary'}
    expected = {}; skipped = 0; source_evidence = 0
    for r in read_collection(source, 'house_districts'):
        loc, geo, num = r.get('locality_id'), r.get('geonim_id'), r.get('house_number')
        if loc not in aids or geo not in gids or num is None:
            skipped += 1; continue
        corpus = r.get('corpus_block')
        key = (aids[loc], gids[geo], num, '0' if corpus is None else '1' + corpus)
        value = expected.setdefault(key, [0, 0, {}])
        value[0] += 1
        status = 2 if r.get('active_status') == 'inactive_in_source_snapshot' else 1
        flags = status + 4 * bool(r.get('exact_conflict')) + 8 * (r['id'] in relation_conflicts) + 16 * (r.get('numeric_family') is None)
        value[1] |= flags
        for d in r['districts']:
            source_evidence += 1; did = aids[d['district_id']]
            value[2][did] = value[2].get(did, 0) | status
    checked = 0; expected_district_rows = sum(len(v[2]) for v in expected.values())
    for r in db.execute('SELECT * FROM houses ORDER BY locality,geonim,number,corpus'):
        key = tuple(r[k] for k in ('locality','geonim','number','corpus'))
        value = expected[key]
        assert (r['observations'], r['flags']) == tuple(value[:2]), key
        checked += 1
    assert checked == len(expected)
    district_rows = 0
    for r in db.execute('SELECT * FROM house_districts'):
        key = tuple(r[k] for k in ('locality','geonim','number','corpus'))
        assert expected[key][2][r['district']] == r['status'], key
        district_rows += 1
    assert district_rows == expected_district_rows
    del expected
    name_links = 0; name_keys = 0
    for r in read_collection(source, 'name_index'):
        expected_names = collections.defaultdict(int)
        for field, mask in [('current_ids',1),('historical_ids',2),('generated_latin_ids',4)]:
            for eid in r[field]: expected_names[(0, aids[eid]) if eid in aids else (1, gids[eid])] |= mask
        actual = {(x['kind'], x['target']): x['name_class'] for x in
                  db.execute('SELECT kind,target,name_class FROM name_targets WHERE key=?', (r['key'],))}
        assert actual == expected_names, r['key']
        name_links += len(actual); name_keys += 1
    assert name_links == db.execute('SELECT COUNT(*) FROM name_targets').fetchone()[0]
    for r in read_collection(source, 'geonims'):
        g = db.execute('SELECT * FROM geonims WHERE id=?', (r['id'],)).fetchone()
        assert g['locality'] == aids.get(r.get('locality_id'))
        assert g['role'] == r.get('role') and json.loads(g['type_json']) == r.get('type')
        assert json.loads(g['names_json']) == r['names']
    for r in read_collection(source, 'admin'):
        a = admin_display(db, r['id'])
        assert a['names'] == r['names'] and a['city'] == r['city_display'] and a['province'] == r['province_display']
    policy = json.loads((source / 'display_rules.json').read_text(encoding='utf-8'))
    for eid, rule in policy['overrides'].items():
        assert admin_display(db, eid, 'project')[rule['field']] == rule['project']
        assert admin_display(db, eid, 'official')[rule['field']] == rule['official']
        for alias in [rule['project'], rule['official']]: assert eid in {x['id'] for x in find_admin(db, alias)}
    a3 = {r['id'] for r in find_geonims(db, 'аксай 3', 'kato:750000000')}
    a3a = {r['id'] for r in find_geonims(db, 'аксай 3а', 'kato:750000000')}
    assert a3 and a3a and a3.isdisjoint(a3a)
    controls = {'aksay_3_ids': sorted(a3), 'aksay_3a_ids': sorted(a3a), 'project_official_switch': True}
    sample = None
    for eid in sorted(a3a):
        gid = gids[eid]
        row = db.execute('''SELECT number,corpus FROM house_districts d JOIN admin a ON a.aid=d.district
            WHERE geonim=? AND a.id='kato:751310000' LIMIT 1''', (gid,)).fetchone()
        if row:
            sample = find_house(db, 'kato:750000000', eid, row['number'], None if row['corpus']=='0' else row['corpus'][1:]); break
    assert sample is not None, 'Aksay 3a must have Auezov district evidence'
    controls['aksay_3a_auezov_example'] = sample
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    result = {'passed': True, 'runtime_sha256': digest(runtime), 'all_component_keys_checked': checked,
              'all_unique_district_links_checked': district_rows, 'all_name_keys_checked': name_keys,
              'all_name_targets_checked': name_links, 'source_district_evidence_rows': source_evidence,
              'collapsed_district_evidence_rows': source_evidence - district_rows,
              'excluded_incomplete_observations': skipped, 'controls': controls,
              'elapsed_seconds': time.perf_counter()-start, 'stdlib_only': True}
    write_json(out, result); print(dumps(result), flush=True)

def benchmark(runtime, out):
    t=time.perf_counter(); db=connect(runtime); opened=time.perf_counter()-t
    names=[r[0] for r in db.execute('SELECT DISTINCT key FROM name_targets WHERE kind=1 ORDER BY key LIMIT 1000')]
    # Spread house queries across the primary key, avoiding a single city's hot page.
    count=db.execute('SELECT COUNT(*) FROM houses').fetchone()[0]
    stride=max(1,count//1000); sample=[]
    for i,r in enumerate(db.execute('''SELECT a.id,g.id,h.number,h.corpus FROM houses h
        JOIN admin a ON a.aid=h.locality JOIN geonims g ON g.gid=h.geonim
        ORDER BY h.locality,h.geonim,h.number,h.corpus''')):
        if i%stride==0 and len(sample)<1000:sample.append(tuple(r))
    t=time.perf_counter(); returned=0
    for name in names:returned+=len(find_geonims(db,name))
    name_time=time.perf_counter()-t
    t=time.perf_counter();found=0
    for city,geo,num,corpus in sample:
        found+=find_house(db,city,geo,num,None if corpus=='0' else corpus[1:])['found']
    house_time=time.perf_counter()-t
    t=time.perf_counter()
    for city,geo,num,corpus in sample:
        assert not find_house(db,city,geo,'__missing_runtime_control__'+num)['found']
    miss_time=time.perf_counter()-t
    result={'runtime_sha256':digest(runtime),'bytes':runtime.stat().st_size,'open_seconds':opened,
        'name_queries':len(names),'name_queries_seconds':name_time,'returned_name_candidates':returned,
        'house_queries':len(sample),'house_queries_seconds':house_time,'found_houses':found,
        'missing_house_queries_seconds':miss_time,'peak_process_working_set_bytes':peak_memory(),
        'stdlib_only':True,'cold_cache_guaranteed':False,'scope':'dictionary lookup, not full parser/API'}
    write_json(out,result);print(dumps(result),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--source',type=pathlib.Path)
    ap.add_argument('--relations',type=pathlib.Path);ap.add_argument('--runtime',type=pathlib.Path,required=True)
    ap.add_argument('--out',type=pathlib.Path,required=True);ap.add_argument('--benchmark',action='store_true')
    a=ap.parse_args()
    if a.benchmark:benchmark(a.runtime,a.out)
    else:verify(a.source,a.relations,a.runtime,a.out)
