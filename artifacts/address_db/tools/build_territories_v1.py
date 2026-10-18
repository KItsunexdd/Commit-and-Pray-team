"""Measure complete OSM territory polygons against urban district polygons."""
import argparse
import collections
import json
import pathlib
import re
import sys
import time
sys.path.insert(0, str(pathlib.Path(__file__).parent / 'vendor'))
import numpy as np
import osmium
import shapely
from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union
from db_common_v1 import digest, dumps, read_collection, write_json, street_key

SKIP_CITY = 'kato:351010000'
THRESHOLD = 0.95
EPS = 1e-9
MICRO = re.compile(r'^(?:микрорайон|мкр\.?|шағынаудан)\s|\s(?:микрорайон|шағынауданы)$', re.I)
PLACES = {'suburb', 'neighbourhood', 'quarter', 'city_block'}

def name_keys(r):
    names = list(r.get('names', {}).values()) + [v.get('value') for v in r.get('variants', [])]
    return {street_key(v) for v in names if isinstance(v, str) and street_key(v)}

def tag_keys(tags):
    return {street_key(v) for k, v in tags.items() if k == 'name' or k.startswith('name:')}

def is_target(r):
    return (r['role'] == 'address_area' or any(MICRO.search(v) for v in r.get('names', {}).values() if isinstance(v, str))
            or bool(re.search(r'микрорайон|шағынаудан', dumps(r.get('type')), re.I)))

def is_territory(tags):
    if tags.get('building') not in (None, 'no'): return False
    named = any(k == 'name' or k.startswith('name:') for k in tags)
    explicit = tags.get('place') in PLACES or tags.get('landuse') in {'residential', 'garages'} or bool(tags.get('residential'))
    micro = any(MICRO.search(v) for k, v in tags.items() if k == 'name' or k.startswith('name:'))
    return named and (explicit or (micro and not tags.get('highway')))

class Extract(osmium.SimpleHandler):
    def __init__(self, wanted, boundaries):
        super().__init__(); self.wanted = wanted; self.boundaries = boundaries
        self.rows = {}; self.factory = osmium.geom.GeoJSONFactory()

    def remember(self, obj, oid):
        if oid not in self.wanted and oid not in self.boundaries: return
        tags = dict(obj.tags)
        compact = {k: v for k, v in tags.items() if 'name' in k or k in {'place','landuse','residential','building','boundary','admin_level','type'}}
        self.rows.setdefault(oid, {'id': oid, 'tags': compact, 'timestamp': obj.timestamp.isoformat(),
            'eligible_tags': oid in self.boundaries or is_territory(tags), 'geometry': None,
            'geometry_status': 'not_assembled'})

    def way(self, obj): self.remember(obj, f'osm:way/{obj.id}')
    def relation(self, obj): self.remember(obj, f'osm:relation/{obj.id}')

    def area(self, obj):
        oid = f'osm:{"way" if obj.from_way() else "relation"}/{obj.orig_id()}'
        self.remember(obj, oid)
        if oid not in self.rows or not self.rows[oid]['eligible_tags']: return
        row = self.rows[oid]
        try:
            geom = json.loads(self.factory.create_multipolygon(obj)); g = shape(geom)
            row['geometry'] = geom
            row['geometry_status'] = 'valid' if g.is_valid and not g.is_empty and g.area > 0 else 'invalid'
            if row['geometry_status'] != 'valid': row['geometry_error'] = shapely.is_valid_reason(g)
        except Exception as exc:
            row['geometry_status'] = 'assembly_error'; row['geometry_error'] = str(exc)

def projection(lon, lat):
    """Spherical Lambert azimuthal equal-area, metres; not area in degree squares."""
    lon0, lat0 = np.radians(lon), np.radians(lat)
    def project(x, y, z=None):
        l, p = np.radians(x), np.radians(y)
        delta = l-lon0
        k = np.sqrt(2/(1+np.sin(lat0)*np.sin(p)+np.cos(lat0)*np.cos(p)*np.cos(delta)))
        return (6371008.8*k*np.cos(p)*np.sin(delta),
                6371008.8*k*(np.cos(lat0)*np.sin(p)-np.sin(lat0)*np.cos(p)*np.cos(delta)))
    return project

def project_geometry(g, project):
    return transform(project, shapely.segmentize(g, 0.001))

def measure(territory, district_geoms):
    total = territory.area
    candidates = []
    parts = []
    for did, g in sorted(district_geoms.items()):
        if not territory.intersects(g): continue
        overlap = territory.intersection(g)
        area = overlap.area
        fraction = min(1.0, max(0.0, area/total))
        if fraction > EPS:
            candidates.append({'district_id': did, 'fraction': fraction, 'intersection_area_m2': area})
            parts.append(overlap)
    coverage = unary_union(parts).area/total if parts else 0.0
    overlap_fraction = max(0.0, sum(c['fraction'] for c in candidates)-coverage)
    winners = [c for c in candidates if c['fraction'] >= THRESHOLD]
    if overlap_fraction > EPS:
        status = 'conflict_overlapping_districts'; winner = None
    elif len(winners) == 1:
        status = 'assigned'; winner = winners[0]
    elif len(candidates) > 1:
        status = 'conflict_split'; winner = None
    else:
        status = 'insufficient_coverage' if candidates else 'outside_districts'; winner = None
    return {'status': status, 'district_id': winner['district_id'] if winner else None,
            'method': 'territory_within_district' if winner else None,
            'fraction': winner['fraction'] if winner else None, 'candidates': candidates,
            'conflict': status.startswith('conflict'), 'area_m2': total,
            'covered_fraction': min(1.0, coverage), 'uncovered_fraction': max(0.0, 1-coverage),
            'district_overlap_fraction': overlap_fraction, 'boundary_crosses': len(candidates) > 1}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--root', type=pathlib.Path, required=True)
    ap.add_argument('--out', type=pathlib.Path, required=True); ap.add_argument('--reuse', type=pathlib.Path)
    a = ap.parse_args(); start=time.perf_counter();a.out.mkdir(parents=True, exist_ok=False)
    base=a.root/'artifacts/address_db';release=base/'releases/v009-display'
    admin={r['id']:r for r in read_collection(release,'admin')}
    geonims={r['id']:r for r in read_collection(release,'geonims') if is_target(r)}
    links={r['id']:r for r in read_collection(release,'boundary_links')
           if r.get('status')=='matched' and admin.get(r.get('admin_id'),{}).get('type')=='urban_district'
           and r.get('locality_id')!=SKIP_CITY}
    city_districts=collections.defaultdict(set)
    for r in links.values():city_districts[r['locality_id']].add(r['admin_id'])
    wanted=collections.defaultdict(set); source_links=collections.defaultdict(dict)
    eligible={gid for gid,g in geonims.items() if g.get('locality_id') in city_districts}
    for gid in eligible:
        g=geonims[gid]
        ids=[g['id']]+['osm:'+str(r['record_id']) for r in g.get('source_refs',[])
                       if r.get('source_id')=='osm_geofabrik' and str(r.get('record_id','')).startswith(('way/','relation/'))]
        for oid in ids:
            if oid.startswith(('osm:way/','osm:relation/')):
                wanted[oid].add(gid);source_links[gid][oid]='source_osm_reference'
    for r in read_collection(release,'observation_links'):
        if not r['id'].startswith(('osm:way/','osm:relation/')):continue
        for gid in set(r['geonim_ids']) & eligible:
            wanted[r['id']].add(gid);source_links[gid][r['id']]='source_observation_link'
    pbf=a.root/'Data/research/raw/osm_kazakhstan_pbf.bin';pbf_hash=digest(pbf)
    if a.reuse:
        old=json.loads((a.reuse/'manifest.json').read_text(encoding='utf-8'))
        assert old['pbf_sha256']==pbf_hash
        raw=json.loads((a.reuse/'osm_polygons.json').read_text(encoding='utf-8'))
        assert digest(a.reuse/'osm_polygons.json')==old['files']['osm_polygons.json']['sha256']
    else:
        h=Extract(wanted,links)
        h.apply_file(osmium.io.File(str(pbf),'pbf'),locations=True,idx='flex_mem',
                     filters=[osmium.filter.KeyFilter('name','name:ru','name:kk','place','landuse','residential','boundary')])
        raw=[r for oid,r in sorted(h.rows.items()) if r['eligible_tags']]
    write_json(a.out/'osm_polygons.json',raw)
    rows={r['id']:r for r in raw};districts=collections.defaultdict(dict);projects={};boundary_sources={}
    for city,dids in sorted(city_districts.items()):
        grouped=collections.defaultdict(list)
        for oid,link in links.items():
            if link['locality_id']!=city:continue
            r=rows.get(oid);assert r and r['geometry_status']=='valid',(oid,r)
            grouped[link['admin_id']].append(shape(r['geometry']))
            boundary_sources.setdefault(link['admin_id'],[]).append(oid)
        union=unary_union([g for gs in grouped.values() for g in gs]);x1,y1,x2,y2=union.bounds
        projects[city]=projection((x1+x2)/2,(y1+y2)/2)
        districts[city]={did:project_geometry(unary_union(gs),projects[city]) for did,gs in grouped.items()}
    # A name match can link an existing microdistrict spelling only to a single named
    # territory object independently tied to the same city by the source mapping.
    name_objects=collections.defaultdict(set);object_cities=collections.defaultdict(set)
    for oid,r in rows.items():
        if oid in links or not r['eligible_tags']:continue
        for gid in wanted.get(oid,[]):
            if name_keys(geonims[gid]) & tag_keys(r['tags']):object_cities[oid].add(geonims[gid]['locality_id'])
        if len(object_cities[oid])==1:
            city=next(iter(object_cities[oid]))
            for key in tag_keys(r['tags']):name_objects[(city,key)].add(oid)
    results=[];contour_results=[]
    for gid,g in sorted(geonims.items()):
        city=g.get('locality_id');result={'geonim_id':gid,'locality_id':city,'district_id':None,'fraction':None,
             'method':None,'candidates':[],'conflict':False,'contours':[],
             'origin':'inferred_from_full_source_geometry','threshold':THRESHOLD}
        if city==SKIP_CITY:result['status']='skipped_karaganda'
        elif city is None:result['status']='unresolved_locality'
        elif city not in districts:result['status']='no_district_polygons'
        else:
            ids={oid for oid in source_links[gid] if oid in rows and oid not in links
                 and (oid==gid or (name_keys(g)&tag_keys(rows[oid]['tags'])))}
            methods={oid:source_links[gid][oid] for oid in ids}
            if not ids:
                matches=set().union(*(name_objects[(city,key)] for key in name_keys(g)))
                if len(matches)==1:
                    ids=matches;methods={oid:'unique_named_territory_in_same_locality' for oid in ids}
                elif len(matches)>1:
                    result.update(status='conflict_ambiguous_territory_match',conflict=True,
                                  contour_candidates=sorted(matches))
            if not ids and 'status' not in result:result['status']='no_polygon'
            if ids:
                projected=[];measures=[];bad=[]
                for oid in sorted(ids):
                    row=rows[oid];ev={'geonim_id':gid,'osm_id':oid,'association_method':methods[oid],
                                    'geometry_status':row['geometry_status'],'timestamp':row['timestamp']}
                    if row['geometry_status']=='valid':
                        poly=project_geometry(shape(row['geometry']),projects[city])
                        if not poly.is_valid or poly.is_empty or poly.area<=0:bad.append(oid);ev['geometry_status']='invalid_projection'
                        else:
                            measurement=measure(poly,districts[city]);ev.update(measurement)
                            projected.append(poly);measures.append(measurement)
                    else:bad.append(oid)
                    contour_results.append(ev);result['contours'].append(ev)
                if projected:
                    result.update(measure(unary_union(projected),districts[city]))
                    decisions={r['district_id'] for r in measures if r['district_id']}
                    if any(r['conflict'] for r in measures) or len(decisions)>1:
                        result.update(status='conflict_contours',conflict=True,district_id=None,method=None,fraction=None)
                    if bad:
                        result.update(status='incomplete_geometry',district_id=None,method=None,fraction=None)
                else:result['status']='no_valid_polygon'
        results.append(result)
    write_json(a.out/'territory_districts.json',results)
    write_json(a.out/'contour_measurements.json',contour_results)
    summary={}
    for aid,r in admin.items():
        if r['type']=='city':summary[aid]={'city':r.get('city_display') or r.get('city') or r['display_name'],
            'total':0,'assigned':0,'conflicts':0,'statuses':{},'district_polygon_count':len(city_districts.get(aid,[]))}
    for r in results:
        city=r['locality_id'] or 'unresolved'
        bucket=summary.setdefault(city,{'city':admin.get(city,{}).get('display_name',city),
             'total':0,'assigned':0,'conflicts':0,'statuses':{},'district_polygon_count':len(city_districts.get(city,[]))})
        bucket['total']+=1;bucket['assigned']+=r['district_id'] is not None;bucket['conflicts']+=r['conflict']
        bucket['statuses'][r['status']]=bucket['statuses'].get(r['status'],0)+1
    control=next(r for r in results if r['geonim_id']=='osm:way/265577783')
    assert control['district_id']=='kato:751310000' and control['fraction']>=THRESHOLD,control
    report={'status_counts':dict(collections.Counter(r['status'] for r in results)),
        'geonims':len(results),'contour_measurements':len(contour_results),
        'unique_valid_territory_polygons':sum(r['geometry_status']=='valid' and r['id'] not in links for r in raw),
        'district_polygons':len(links),'by_city':summary,'control_aksay_3a':control,
        'snapshot':'2026-10-15T20:21:00Z','seconds':time.perf_counter()-start}
    write_json(a.out/'report.json',report)
    policy={'threshold':THRESHOLD,'fraction_basis':'intersection area / full territory polygon area',
        'projection':'spherical Lambert azimuthal equal-area per city; radius 6371008.8 m',
        'segmentize_max_degrees':0.001,'minimum_positive_fraction':EPS,'holes_and_all_multipolygon_parts':True,
        'district_sources':boundary_sources,'invalid_geometry':'refuse; no silent repair or point substitution',
        'overlap':'refuse conflicting district polygon overlap > epsilon',
        'multiple_contours':'union for area, plus refusal for conflicting individual contours',
        'geonim_scope':'address_area or explicit microdistrict name/type; no house footprints or plain highway rings',
        'threshold_split':'one district >=95% accepted with minority fractions retained; otherwise multiple candidates are conflict',
        'scope':'five cities with source-confirmed urban district polygons; Karaganda explicitly skipped',
        'not_house_district':'territory result never overrides exact house evidence or means 100% containment'}
    write_json(a.out/'policy.json',policy)
    files={p.name:{'bytes':p.stat().st_size,'sha256':digest(p)} for p in sorted(a.out.iterdir()) if p.is_file()}
    write_json(a.out/'manifest.json',{'schema_version':'territory-districts/1','pbf_sha256':pbf_hash,
        'source_release_manifest_sha256':digest(release/'manifest.json'),'files':files,
        'code_sha256':digest(pathlib.Path(__file__)),'runtime_dependencies':'none; JSON or SQLite reader is stdlib',
        'build_dependencies':{'osmium': '4.3.1','shapely':shapely.__version__,'numpy':np.__version__}})
    print(dumps({k:v for k,v in report.items() if k not in {'by_city','control_aksay_3a'}}),flush=True)
    print('Aksay 3A',control['district_id'],control['fraction'],flush=True)

if __name__=='__main__':main()
