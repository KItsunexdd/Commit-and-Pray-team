"""Индекс опубликованных контурных свидетельств без пересчёта геометрии."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
from .reference import ROOT,Reference

def build(out,source=ROOT/'artifacts/address_db/territories-v001'):
    out=Path(out);out.mkdir(parents=True,exist_ok=False)
    source=Path(source);manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
    if manifest['schema_version']!='territory-districts/1':raise ValueError('Unsupported territory schema')
    hashes={}
    for name in ('territory_districts.json','policy.json','report.json'):
        hashes[name]=hashlib.sha256((source/name).read_bytes()).hexdigest()
        if hashes[name]!=manifest['files'][name]['sha256']:raise ValueError('Source hash mismatch: '+name)
    rows=json.loads((source/'territory_districts.json').read_text(encoding='utf-8'))
    ref=Reference();known={r['id']:r['locality'] for r in ref.db.execute('SELECT id,locality FROM geonims')}
    admins={r['id']:r['aid'] for r in ref.db.execute('SELECT id,aid FROM admin')}
    path=out/'territories.sqlite';db=sqlite3.connect(path)
    db.executescript('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);'
        'CREATE TABLE territory_districts(geonim TEXT PRIMARY KEY,locality TEXT,district TEXT,method TEXT,'
        'fraction REAL,status TEXT,conflict INTEGER,evidence TEXT) WITHOUT ROWID;')
    assigned=0
    for r in rows:
        assert r['geonim_id'] in known
        assert r['locality_id'] is None or admins[r['locality_id']]==known[r['geonim_id']]
        if r['district_id']:
            assert r['district_id'] in admins and not r['conflict'] and .95<=r['fraction']<=1
            assert r['method']=='territory_within_district' and r['status']=='assigned'
            assigned+=1
        db.execute('INSERT INTO territory_districts VALUES (?,?,?,?,?,?,?,?)',
                   (r['geonim_id'],r['locality_id'],r['district_id'],r['method'],r['fraction'],r['status'],
                    bool(r['conflict']),json.dumps(r,ensure_ascii=False)))
    db.execute('INSERT INTO metadata VALUES (?,?)',('source',json.dumps(hashes)))
    db.commit();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close();ref.db.close()
    result=dict(source='artifacts/address_db/territories-v001',source_hashes=hashes,rows=len(rows),assigned=assigned,
        output_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),validation='schema, IDs, city links, hashes; geometry accepted from source publication')
    (out/'acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result))

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--out',type=Path,required=True)
    build(ap.parse_args().out)
