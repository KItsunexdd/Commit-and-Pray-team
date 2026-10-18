"""Read the territory extension using only Python's standard library."""
import json

def find_territory(db, geonim_id):
    row = db.execute('''SELECT t.*, g.id AS geonim_id, a.id AS locality_id,
                       d.id AS district_id FROM territory_districts t
                       JOIN geonims g ON g.gid=t.geonim
                       LEFT JOIN admin a ON a.aid=t.locality
                       LEFT JOIN admin d ON d.aid=t.district
                       WHERE g.id=?''', (geonim_id,)).fetchone()
    if row is None: return None
    return {'geonim_id': row['geonim_id'], 'locality_id': row['locality_id'],
            'district_id': row['district_id'], 'method': row['method'],
            'fraction': row['fraction'], 'status': row['status'], 'conflict': bool(row['conflict']),
            'area_m2': row['area_m2'], 'covered_fraction': row['covered_fraction'],
            'candidates': json.loads(row['candidates_json']), 'contours': json.loads(row['contours_json']),
            'origin': 'inferred', 'threshold': 0.95,
            'scope': 'whole territory contour; does not override exact house evidence'}
