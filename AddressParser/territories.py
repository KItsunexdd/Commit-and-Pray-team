"""Основное территориальное свидетельство из компактного runtime v002."""
import json
from pathlib import Path
import sqlite3
from .uniform import is_territory

class TerritoryDistricts:
    def __init__(self,path):
        self.path=Path(path).resolve()
        self.db=sqlite3.connect(self.path.as_uri()+'?mode=ro',uri=True)
        self.db.row_factory=sqlite3.Row;self.db.execute('PRAGMA query_only=ON')
        self.available=bool(self.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='territory_districts'").fetchone())

    def district(self,city_id,geonims):
        if not self.available:return None,dict(reason='territory_layer_unavailable')
        if any(g.get('type_conflict') for g in geonims):return None,dict(reason='territory_type_conflict',blocking=True)
        if not geonims:return None,dict(reason='not_territory')
        rows=[]
        for g in geonims:
            row=self.db.execute('SELECT t.*,g.id AS geonim_id,a.id AS locality_id,d.id AS district_id '
                'FROM territory_districts t JOIN geonims g ON g.gid=t.geonim '
                'JOIN admin a ON a.aid=t.locality LEFT JOIN admin d ON d.aid=t.district '
                'WHERE g.id=? AND a.id=?',(g['id'],city_id)).fetchone()
            if row:
                rows.append(dict(geonim=row['geonim_id'],locality=row['locality_id'],district=row['district_id'],
                    method=row['method'],fraction=row['fraction'],status=row['status'],conflict=bool(row['conflict']),
                    area_m2=row['area_m2'],covered_fraction=row['covered_fraction'],
                    candidates=json.loads(row['candidates_json']),contours=json.loads(row['contours_json'])))
        diagnostic=dict(source='address_runtime/v002-territories',rows=rows,entity_ids=[city_id,*[g['id'] for g in geonims]])
        if any(r['conflict'] for r in rows):return None,dict(diagnostic,reason='territory_conflict',blocking=True)
        if not all(is_territory(g) for g in geonims):
            mixed=bool(rows) or any(is_territory(g) for g in geonims)
            return None,dict(diagnostic,reason='ambiguous_geonim_role' if mixed else 'not_territory',blocking=mixed)
        accepted=[r for r in rows if r['status']=='assigned' and r['method']=='territory_within_district'
                  and r['district'] and r['fraction'] is not None and .95<=r['fraction']<=1]
        ids={r['district'] for r in accepted}
        if len(ids)>1:return None,dict(diagnostic,reason='territory_conflict',blocking=True)
        if not ids:return None,dict(diagnostic,reason='no_accepted_contour')
        district=next(iter(ids))
        return district,dict(source='address_runtime/v002-territories',entity_ids=[city_id,*[r['geonim'] for r in accepted],district],
             district_id=district,method='territory_within_district',threshold=.95,
             minimum_fraction=min(r['fraction'] for r in accepted),
             contours=accepted,
             scope='full territory area; not exact house location',snapshot_date='2026-10-15')
