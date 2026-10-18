"""Whole-polygon controls and independent spherical area verification."""
import argparse
import collections
import json
import math
import pathlib
import sys
sys.path.insert(0,str(pathlib.Path(__file__).parent/'vendor'))
from shapely.geometry import shape, box, Polygon, MultiPolygon
from shapely.ops import unary_union
from build_territories_v2 import measure
from db_common_v1 import digest, dumps, write_json

def ring_area(coords):
    terms=[]
    for (x1,y1),(x2,y2) in zip(coords,coords[1:]):
        dl=math.radians(x2-x1);dp=math.radians(y2-y1)/2
        terms.append(dl*math.sin(math.radians((y1+y2)/2))*(math.sin(dp)/dp if dp else 1))
    return abs(math.fsum(terms))*6371008.8**2

def spherical_area(g):
    if g.is_empty:return 0.0
    if g.geom_type=='Polygon':
        return ring_area(list(g.exterior.coords))-sum(ring_area(list(r.coords)) for r in g.interiors)
    if hasattr(g,'geoms'):return sum(spherical_area(p) for p in g.geoms)
    return 0.0

def controls():
    tested=[]
    def check(label,poly,ds,status,district=None):
        r=measure(poly,ds);assert r['status']==status and r['district_id']==district,(label,r)
        tested.append({'case':label,'status':r['status'],'fraction':r['fraction']});return r
    whole=box(0,0,20,10)
    check('entire_polygon_inside',whole,{'a':box(-1,-1,21,11)},'assigned','a')
    r=check('threshold_exactly_95_percent',whole,{'a':box(0,0,19,10),'b':box(19,0,20,10)},'assigned','a')
    assert r['fraction']==0.95 and r['boundary_crosses']
    check('below_95_split_despite_point_inside',whole,{'a':box(0,0,18.8,10),'b':box(18.8,0,20,10)},'conflict_split')
    check('balanced_split',whole,{'a':box(0,0,10,10),'b':box(10,0,20,10)},'conflict_split')
    check('overlapping_districts',whole,{'a':whole,'b':whole},'conflict_overlapping_districts')
    check('partial_coverage_not_renormalized',whole,{'a':box(0,0,10,10)},'insufficient_coverage')
    check('no_intersection',whole,{'a':box(30,30,40,40)},'outside_districts')
    hole=Polygon([(0,0),(20,0),(20,10),(0,10)],holes=[[(10,1),(19,1),(19,9),(10,9)]])
    r=check('hole_is_subtracted',hole,{'a':box(0,0,10,10),'b':box(10,0,20,10)},'conflict_split')
    assert abs(r['candidates'][0]['fraction']-100/128)<1e-12
    multi=MultiPolygon([box(0,0,9,10),box(20,0,21,10)])
    check('all_multipolygon_parts',multi,{'a':box(0,0,9,10),'b':box(20,0,21,10)},'conflict_split')
    check('boundary_touch_has_zero_area',whole,{'a':whole,'b':box(20,0,21,10)},'assigned','a')
    return tested

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--territories',type=pathlib.Path,required=True)
    ap.add_argument('--out',type=pathlib.Path,required=True);a=ap.parse_args()
    raw={r['id']:r for r in json.loads((a.territories/'osm_polygons.json').read_text(encoding='utf-8'))}
    policy=json.loads((a.territories/'policy.json').read_text(encoding='utf-8'))
    report=json.loads((a.territories/'report.json').read_text(encoding='utf-8'))
    ds={did:unary_union([shape(raw[oid]['geometry']) for oid in ids]) for did,ids in policy['district_sources'].items()}
    rows=json.loads((a.territories/'territory_districts.json').read_text(encoding='utf-8'))
    contour_count=0;pair_count=0;max_error=0;district_passes=0
    for r in rows:
        if r['locality_id']=='kato:351010000':
            assert r['status']=='skipped_karaganda' and not r['contours'] and r['district_id'] is None
        if r['district_id']:
            assert r['method']=='territory_within_district' and r['fraction']>=0.95 and not r['conflict']
        if r['conflict']:assert r['district_id'] is None and r['candidates'] and r['contours']
        for c in r['contours']:
            assert c['geometry_status']=='valid'
            poly=shape(raw[c['osm_id']]['geometry']);total=spherical_area(poly)
            assert total>0 and poly.geom_type in {'Polygon','MultiPolygon'}
            for candidate in c['candidates']:
                fraction=spherical_area(poly.intersection(ds[candidate['district_id']]))/total
                error=abs(fraction-candidate['fraction']);max_error=max(max_error,error)
                assert error<0.0002,(r['geonim_id'],c['osm_id'],fraction,candidate)
                if c['district_id']==candidate['district_id']:
                    assert fraction>=0.95-1e-9;district_passes+=1
                pair_count+=1
            contour_count+=1
    control=next(r for r in rows if r['geonim_id']=='osm:way/265577783')
    assert control['district_id']=='kato:751310000'
    own=next(c for c in control['contours'] if c['osm_id']=='osm:way/265577783')
    assert own['fraction']>=0.95
    summary=collections.Counter(r['status'] for r in rows)
    assert dict(summary)==report['status_counts']
    result={'passed':True,'controls':controls(),'geonim_rows_checked':len(rows),'contours_checked':contour_count,
        'district_intersections_checked':pair_count,'assigned_contours_independently_confirmed':district_passes,
        'max_absolute_fraction_difference':max_error,
        'independent_method':'Intersect original longitude/latitude polygons, integrate spherical area along linear geographic edges; not the LAEA overlay implementation',
        'control_aksay_3a_fraction':own['fraction'],'territory_manifest_sha256':digest(a.territories/'manifest.json')}
    write_json(a.out,result);print(dumps(result),flush=True)

if __name__=='__main__':main()
