"""Собрать компактный слой разрешённых соседей в собственной области артефактов."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
from .reference import ROOT

def build(source,out):
    source,out=Path(source),Path(out)
    if out.exists(): raise FileExistsError(out)
    out.parent.mkdir(parents=True,exist_ok=True)
    policy=json.loads((source/'policy.json').read_text(encoding='utf-8'))
    validation=json.loads((source/'validation.json').read_text(encoding='utf-8'))
    manifest=json.loads((source/'families.json').read_text(encoding='utf-8'))
    allowed={(x['locality_id'],x['source']) for x in validation['decisions'] if x['interior_enabled']}
    if policy['edge_uniform_enabled']: raise ValueError('Эта версия поддерживает только внутренние номера')
    db=sqlite3.connect(out)
    db.executescript('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT); '
                     'CREATE TABLE families(locality TEXT,geonim TEXT,source TEXT,number INTEGER,districts TEXT,'
                     'PRIMARY KEY(locality,geonim,source,number)) WITHOUT ROWID;')
    hashes={}; count=0
    for shard in manifest['shards']:
        path=source/shard['path']
        if path.parent.resolve()!=source.resolve(): raise ValueError('Путь шарда вне слоя')
        data=path.read_bytes(); digest=hashlib.sha256(data).hexdigest()
        if digest!=shard['sha256']: raise ValueError('Хеш шарда не совпадает')
        hashes[shard['path']]=digest
        rows=[(r['locality_id'],r['geonim_id'],r['source'],r['numeric_family'],json.dumps(r['district_ids']))
              for r in json.loads(data) if (r['locality_id'],r['source']) in allowed]
        db.executemany('INSERT INTO families VALUES (?,?,?,?,?)',rows);count+=len(rows)
    for name in ('policy.json','validation.json','families.json'):
        hashes[name]=hashlib.sha256((source/name).read_bytes()).hexdigest()
    metadata=dict(schema_version='baseline-neighbours/1',source='address_db/neighbours-v009',
                  allowed=sorted(allowed),source_sha256=hashes,records=count,edge_enabled=False)
    for k,v in metadata.items(): db.execute('INSERT INTO metadata VALUES (?,?)',(k,json.dumps(v)))
    db.commit();db.close()
    metadata['output_sha256']=hashlib.sha256(out.read_bytes()).hexdigest()
    out.with_suffix('.manifest.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    return metadata

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,default=ROOT/'artifacts/address_db/neighbours-v009')
    p.add_argument('--out',type=Path,default=ROOT/'artifacts/baseline/neighbours-v1.sqlite')
    a=p.parse_args();print(json.dumps(build(a.source,a.out),ensure_ascii=False))
