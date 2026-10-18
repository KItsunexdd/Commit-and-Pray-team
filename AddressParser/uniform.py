"""Вывод района по однородному названию с проверенным городским допуском."""
import json
from pathlib import Path
import sqlite3
import re

def is_territory(geonim):
    """Роль или исходный тип/имя справочника, независимо от входного адреса."""
    if geonim.get('role')=='address_area':return True
    values=[]
    for key in ('type_json','names_json'):
        values.extend(str(v) for v in (json.loads(geonim.get(key) or '{}') or {}).values() if v)
    return any(re.search(r'(?<!\w)(?:микрорайон|мкр(?:-н)?|шағын\s+аудан|microdistrict)(?!\w)',v,re.I) for v in values)

class UniformDistricts:
    def __init__(self,path,reference):
        self.path=Path(path).resolve();self.reference=reference
        self.db=sqlite3.connect(self.path.as_uri()+'?mode=ro',uri=True)
        self.db.row_factory=sqlite3.Row;self.db.execute('PRAGMA query_only=ON')
        self.policy=json.loads(self.db.execute('SELECT value FROM metadata WHERE key=?',('policy',)).fetchone()[0])
        self.territory_support=bool(self.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='territory_cities'").fetchone())

    def district(self,city_id,geonims):
        gate=self.db.execute('SELECT enabled FROM cities WHERE id=?',(city_id,)).fetchone()
        if not gate or not gate['enabled']:return None,dict(reason='city_not_validated')
        ids=sorted({g['id'] for g in geonims})
        if not ids:return None,dict(reason='no_geonim')
        stats=[]
        for gid in ids:
            row=self.db.execute('SELECT * FROM geonims WHERE city=? AND id=?',(city_id,gid)).fetchone()
            if row and row['houses']:
                stats.append(row)
        if any(s['conflicts'] for s in stats):
            return None,dict(reason='house_conflict',blocking=True,entity_ids=ids)
        if any(not s['district'] and s['missing']<s['houses'] for s in stats):
            return None,dict(reason='district_conflict',blocking=True,entity_ids=ids)
        if len({s['district'] for s in stats if s['district']})>1:
            return None,dict(reason='district_conflict',blocking=True,entity_ids=ids)
        if any(s['missing'] for s in stats):
            return None,dict(reason='incomplete_labels',entity_ids=ids)
        districts={s['district'] for s in stats}
        if len(districts)!=1:return None,dict(reason='district_conflict' if districts else 'no_houses',blocking=bool(districts),entity_ids=ids)
        # Одинаковый номер/корпус у алиасов не считается несколькими домами.
        houses=set()
        for gid in ids:
            houses.update(tuple(r) for r in self.reference.db.execute(
                'SELECT h.number,h.corpus FROM houses h JOIN geonims g ON g.gid=h.geonim '
                'JOIN admin a ON a.aid=h.locality WHERE a.id=? AND g.id=? AND (h.flags & 1)!=0',(city_id,gid)))
        minimum=self.policy['minimum_houses']
        if getattr(self,'territory_support',False) and all(is_territory(g) for g in geonims):
            territory_gate=self.db.execute('SELECT enabled FROM territory_cities WHERE id=?',(city_id,)).fetchone()
            if territory_gate and territory_gate['enabled']:minimum=2
        if len(houses)<minimum:
            return None,dict(reason='insufficient_houses',house_count=len(houses),entity_ids=ids,minimum_houses=minimum)
        district=next(iter(districts))
        return district,dict(source='baseline/geonim-uniform-v1',entity_ids=[city_id,*ids,district],
                             house_count=len(houses),minimum_houses=minimum,per_geonim_counts={s['id']:s['houses'] for s in stats},
                             snapshot_date='2026-10-17',city_validation='leave_one_house_out')
