"""Copy the accepted runtime into a new file and add full-contour territory links."""
import argparse
import hashlib
import json
import pathlib
import sqlite3
import time
from db_common_v1 import digest, dumps, write_json
from runtime_index_v1 import connect
from runtime_territories_v1 import find_territory
from verify_release_v1 import peak_memory

DDL='''CREATE TABLE territory_districts(
 geonim INTEGER PRIMARY KEY REFERENCES geonims(gid),
 locality INTEGER REFERENCES admin(aid), district INTEGER REFERENCES admin(aid),
 method TEXT,fraction REAL,status TEXT NOT NULL,conflict INTEGER NOT NULL,
 area_m2 REAL,covered_fraction REAL,candidates_json TEXT NOT NULL,contours_json TEXT NOT NULL,
 CHECK(fraction IS NULL OR (fraction>=0.95 AND fraction<=1.0)),
 CHECK((district IS NULL AND fraction IS NULL AND method IS NULL) OR
       (district IS NOT NULL AND fraction IS NOT NULL AND method='territory_within_district' AND conflict=0))
);'''

def logical_hash(db,table):
    h=hashlib.sha256();n=0
    info=db.execute('PRAGMA table_info('+table+')').fetchall()
    columns=[r[1] for r in sorted(info,key=lambda r:r[5]) if r[5]>0]
    for row in db.execute('SELECT * FROM '+table+' ORDER BY '+','.join(columns)):
        h.update(dumps(list(row)).encode('utf-8')+b'\n');n+=1
    return {'rows':n,'sha256':h.hexdigest()}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--base-runtime',type=pathlib.Path,required=True)
    ap.add_argument('--territories',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True)
    a=ap.parse_args();a.out.mkdir(parents=True,exist_ok=False);start=time.perf_counter()
    meta=json.loads((a.territories/'manifest.json').read_text(encoding='utf-8'))
    for name,entry in meta['files'].items():assert digest(a.territories/name)==entry['sha256']
    rows=json.loads((a.territories/'territory_districts.json').read_text(encoding='utf-8'))
    original_hash=digest(a.base_runtime);src=connect(a.base_runtime)
    path=a.out/'address_runtime.sqlite';db=sqlite3.connect(path);src.backup(db)
    db.execute('PRAGMA foreign_keys=ON');db.executescript(DDL)
    aids={r[0]:r[1] for r in db.execute('SELECT id,aid FROM admin')}
    gids={r[0]:r[1] for r in db.execute('SELECT id,gid FROM geonims')}
    for r in rows:
        db.execute('INSERT INTO territory_districts VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            (gids[r['geonim_id']],aids.get(r['locality_id']),aids.get(r['district_id']),r['method'],r['fraction'],
             r['status'],int(r['conflict']),r.get('area_m2'),r.get('covered_fraction'),
             dumps(r['candidates']),dumps(r['contours'])))
    extension={'schema_version':'territory-districts/1','manifest_sha256':digest(a.territories/'manifest.json'),
               'policy':json.loads((a.territories/'policy.json').read_text(encoding='utf-8')),
               'pbf_sha256':meta['pbf_sha256'],'origin':'inferred','scope':'entire territory, not a house or a point'}
    db.execute('INSERT INTO metadata VALUES (?,?)',('territory_layer',dumps(extension)));db.commit()
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    unchanged={}
    for table in ['admin','display_rules','geonims','name_targets','houses','house_districts']:
        before=logical_hash(src,table);after=logical_hash(db,table);assert before==after,table
        unchanged[table]=after
    for r in src.execute('SELECT key,value FROM metadata'):
        assert db.execute('SELECT value FROM metadata WHERE key=?',(r['key'],)).fetchone()[0]==r['value']
    db.close();src.close();assert digest(a.base_runtime)==original_hash
    read=connect(path);checked=0
    for r in rows:
        actual=find_territory(read,r['geonim_id'])
        for key in ['district_id','method','fraction','status','conflict','candidates','contours']:
            assert actual[key]==r[key],(r['geonim_id'],key)
        checked+=1
    control=find_territory(read,'osm:way/265577783')
    assert control['district_id']=='kato:751310000' and control['fraction']>=0.95
    read.close()
    report={'passed':True,'all_territory_rows_checked':checked,'unchanged_base_tables':unchanged,
        'original_runtime_sha256':original_hash,'runtime_sha256':digest(path),'runtime_bytes':path.stat().st_size,
        'elapsed_seconds':time.perf_counter()-start,'peak_build_working_set_bytes':peak_memory(),
        'control_aksay_3a':control,'integrity_check':'ok','foreign_key_check':'ok','standard_library_build_and_read':True}
    assert path.stat().st_size<=150_000_000
    write_json(a.out/'acceptance.json',report)
    write_json(a.out/'manifest.json',{'schema_version':'address-runtime/2','status':'accepted',
        'runtime':{'path':path.name,'bytes':path.stat().st_size,'sha256':digest(path)},
        'base_runtime_sha256':original_hash,'territory_manifest_sha256':digest(a.territories/'manifest.json'),
        'pbf_sha256':meta['pbf_sha256'],'runtime_dependencies':['Python standard library'],
        'code':{p.name:digest(p) for p in [pathlib.Path(__file__),pathlib.Path(__file__).with_name('runtime_territories_v1.py')]}})
    print(dumps({k:v for k,v in report.items() if k not in {'unchanged_base_tables','control_aksay_3a'}}),flush=True)

if __name__=='__main__':main()
