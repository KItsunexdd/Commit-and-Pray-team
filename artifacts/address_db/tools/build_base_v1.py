"""Preserve original entities and publish the first compatible address reference."""
import argparse
import collections
import copy
import datetime
import json
import pathlib
import platform
import sys
import time
from db_common_v1 import *

def base_records(source):
    es=source['entities']; admin={};geos={};houses={};conflicts=[]
    source_meta={s['id']:s for s in source['sources']}
    excluded={'building','geonim','entrance','apartment','nonresidential_premise','premise_unknown'}
    for e in es:
        eid=e['id'];t=e['type']
        if t not in excluded:
            r={k:copy.deepcopy(e[k]) for k in ('id','type','names','parent_id','parent_candidates','parent_link_method','locality_id','source_refs','snapshot_date','active_status','verification','population','classification_method','legal_settlement_category','osm_boundary') if k in e}
            r['display_name']=e.get('display_name_ru') or next(iter(name_values(e)),None)
            r['link_status']='candidate' if e.get('parent_candidates') else 'source_derived'
            r['old_names']=[];r['variants']=[]
            if t in LOCALITIES:
                r['city']=clean_locality(r['display_name']);r['locality_id']=eid
            admin[eid]=r
        elif t=='geonim':
            r={k:copy.deepcopy(e[k]) for k in ('id','locality_id','role','names','source_refs','parent_id','stub','identity_scope','active_status') if k in e}
            r.update(type=e.get('geonim_type'),type_origin='source' if eid.startswith('kar:') else 'inherited_name_or_osm_tag',
                     active_status=e.get('active_status','not_individually_verified'),old_names=[],variants=[],
                     locality_link={'status':'matched','method':'inherited_source','candidates':[e['locality_id']]})
            for lang,values in e.get('name_variants',{}).items():
                for v in values:r['variants'].append({'value':v,'language':lang,'origin':'source'})
            geos[eid]=r
        elif t=='building':
            r={k:copy.deepcopy(e[k]) for k in ('id','locality_id','house_number','corpus_block','source_refs','active_status','source_feature_kind','source_updated_date') if k in e}
            r['corpus_block']=e.get('corpus_block');r['geonim_id']=e.get('address_object_id')
            r['districts']=[dict(v,origin='observed',snapshot_date='2026-10-15T20:21:00Z') for v in e.get('district_link_evidence',[])]
            present={v['district_id'] for v in r['districts']}
            for did in e.get('district_ids',[]):
                if did not in present:r['districts'].append({'district_id':did,'origin':'observed','method':'inherited_district_ids','snapshot_date':source['generated_at']})
            r['locality_link']={'status':'matched','method':'inherited_source','candidates':[e['locality_id']]}
            r['numeric_family']=house_family(e.get('house_number'))
            r['neighbour_eligible']=r['numeric_family'] is not None and e.get('active_status')!='inactive_in_source_snapshot'
            if r['numeric_family'] is None:
                r['quality_flags']=['missing_or_noncanonical_house_number']
                conflicts.append({'kind':'house_number_excluded_from_neighbours','entity_ids':[eid],'details':{'house_number':e.get('house_number')}})
            if e.get('source_full_address_ru') and e['locality_id']=='kato:351010000':
                text=e['source_full_address_ru'];key=norm(text);did=None;historical=False
                if 'казыбек би' in key:did='kato:351013100'
                elif 'әлихан бөкейхан' in key:did='kato:351011100'
                elif 'октябрьский' in key:did='kato:351011100';historical=True
                if did:r['districts'].append({'district_id':did,'origin':'observed','method':'source_full_address_ru_historical_alias' if historical else 'source_full_address_ru',
                                             'source_text':text,'snapshot_date':e.get('source_updated_date'),
                                             'historical_name':historical,'source_id':'karaganda_building_passports',
                                             'alias_status':'inherited_official_act_index_not_reverified' if historical else None})
            houses[eid]=r
    for r in admin.values():
        if r['type'] not in LOCALITIES:continue
        chain=[];cur=r;seen=set()
        while cur and cur['id'] not in seen:
            seen.add(cur['id']);chain.append(cur['id'])
            if cur['type']=='province' or (cur['type']=='city' and cur.get('parent_id')=='country:KZ'):
                val=cur['display_name']
                if cur['type']=='city':val=clean_locality(val)
                elif val.lower().startswith('область '):
                    tail=val[8:];val=tail+' область' if tail.lower().endswith(('ская','цкая')) else 'область '+tail
                r['province']=val;r['province_id']=cur['id'];r['province_rule']={'method':'source_ancestor_chain','chain':chain};break
            cur=admin.get(cur.get('parent_id'))
        else:r['province']=None;r['province_id']=None;r['province_rule']={'method':'unresolved','chain':chain}
    for alias in source['historical_names']:
        target=admin.get(alias['target_id']) or geos.get(alias['target_id'])
        if target:
            a=copy.deepcopy(alias)
            if alias['target_id'] in geos:a['target_status']='inherited_unverified'
            target['old_names'].append(a)
    # Keep administrative/address conflicts, excluding unit-level material from the minimum.
    allowed=admin.keys()|geos.keys()|houses.keys()
    for c in source['conflicts']:
        if 'premise' in c.get('kind','') or 'apartment' in c.get('kind',''):continue
        ids=c.get('entity_ids',[])
        conflicts.append({'kind':'inherited_'+c.get('kind','unknown'),'entity_ids':[i for i in ids if i in allowed],
                          'source_conflict_id':c['id'],'source_resolution':c.get('resolution'),'details':c.get('details')})
    return admin,geos,houses,conflicts

def summarize(admin,geos,houses):
    counts=collections.defaultdict(collections.Counter);multi=collections.defaultdict(set)
    for g in geos.values():counts[g.get('locality_id') or 'unmatched']['geonims']+=1
    for h in houses.values():
        loc=h.get('locality_id') or 'unmatched';counts[loc]['houses']+=1
        ds={d['district_id'] for d in h['districts']};counts[loc]['with_district']+=bool(ds)
        counts[loc]['multi_district_house']+=len(ds)>1
        if h.get('geonim_id'):multi[(loc,h['geonim_id'])]|=ds
    for (loc,gid),ds in multi.items():counts[loc]['multi_district_geonims']+=len(ds)>1
    return [{'locality_id':k,'name':admin.get(k,{}).get('display_name'),**v} for k,v in sorted(counts.items())]

def validate(admin,geos,houses):
    errors=[];unconfirmed=[]
    for r in admin.values():
        if r.get('parent_id') and r['parent_id'] not in admin:errors.append(['parent',r['id'],r['parent_id']])
    for g in geos.values():
        if g.get('locality_id') and g['locality_id'] not in admin:errors.append(['geo_locality',g['id']])
        if not g.get('locality_id'):unconfirmed.append(g['id'])
    for h in houses.values():
        if h.get('locality_id') and h['locality_id'] not in admin:errors.append(['house_locality',h['id']])
        if h.get('geonim_id') and h['geonim_id'] not in geos:errors.append(['geonim',h['id'],h['geonim_id']])
        if h.get('house_number') is not None and not isinstance(h['house_number'],str):errors.append(['house_type',h['id']])
        if h.get('corpus_block') is not None and not isinstance(h['corpus_block'],str):errors.append(['corpus_type',h['id']])
        for d in h['districts']:
            if d['district_id'] not in admin:errors.append(['district',h['id']])
    return {'passed':not errors,'errors':errors,'unconfirmed_geonim_localities':len(unconfirmed)}

def publish(root,out,release,admin,geos,houses,conflicts,extra=None):
    out.mkdir(parents=True,exist_ok=False)
    checks=validate(admin,geos,houses)
    if not checks['passed']:raise ValueError(checks)
    collections_meta={}
    for name,values in [('admin',admin),('geonims',geos),('house_districts',houses)]:
        collections_meta[name]=shards_write(out,name,(values[k] for k in sorted(values)))
    collections_meta['conflicts']=shards_write(out,'conflicts',sorted(conflicts,key=dumps))
    collections_meta['name_index']=shards_write(out,'name_index',build_name_index(list(admin.values())+list(geos.values())))
    report={'validation':checks,'by_locality':summarize(admin,geos,houses),'extra':extra or {}}
    write_json(out/'build_report.json',report)
    source=root/'Data/kazakhstan_addresses.json'
    manifest={'schema_version':SCHEMA,'release':release,'status':'complete_for_declared_scope',
              'path_base':'directory_containing_this_manifest','source_path_base':'project_root',
              'source':{'path':'Data/kazakhstan_addresses.json','sha256':digest(source),'bytes':source.stat().st_size},
              'snapshot_dates':{'kato':'2026-09-18','osm':'2026-10-15T20:21:00Z','verified_karaganda_passports':'2025-12-19'},
              'collections':collections_meta,'scope':(extra or {}).get('scope','existing_three_city_addresses_with_country_admin'),
              'runtime_dependencies':'Python standard library only; read_collection in tools/db_common_v1.py',
              'licensing':{'osm':'ODbL-1.0; © OpenStreetMap contributors; extract by Geofabrik','other_sources':'source catalog; reuse terms not independently established'},
              'real_world_completeness':'unknown','inference_default':'disabled_until_per_city_source_validation',
              'created_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    if extra and extra.get('extraction'):manifest['extraction']=extra['extraction']
    manifest['build_report_sha256']=digest(out/'build_report.json')
    write_json(out/('manifest.pending.json' if extra and extra.get('defer_manifest') else 'manifest.json'),manifest)
    return report

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True);args=ap.parse_args()
    start=time.perf_counter();source=json.loads((args.root/'Data/kazakhstan_addresses.json').read_text(encoding='utf-8'))
    admin,geos,houses,conflicts=base_records(source)
    print('records',len(admin),len(geos),len(houses),flush=True)
    report=publish(args.root,args.out,args.out.name,admin,geos,houses,conflicts)
    print(json.dumps({'seconds':time.perf_counter()-start,'validation':report['validation']},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
