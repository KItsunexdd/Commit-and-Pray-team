"""Small standard-library SQLite reference reader, not an address parser."""
import json
import pathlib
import re
import sqlite3
import unicodedata

def normalize(value):
    value = unicodedata.normalize('NFC', value or '').casefold().replace('ё', 'е')
    return re.sub(r'[^\w]+', ' ', value, flags=re.UNICODE).strip()

def corpus_key(value):
    if value is not None and not isinstance(value, str): raise TypeError('corpus must be str or None')
    return '0' if value is None else '1' + value

def connect(path):
    db = sqlite3.connect(pathlib.Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    return db

def admin_display(db, entity_id, profile='project'):
    if profile not in ('project', 'official'): raise ValueError('unknown display profile')
    row = db.execute('SELECT * FROM admin WHERE id=?', (entity_id,)).fetchone()
    if row is None: return None
    return {'id': row['id'], 'type': row['type'], 'name': row['display_name'],
            'city': row['city_display'] if profile == 'project' else row['city_source'],
            'province': row['province_display'] if profile == 'project' else row['province_source'],
            'names': json.loads(row['names_json']), 'variants': json.loads(row['variants_json']),
            'profile': profile}

def find_geonims(db, name, locality_id=None):
    sql = '''SELECT g.*, a.id AS locality_id, n.name_class FROM name_targets n
             JOIN geonims g ON g.gid=n.target
             LEFT JOIN admin a ON a.aid=g.locality
             WHERE n.key=? AND n.kind=1'''
    args = [normalize(name)]
    if locality_id is not None:
        sql += ' AND a.id=?'; args.append(locality_id)
    sql += ' ORDER BY g.gid'
    return [{'id': r['id'], 'locality_id': r['locality_id'], 'role': r['role'],
             'type': json.loads(r['type_json']), 'type_origin': r['type_origin'],
             'names': json.loads(r['names_json']), 'name_class_mask': r['name_class'],
             'locality_status': r['locality_status'], 'active_status': r['active_status'],
             'identity_scope': r['identity_scope'], 'explicit_type_conflict': bool(r['type_conflict'])}
            for r in db.execute(sql, args)]

def find_admin(db, name, profile='project'):
    ids = db.execute('''SELECT a.id,n.name_class FROM name_targets n
        JOIN admin a ON a.aid=n.target WHERE n.key=? AND n.kind=0 ORDER BY a.aid''', (normalize(name),)).fetchall()
    return [dict(admin_display(db, r['id'], profile), name_class_mask=r['name_class']) for r in ids]

def find_house(db, locality_id, geonim_id, house_number, corpus=None):
    if not isinstance(house_number, str): raise TypeError('house number must be str')
    key = db.execute('SELECT a.aid,g.gid FROM admin a,geonims g WHERE a.id=? AND g.id=?',
                     (locality_id, geonim_id)).fetchone()
    if key is None: return {'found': False, 'district_ids': [], 'archived_district_ids': []}
    components = (*key, house_number, corpus_key(corpus))
    row = db.execute('''SELECT observations,flags FROM houses
        WHERE locality=? AND geonim=? AND number=? AND corpus=?''', components).fetchone()
    if row is None: return {'found': False, 'district_ids': [], 'archived_district_ids': []}
    districts = db.execute('''SELECT a.id,d.status FROM house_districts d
        JOIN admin a ON a.aid=d.district
        WHERE d.locality=? AND d.geonim=? AND d.number=? AND d.corpus=? ORDER BY a.id''', components).fetchall()
    current = [r['id'] for r in districts if r['status'] & 1]
    archived = [r['id'] for r in districts if r['status'] & 2]
    return {'found': True, 'observations': row['observations'], 'district_ids': current,
            'archived_district_ids': archived, 'conflict': bool(row['flags'] & 4) or len(current) > 1,
            'flags': row['flags'], 'origin': 'observed', 'inference_supported': False}
