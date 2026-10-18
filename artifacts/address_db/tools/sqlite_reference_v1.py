"""Optional low-memory index; payloads are identical to the JSON contract."""
import argparse
import hashlib
import json
import pathlib
import sqlite3
import time
import zlib
from db_common_v1 import *
from verify_release_v1 import peak_memory

def unpack(value):return json.loads(zlib.decompress(value))

def create(release,out):
    if out.exists():raise FileExistsError(out)
    start=time.perf_counter();db=sqlite3.connect(out)
    db.execute('PRAGMA journal_mode=OFF');db.execute('PRAGMA synchronous=OFF');db.execute('PRAGMA temp_store=FILE')
    db.execute('CREATE TABLE metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL)')
    db.execute('CREATE TABLE admin (id TEXT PRIMARY KEY, payload BLOB NOT NULL)')
    db.execute('CREATE TABLE geonims (id TEXT PRIMARY KEY, locality_id TEXT, payload BLOB NOT NULL)')
    db.execute('CREATE TABLE houses (id TEXT PRIMARY KEY,locality_id TEXT,geonim_id TEXT,house_number TEXT,corpus_block TEXT,payload BLOB NOT NULL)')
    db.execute('CREATE TABLE names (key TEXT PRIMARY KEY,payload BLOB NOT NULL)')
    counts={};logical_hashes={};read_seconds=0;insert_seconds=0
    for name,table in [('admin','admin'),('geonims','geonims'),('house_districts','houses'),('name_index','names')]:
        count=0;logical=hashlib.sha256()
        desc=json.loads((release/(name+'.json')).read_text(encoding='utf-8'))
        for shard in desc['shards']:
            tick=time.perf_counter();rows=json.loads((release/shard['path']).read_text(encoding='utf-8'));read_seconds+=time.perf_counter()-tick
            tick=time.perf_counter();values=[]
            for r in rows:
                encoded=dumps(r).encode('utf-8');logical.update(encoded+b'\n')
                payload=zlib.compress(encoded,6)
                if table=='admin':values.append((r['id'],payload))
                elif table=='geonims':values.append((r['id'],r.get('locality_id'),payload))
                elif table=='houses':values.append((r['id'],r.get('locality_id'),r.get('geonim_id'),r.get('house_number'),r.get('corpus_block'),payload))
                else:values.append((r['key'],payload))
            if values:db.executemany('INSERT INTO '+table+' VALUES ('+','.join('?' for _ in values[0])+')',values)
            count+=len(values);db.commit();del values,rows;insert_seconds+=time.perf_counter()-tick
        counts[table]=count;logical_hashes[table]=logical.hexdigest();print('indexed',table,count,flush=True)
    tick=time.perf_counter()
    db.execute('CREATE INDEX house_components ON houses(locality_id,geonim_id,house_number,corpus_block)')
    db.execute('CREATE INDEX geonim_locality ON geonims(locality_id)')
    db.execute('INSERT INTO metadata VALUES (?,?)',('manifest_sha256',digest(release/'manifest.json')))
    db.execute('INSERT INTO metadata VALUES (?,?)',('schema_version',SCHEMA))
    db.execute('INSERT INTO metadata VALUES (?,?)',('payload_encoding','zlib-compressed UTF-8 JSON'))
    db.commit();index_seconds=time.perf_counter()-tick
    integrity=db.execute('PRAGMA integrity_check').fetchone()[0]
    payload_checks={}
    for table in ['admin','geonims','houses','names']:
        h=hashlib.sha256();n=0
        for row in db.execute('SELECT payload FROM '+table+' ORDER BY '+('key' if table=='names' else 'id')):
            h.update(zlib.decompress(row[0])+b'\n');n+=1
        payload_checks[table]={'records':n,'logical_sha256':h.hexdigest(),'matches_json':h.hexdigest()==logical_hashes[table] and n==counts[table]}
    if not all(v['matches_json'] for v in payload_checks.values()):raise ValueError(payload_checks)
    db.close()
    result={'counts':counts,'bytes':out.stat().st_size,'sha256':digest(out),'json_read_decode_seconds':read_seconds,
            'compression_insert_seconds':insert_seconds,'index_creation_seconds':index_seconds,'elapsed_seconds':time.perf_counter()-start,
            'peak_process_working_set_bytes':peak_memory(),'integrity_check':integrity,
            'manifest_sha256':digest(release/'manifest.json'),'payload_semantics':'same record as JSON, lossless zlib compression','all_payload_checks':payload_checks}
    write_json(out.with_suffix('.build.json'),result);return result

def benchmark(path):
    t=time.perf_counter();db=sqlite3.connect('file:'+path.resolve().as_posix()+'?mode=ro',uri=True)
    opened=time.perf_counter()-t
    sample=db.execute('SELECT locality_id,geonim_id,house_number,corpus_block FROM houses WHERE locality_id IS NOT NULL AND geonim_id IS NOT NULL LIMIT 1000').fetchall()
    t=time.perf_counter();returned=0
    for key in sample:
        rows=db.execute('SELECT payload FROM houses WHERE locality_id=? AND geonim_id=? AND house_number=? AND corpus_block IS ?',key).fetchall()
        for row in rows:unpack(row[0]);returned+=1
    elapsed=time.perf_counter()-t
    return {'open_seconds':opened,'queries':len(sample),'returned_records':returned,'queries_and_decode_seconds':elapsed,
            'peak_process_working_set_bytes':peak_memory(),'cold_cache_guaranteed':False,'stdlib_only':True,
            'meaning':'component lookup latency, not address-parser latency or quality'}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--release',type=pathlib.Path);ap.add_argument('--out',type=pathlib.Path,required=True);ap.add_argument('--benchmark',type=pathlib.Path);a=ap.parse_args()
    if a.benchmark:
        result=benchmark(a.benchmark);write_json(a.out,result)
    else:result=create(a.release,a.out)
    print(json.dumps(result,ensure_ascii=False),flush=True)
