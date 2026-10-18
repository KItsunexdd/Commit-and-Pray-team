import argparse,collections,json,pathlib
from db_common_v1 import *
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--release',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True);a=ap.parse_args()
    admin={r['id']:r for r in read_collection(a.release,'admin')};geos={r['id']:r for r in read_collection(a.release,'geonims')}
    counts=collections.Counter();examples=[];house_localities=set();geo_localities={g['locality_id'] for g in geos.values() if g.get('locality_id')};districts=collections.Counter()
    for h in read_collection(a.release,'house_districts'):
        counts['house_records']+=1
        if h.get('locality_id'):house_localities.add(h['locality_id'])
        else:counts['house_locality_unresolved']+=1
        if not h.get('geonim_id'):counts['house_geonim_unresolved']+=1
        if h.get('active_status')=='inactive_in_source_snapshot':counts['inactive_houses']+=1
        if house_family(h.get('house_number')) is None:
            counts['noncanonical_or_missing_number']+=1
            if len(examples)<30:examples.append({k:h.get(k) for k in ['id','house_number','corpus_block','quality_flags']})
        if h.get('exact_conflict'):counts['exact_conflict_house_records']+=1
        ds={d['district_id'] for d in h['districts']}
        counts['with_district']+=bool(ds);counts['multiple_districts']+=len(ds)>1
        for d in ds:districts[d]+=1
    populated=house_localities|geo_localities
    cities=[r for r in admin.values() if r['type']=='city']
    queue=sorted(cities,key=lambda r:(0 if r.get('parent_id')=='country:KZ' else 1,-r.get('population',{}).get('value',-1),r['id']))
    result={'counts':dict(counts),'geonim_roles':dict(collections.Counter(g.get('role') for g in geos.values())),
            'geonim_type_conflicts':[{'geonim_id':g['id'],'locality_id':g.get('locality_id'),'explicit_types':sorted(street_types(g)),'status':'ambiguous_name_group_do_not_infer'} for g in geos.values() if g.get('role')=='street' and len(street_types(g))>1],
            'historical_names':sum(len(g.get('old_names',[])) for g in geos.values()),
            'inherited_unverified_historical_names':sum(o.get('target_status')=='inherited_unverified' for g in geos.values() for o in g.get('old_names',[])),
            'localities_with_geonims_or_houses':len(populated),'localities_with_houses':len(house_localities),
            'cities_with_geonims_or_houses':sum(r['id'] in populated for r in cities),'cities_in_kato':len(cities),
            'cities_without_address_observations':[{'id':r['id'],'name':r['city']} for r in cities if r['id'] not in populated],
            'district_house_counts':dict(districts),'dirty_number_examples':examples,
            'city_priority_queue':[{'id':r['id'],'name':r['city'],'population':r.get('population'),'has_addresses':r['id'] in populated} for r in queue],
            'selection':'all documented selected observations in local PBF; no real-world completeness claim'}
    write_json(a.out,result);print(dumps({k:v for k,v in result.items() if k not in ['city_priority_queue','dirty_number_examples','district_house_counts','geonim_type_conflicts']}))
