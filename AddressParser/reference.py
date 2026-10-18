"""Неизменяемый справочник компонентов; SQL открывается только для чтения."""
import json
import os
from pathlib import Path
import sqlite3
import unicodedata
import re
from functools import lru_cache
from bisect import bisect_left
from .contracts import spaced_words

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / 'artifacts/address_db/runtime/v002-territories/address_runtime.sqlite'
LOCALITY_ALIASES={'almaty':'Алматы','алма ата':'Алматы'}

def normalize(value):
    value = unicodedata.normalize('NFC', value or '').casefold().replace('ё', 'е')
    return re.sub(r'[^\w]+', ' ', value).strip()

def district_name(value):
    """Снять служебный тип только со справочного названия района."""
    return re.sub(r'(?i)(?:^район\s+|\s+район$|\s+ауданы$)','',value).strip()

def name_forms(name):
    """Варианты границ слов и падежа первого имени, только для поиска."""
    forms={normalize(name),normalize(spaced_words(name))}
    parts=spaced_words(name).split()
    if len(parts)>1:
        first=parts[0]
        if re.search(r'[бвгджзклмнпрстфхцчшщ]$',first,re.I):
            forms.add(normalize(' '.join([first+'а',*parts[1:]])))
        elif first.lower().endswith('а'):
            forms.add(normalize(' '.join([first[:-1],*parts[1:]])))
    return forms

def one_edit(left,right):
    """Одна вставка, потеря, замена или перестановка соседних букв."""
    if abs(len(left)-len(right))>1:return False
    if len(left)==len(right):
        for i,(a,b) in enumerate(zip(left,right)):
            if a!=b:
                return (left[i+1:]==right[i+1:] or
                        (left[i:i+2]==right[i:i+2][::-1] and left[i+2:]==right[i+2:]))
        return True
    if len(left)>len(right):left,right=right,left
    for i,(a,b) in enumerate(zip(left,right)):
        if a!=b:return left[i:]==right[i+1:]
    return True

@lru_cache(maxsize=2)
def street_name_index(path,modified,size):
    """Общий индекс имён строится при открытии снимка; SQL-соединения не общие."""
    db=sqlite3.connect(Path(path).as_uri()+'?mode=ro',uri=True)
    try:
        db.execute('PRAGMA query_only=ON')
        db.execute('PRAGMA mmap_size=134217728')
        result={}
        for city,key in db.execute('SELECT a.id,n.key FROM name_targets n '
                'JOIN geonims g ON g.gid=n.target JOIN admin a ON a.aid=g.locality '
                'WHERE n.kind=1 AND g.role=?',('street',)):
            if len(key)>=3:result.setdefault(city,{}).setdefault(len(key),set()).add(key)
        return {city:{length:(tuple(sorted(keys)),tuple(sorted(k[::-1] for k in keys)))
                      for length,keys in lengths.items()}
                for city,lengths in result.items()}
    finally:db.close()

class EmptyReference:
    available = False
    def admins(self, name): return []
    def geonims(self, name, city_id=None): return []
    def house(self, city_id, geonim_id, number, corpus=None): return None
    def admin_display(self, entity_id, profile='project'): return None
    def evidence(self, ids): return {}
    def district_localities(self,name): return []
    def reverse_house(self,name,number,corpus=None):return []
    def geonim_forms(self,name,city_id):return []
    def confirm_geonims(self,name,city_id):return [],None
    def confirm_district(self,name,city_id):return [],None

class Reference(EmptyReference):
    available = True
    def __init__(self, path=None):
        self.path = Path(path or os.environ.get('JANA_ADDRESS_DB', DEFAULT_DB)).resolve()
        self.db = sqlite3.connect(self.path.as_uri() + '?mode=ro', uri=True)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA query_only=ON')
        self.db.execute('PRAGMA mmap_size=134217728')
        self.has_territories=bool(self.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='territory_districts'").fetchone())
        self.source='address_runtime/v002-territories' if self.has_territories else 'address_runtime/v001-project'
        stamp=self.path.stat()
        self._street_names=street_name_index(str(self.path),stamp.st_mtime_ns,stamp.st_size)

    @lru_cache(maxsize=8192)
    def admin_display(self, entity_id, profile='project'):
        if profile not in ('project', 'official'): raise ValueError('Неизвестный профиль')
        row = self.db.execute('SELECT * FROM admin WHERE id=?', (entity_id,)).fetchone()
        if row is None: return None
        return dict(id=row['id'], type=row['type'], name=row['display_name'],
                    city=row['city_display'] if profile == 'project' else row['city_source'],
                    province=row['province_display'] if profile == 'project' else row['province_source'],
                    names=json.loads(row['names_json']), profile=profile)

    @lru_cache(maxsize=8192)
    def admins(self, name):
        rows = self.db.execute('SELECT a.id FROM name_targets n JOIN admin a ON a.aid=n.target '
                              'WHERE n.key=? AND n.kind=0 ORDER BY a.aid', (normalize(name),))
        found=[self.admin_display(r['id'], profile='project') for r in rows]
        alias=LOCALITY_ALIASES.get(normalize(name))
        if alias:
            found.extend(a for a in self.admins(alias) if a['type'] in ('city','town'))
        return list({a['id']:a for a in found}.values())

    @lru_cache(maxsize=8192)
    def geonims(self, name, city_id=None):
        sql = ('SELECT g.*,a.id AS city_id FROM name_targets n JOIN geonims g ON g.gid=n.target '
               'LEFT JOIN admin a ON a.aid=g.locality WHERE n.key=? AND n.kind=1')
        args = [normalize(name)]
        if city_id:
            sql += ' AND a.id=?'; args.append(city_id)
        sql += ' ORDER BY g.gid'
        return [dict(r) for r in self.db.execute(sql, args)]

    def house(self, city_id, geonim_id, number, corpus=None):
        row = self.db.execute('SELECT a.aid,g.gid FROM admin a,geonims g WHERE a.id=? AND g.id=?',
                              (city_id, geonim_id)).fetchone()
        if row is None: return None
        key = (*row, number, '0' if corpus is None else '1'+corpus)
        h = self.db.execute('SELECT flags,observations FROM houses WHERE locality=? AND geonim=? '
                            'AND number=? AND corpus=?', key).fetchone()
        if h is None: return None
        ids = [r[0] for r in self.db.execute('SELECT a.id FROM house_districts d JOIN admin a '
               'ON a.aid=d.district WHERE d.locality=? AND d.geonim=? AND d.number=? '
               'AND d.corpus=? AND (d.status & 1)!=0 ORDER BY a.id', key)]
        return dict(flags=h['flags'], observations=h['observations'], district_ids=ids,
                    conflict=bool(h['flags'] & 12) or len(ids)>1)

    @lru_cache(maxsize=8192)
    def geonim_forms(self,name,city_id):
        if not city_id:return []
        exact=self.geonims(name,city_id)
        if exact:return exact
        found={}
        for form in sorted(name_forms(name)-{normalize(name)}):
            for g in self.geonims(form,city_id):found[g['id']]=g
        return list(found.values())

    def _street_spellings(self,city_id):
        return self._street_names.get(city_id,{})

    @lru_cache(maxsize=8192)
    def confirm_geonims(self,name,city_id):
        if not city_id:return [],None
        matches=self.geonim_forms(name,city_id)
        if matches:
            method='exact' if self.geonims(name,city_id) else 'name_form'
            return matches,dict(method=method,query=name,city_id=city_id)
        key=normalize(spaced_words(name))
        if len(key)<3 or not any(c.isalpha() for c in key):return [],None
        by_length=self._street_spellings(city_id)
        # При одной правке имени длиной >=5 остаются прежними либо первые,
        # либо последние две буквы. Два отсортированных списка сокращают
        # поиск без отсечения допустимых совпадений.
        candidates=set()
        for n in (len(key)-1,len(key),len(key)+1):
            forward,backward=by_length.get(n,((),()))
            if len(key)<5:
                candidates.update(forward)
                continue
            for keys,prefix,reversed_key in ((forward,key[:2],False),(backward,key[-2:][::-1],True)):
                left=bisect_left(keys,prefix);right=bisect_left(keys,prefix+'\U0010ffff')
                candidates.update(k[::-1] if reversed_key else k for k in keys[left:right])
        found={k:self.geonims(k,city_id) for k in sorted(candidates) if one_edit(key,k)}
        identities={frozenset(g['id'] for g in matches) for matches in found.values()}
        if len(identities)!=1:return [],None
        return next(iter(found.values())),dict(method='one_edit',query=name,
                    matched_names=sorted(found),city_id=city_id)

    @lru_cache(maxsize=256)
    def _district_spellings(self,city_id):
        result={}
        for row in self.db.execute('SELECT id,names_json,variants_json FROM admin WHERE type=? '
                'AND locality=(SELECT aid FROM admin WHERE id=?)',('urban_district',city_id)):
            names=list(json.loads(row['names_json']).values())+json.loads(row['variants_json'])
            for name in names:
                if name:result.setdefault(normalize(district_name(name)),set()).add(row['id'])
        return result

    @lru_cache(maxsize=2048)
    def confirm_district(self,name,city_id):
        if not city_id:return [],None
        exact=[d['district_id'] for d in self.district_localities(name) if d['city']['id']==city_id]
        if len(set(exact))==1:return sorted(set(exact)),dict(method='exact',query=name,city_id=city_id)
        if exact:return [],None
        key=normalize(spaced_words(name))
        if len(key)<3:return [],None
        found={k:ids for k,ids in self._district_spellings(city_id).items() if one_edit(key,k)}
        ids={i for values in found.values() for i in values}
        if len(ids)!=1:return [],None
        return sorted(ids),dict(method='one_edit',query=name,matched_names=sorted(found),city_id=city_id)

    def evidence(self, ids):
        return dict(entity_ids=ids, source=self.source,
                    snapshot_date='2026-10-17', profile='project')

    @lru_cache(maxsize=2048)
    def reverse_house(self,name,number,corpus=None):
        forms=name_forms(name)
        found={}
        for key in sorted(forms):
            rows=self.db.execute('SELECT a.id city_id,g.id geonim_id FROM name_targets n '
                'JOIN geonims g ON g.gid=n.target JOIN houses h ON h.locality=g.locality AND h.geonim=g.gid '
                'JOIN admin a ON a.aid=h.locality WHERE n.key=? AND n.kind=1 AND g.role=? '
                'AND h.number=? AND h.corpus=? ORDER BY a.id,g.id',
                (key,'street',number,'0' if corpus is None else '1'+corpus))
            for row in rows:
                c=found.setdefault(row['city_id'],dict(city=self.admin_display(row['city_id']),geonim_ids=[],matched_names=[]))
                if row['geonim_id'] not in c['geonim_ids']:c['geonim_ids'].append(row['geonim_id'])
                if key not in c['matched_names']:c['matched_names'].append(key)
        return list(found.values())

    @lru_cache(maxsize=512)
    def district_localities(self,name):
        key=normalize(name)
        forms={key}
        if key.endswith('ского'):forms.add(key[:-5]+'ский')
        if key.endswith('ного'):forms.add(key[:-4]+'ный')
        matches=[]
        for row in self.db.execute('SELECT d.id,d.names_json,d.variants_json,c.id AS city_id FROM admin d '
                                   'JOIN admin c ON c.aid=d.locality WHERE d.type=?',('urban_district',)):
            names=list(json.loads(row['names_json']).values())+json.loads(row['variants_json'])
            keys={normalize(district_name(n)) for n in names if n}
            if keys & forms:matches.append(dict(district_id=row['id'],city=self.admin_display(row['city_id'],profile='project')))
        return matches
