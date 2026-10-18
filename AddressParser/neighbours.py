"""Вывод района только внутри диапазона той же чётности."""
from functools import lru_cache
import json
from pathlib import Path
import re
import sqlite3

def numeric_family(value):
    m=re.fullmatch(r'\s*(\d+)(?:[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІіЁё])?(?:/\d+[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІіЁё]?)?\s*',value)
    return int(m.group(1)) if m else None

def infer(families,number):
    if number in families and len(families[number])!=1: return None,'target_family_conflict',[]
    same=sorted(n for n in families if n!=number and n%2==number%2)
    lower=[n for n in same if n<number];upper=[n for n in same if n>number]
    if not lower or not upper: return None,'outside_interior',[]
    distance=min(number-lower[-1],upper[0]-number)
    selected=[n for n in (lower[-1],upper[0]) if abs(n-number)==distance]
    districts={d for n in selected for d in families[n]}
    if any(len(families[n])!=1 for n in selected) or len(districts)!=1:
        return None,'neighbour_conflict',selected
    return next(iter(districts)),'street_parity_neighbour',selected

class Neighbours:
    def __init__(self,path):
        self.path=Path(path).resolve()
        self.db=sqlite3.connect(self.path.as_uri()+'?mode=ro',uri=True)
        self.db.execute('PRAGMA query_only=ON')
        self.metadata={k:json.loads(v) for k,v in self.db.execute('SELECT key,value FROM metadata')}
        if self.metadata.get('schema_version')!='baseline-neighbours/1': raise ValueError('Неизвестный слой соседей')

    @lru_cache(maxsize=2048)
    def families(self,city_id,geonim_id):
        by_source={}
        for source,n,ds in self.db.execute('SELECT source,number,districts FROM families WHERE locality=? AND geonim=?',(city_id,geonim_id)):
            by_source.setdefault(source,{})[n]=json.loads(ds)
        return by_source

    def district(self,city_id,geonim_id,house):
        number=numeric_family(house)
        if number is None:return None,dict(reason='invalid_numeric_family')
        groups=self.families(city_id,geonim_id)
        if not groups: return None,dict(reason='no_enabled_family')
        outcomes=[]
        for source,families in sorted(groups.items()):
            district,reason,selected=infer(families,number)
            outcomes.append(dict(district=district,reason=reason,source=source,neighbours=selected))
        ids={x['district'] for x in outcomes}
        if None in ids or len(ids)!=1: return None,dict(reason='abstained',outcomes=outcomes)
        return next(iter(ids)),dict(source=self.metadata['source'],entity_ids=[city_id,geonim_id,*ids],
                                   snapshot_date='2026-10-17',numeric_family=number,outcomes=outcomes)
