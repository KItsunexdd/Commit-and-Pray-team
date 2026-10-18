"""Resolve country-wide observations conservatively and retain every unresolved item."""
import argparse
import collections
import copy
import gc
import hashlib
import json
import pathlib
import re
import sys
import time
from db_common_v1 import *
from build_base_v1 import base_records,publish
sys.path.insert(0,str(pathlib.Path(__file__).parent/'vendor'))
from shapely.geometry import Point,shape
from shapely.strtree import STRtree
from shapely import make_valid

def names_from_tags(t,prefix='name'):
    return {'ru':t.get(prefix+':ru'),'kk':t.get(prefix+':kk'),'source_default':t.get(prefix)}
def tag_names(t):
    return [v for k,v in t.items() if k in {'name','int_name','official_name','short_name'} or k.startswith(('name:','official_name:'))]
def source_ref(row):return {'source_id':'osm_geofabrik','record_id':row['id'][4:],'object_timestamp':row.get('timestamp')}
def admin_key(s):
    s=re.sub(r'городская администрация|городской администрации|городская|городской|қаласының әкімшілігі|қалалық әкімдігі|қаласының әкімдігі|қаласының|қалалық|ауылдық округі|сельский округ|сельская администрация|ауылдық әкімдігі|г\.\s*а\.|қ\.\s*ә\.|с\.\s*о\.|область|облысы','',s or '',flags=re.I)
    return district_key(clean_locality(s))

class Geography:
    def __init__(self,admin,boundaries):
        self.admin=admin;self.boundaries=boundaries;self.geoms=[];self.rows=[];self.audit=[]
        self.name_index=collections.defaultdict(set);self.exact_index=collections.defaultdict(set)
        self.children=collections.defaultdict(list)
        for r in admin.values():
            self.children[r.get('parent_id')].append(r['id'])
            for n in name_values(r):
                self.name_index[admin_key(n)].add(r['id']);self.exact_index[norm(n)].add(r['id'])
        self.top_by_id={}
        for r in admin.values():
            code=r['id'].removeprefix('kato:')
            if len(code)==9:self.top_by_id[r['id']]='kato:'+code[:2]+'0000000'
        # First resolve top-level regions, then constrain same-name lower-level units by containment.
        for b in sorted(boundaries,key=lambda b:(int(b['tags'].get('admin_level','99')) if b['tags'].get('admin_level','99').isdigit() else 99,b['id'])):
            try:
                g=shape(b['geometry'])
                if not g.is_valid:g=make_valid(g)
                if g.is_empty:continue
            except Exception as exc:
                self.audit.append({'id':b['id'],'status':'invalid_geometry','error':str(exc)});continue
            t=b['tags'];candidates=set();method='name_and_parent_boundary'
            code=t.get('kato') or t.get('ref:kato')
            if code and 'kato:'+code in admin:
                candidates={'kato:'+code};method='explicit_osm_kato'
            else:
                exact=set().union(*(self.exact_index[norm(n)] for n in tag_names(t)))
                fuzzy=set().union(*(self.name_index[admin_key(n)] for n in tag_names(t)))
                candidates=exact or fuzzy
                if t.get('admin_level')=='4':
                    candidates={c for c in candidates if admin[c].get('parent_id')=='country:KZ'}
                else:
                    candidates={c for c in candidates if admin[c]['type'] not in {'country','province'}}
                    center=g.representative_point()
                    regions={row['admin_id'] for row,geom in zip(self.rows,self.geoms) if row.get('admin_id') and admin[row['admin_id']].get('parent_id')=='country:KZ' and geom.covers(center)}
                    if regions:candidates={c for c in candidates if self.top_by_id.get(c) in regions}
                    # A boundary explicitly called a district is not a same-name city.
                    if any(re.search(r'район|ауданы',n,re.I) for n in tag_names(t)):
                        candidates={c for c in candidates if admin[c]['type'] in {'district','urban_district','district_administration'}}
                    if any(re.search(r'округ|округі|сельская администрация',n,re.I) for n in tag_names(t)):
                        candidates={c for c in candidates if admin[c]['type'] in {'rural_district','settlement_administration'}}
                    if any(re.search(r'городская администрация|г\.а\.|қ\.ә\.|қалалық әкімдігі|қаласының әкімшілігі',n,re.I) for n in tag_names(t)):
                        candidates={c for c in candidates if admin[c]['type']=='city_administration'}
            aid=next(iter(candidates)) if len(candidates)==1 else None
            row={'id':b['id'],'admin_id':aid,'candidates':sorted(candidates),'method':method,
                 'status':'matched' if aid else ('ambiguous' if candidates else 'unmatched'),
                 'names':names_from_tags(t),'admin_level':t.get('admin_level'),'kato_tag':code,
                 'timestamp':b.get('timestamp'),'locality_id':None}
            if aid:
                a=admin[aid]
                if a['type'] in LOCALITIES:row['locality_id']=aid
                elif a['type']=='urban_district':row['locality_id']=a.get('locality_id')
                elif a['type']=='city_administration':
                    descendants=self.descendant_localities(aid)
                    if len(descendants)==1:
                        row['locality_id']=next(iter(descendants));row['locality_method']='sole_kato_locality_under_city_administration'
                a.setdefault('boundary_links',[]).append({k:row[k] for k in ['id','method','timestamp']})
                for k,v in t.items():
                    if k.startswith('name:') or k in {'name','int_name','alt_name'}:
                        if v not in name_values(a):a['variants'].append({'value':v,'language':k.partition(':')[2] or None,'origin':'osm_boundary','source_id':b['id']})
            self.rows.append(row);self.geoms.append(g)
        self.tree=STRtree(self.geoms)
        self.audit+=self.rows
        self.locality_names=collections.defaultdict(set)
        for a in admin.values():
            if a['type'] in LOCALITIES:
                for n in name_values(a)+[v['value'] for v in a.get('variants',[])]:self.locality_names[locality_key(n)].add(a['id'])
        self.places=[];self.place_geoms=[];self.place_audit=[]
        self.footprints=[];self.footprint_geoms=[];self.footprint_tree=None
    def descendant_localities(self,aid):
        found=set();stack=list(self.children[aid]);seen=set()
        while stack:
            c=stack.pop()
            if c in seen:continue
            seen.add(c)
            if self.admin[c]['type'] in LOCALITIES:found.add(c)
            stack.extend(self.children[c])
        return found
    def containing(self,p):
        if p is None:return []
        pt=Point(p)
        return [int(i) for i in self.tree.query(pt) if self.geoms[int(i)].covers(pt)]
    def scoped_candidates(self,names,p):
        candidates=set().union(*(self.locality_names[locality_key(n)] for n in names if n))
        containing=self.containing(p)
        contexts={self.rows[i]['admin_id'] for i in containing if self.rows[i]['admin_id']}
        tops={self.top_by_id.get(a) for a in contexts}
        if tops:candidates={c for c in candidates if self.top_by_id.get(c) in tops}
        # Constrain by district/city-administration ancestry where available.
        strong={a for a in contexts if self.admin[a]['type'] in {'district','rural_district','city_administration'}}
        if strong and len(candidates)>1:
            in_scope=set()
            for c in candidates:
                a=c;seen=set()
                while a and a not in seen:
                    if a in strong:in_scope.add(c);break
                    seen.add(a);a=self.admin.get(a,{}).get('parent_id')
            if in_scope:candidates=in_scope
        return candidates,containing
    def add_place(self,row):
        t=row['tags'];candidates,inside=self.scoped_candidates(tag_names(t),row['point'])
        code=t.get('kato') or t.get('ref:kato');method='place_name_and_admin_context'
        if code and 'kato:'+code in self.admin and self.admin['kato:'+code]['type'] in LOCALITIES:
            candidates={'kato:'+code};method='place_explicit_kato'
        if t.get('place') in {'city','town'}:
            candidates={c for c in candidates if self.admin[c]['type'] in {'city','settlement'}}
        aid=next(iter(candidates)) if len(candidates)==1 else None
        r={'id':row['id'],'names':names_from_tags(t),'locality_id':aid,'candidates':sorted(candidates),
           'method':method,'status':'matched' if aid else ('ambiguous' if candidates else 'unmatched'),'point':row['point']}
        self.place_audit.append(r)
        if aid and row['point']:
            self.places.append(r);self.place_geoms.append(Point(row['point']))
            a=self.admin[aid]
            for k,v in t.items():
                if k=='name' or k=='int_name' or k.startswith(('name:','alt_name:')):
                    if v not in name_values(a):a['variants'].append({'value':v,'language':k.partition(':')[2] or None,'origin':'osm_place','source_id':row['id']})
                    self.locality_names[locality_key(v)].add(aid)
                elif k=='old_name' or k.startswith('old_name:'):
                    for old in v.split(';'):a['old_names'].append({'old_name':old,'language':k.partition(':')[2] or None,'source_refs':[source_ref(row)],'verification':'reported_by_osm','target_status':'source_object'})
    def prepare_places(self):self.place_tree=STRtree(self.place_geoms)
    def add_footprint(self,row):
        if not row.get('geometry'):return
        t=row['tags']
        if not (t.get('place') in {'city','town','village','hamlet','isolated_dwelling'} or t.get('landuse')=='residential'):return
        g=shape(row['geometry'])
        if g.geom_type not in {'Polygon','MultiPolygon'}:return
        if not g.is_valid:g=make_valid(g)
        ids={self.places[int(i)]['locality_id'] for i in self.place_tree.query(g) if g.covers(self.place_geoms[int(i)])}
        # An area must carry a corroborated settlement name. Unnamed residential patches are not settlements.
        candidates,_=self.scoped_candidates(tag_names(t),row['point'])
        corroborated=ids & candidates
        if len(corroborated)==1 and len(ids)==1:
            self.footprints.append({'id':row['id'],'locality_id':next(iter(corroborated)),'method':'named_place_or_residential_polygon_with_matching_place_node'})
            self.footprint_geoms.append(g)
    def finish(self):self.footprint_tree=STRtree(self.footprint_geoms)
    def resolve(self,row,whole=False):
        p=row.get('point');t=row['tags'];inside=self.containing(p)
        explicit=[t[k] for k in ('addr:city','addr:village','addr:hamlet','is_in:city') if t.get(k)]
        named,_=self.scoped_candidates(explicit,p) if explicit else (set(),[])
        candidates=set();evidence=[];geometry=shape(row['geometry']) if whole and row.get('geometry') else None
        for i in inside:
            b=self.rows[i];loc=b['locality_id']
            if loc and (geometry is None or self.geoms[i].covers(geometry)):
                candidates.add(loc);evidence.append({'source_id':b['id'],'method':b.get('locality_method','osm_boundary_containment'),'admin_id':b['admin_id']})
        if p and self.footprint_tree is not None:
            query=geometry if geometry is not None else Point(p)
            for i in self.footprint_tree.query(query):
                i=int(i)
                if self.footprint_geoms[i].covers(query):
                    f=self.footprints[i];candidates.add(f['locality_id']);evidence.append({'source_id':f['id'],'method':f['method']})
        if explicit and named:
            if candidates and not (candidates & named):
                return {'status':'ambiguous','method':'explicit_name_boundary_conflict','candidates':sorted(candidates|named),'evidence':evidence,'explicit_names':explicit},None
            candidates=(candidates & named) if candidates else named
            evidence.append({'method':'explicit_addr_locality_name','values':explicit})
        if len(candidates)==1:
            return {'status':'matched','method':'corroborated_locality','candidates':sorted(candidates),'evidence':evidence},next(iter(candidates))
        return {'status':'ambiguous' if candidates else 'unmatched','method':'insufficient_locality_evidence','candidates':sorted(candidates),'evidence':evidence,'explicit_names':explicit},None
    def districts(self,row,loc):
        if not loc or not row.get('point'):return []
        out=[]
        for i in self.containing(row['point']):
            b=self.rows[i];aid=b['admin_id']
            if aid and self.admin[aid]['type']=='urban_district' and self.admin[aid].get('locality_id')==loc:
                out.append({'district_id':aid,'origin':'observed','method':'point_in_osm_boundary','osm_boundary_id':b['id'],
                            'snapshot_date':'2026-10-15T20:21:00Z','point_method':row.get('point_method')})
        return out

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=pathlib.Path,required=True);ap.add_argument('--extraction',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True);args=ap.parse_args()
    start=time.perf_counter();source=json.loads((args.root/'Data/kazakhstan_addresses.json').read_text(encoding='utf-8'))
    admin,geos,houses,conflicts=base_records(source)
    baseline={'geonims':len(geos),'houses':len(houses)}
    original_points={e['id']:e['point'] for e in source['entities'] if e['type']=='building' and e.get('point')}
    source_catalog=source['sources'];del source;gc.collect()
    meta=json.loads((args.extraction/'extraction.json').read_text(encoding='utf-8'))
    boundaries=list(iter_jsonl(args.extraction,meta['boundaries']['files']))
    geo=Geography(admin,boundaries);del boundaries
    print('boundaries',len(geo.rows),'matched',sum(r['status']=='matched' for r in geo.rows),flush=True)
    for row in iter_jsonl(args.extraction,meta['observations']['files']):
        if row['tags'].get('place') in {'city','town','village','hamlet','isolated_dwelling'}:geo.add_place(row)
    geo.prepare_places()
    for row in iter_jsonl(args.extraction,meta['observations']['files']):geo.add_footprint(row)
    geo.finish();print('places',len(geo.places),'footprints',len(geo.footprints),flush=True)
    # Existing entity identity is preserved: OSM observations already merged into a registry object are not copied as a new house.
    existing_osm=collections.defaultdict(set)
    for h in houses.values():
        for ref in h['source_refs']:
            if ref['source_id']=='osm_geofabrik':existing_osm['osm:'+ref['record_id']].add(h['id'])
    name_lookup=collections.defaultdict(set)
    for g in geos.values():
        for n in name_values(g):name_lookup[(g['locality_id'],g['role'],street_key(n))].add(g['id'])
    old_scope_lookup=collections.defaultdict(set)
    unresolved=[];mapping=[];stats=collections.Counter();city_stats=collections.defaultdict(collections.Counter)
    def get_geonim(row,loc,link,role,ns,kind=None,own_name=False):
        values=[v for v in ns.values() if v]
        if not values:return None,[]
        key=street_key(ns.get('source_default') or values[0])
        candidates=name_lookup.get((loc,role,key),set()) if loc else set()
        if len(candidates)>1:
            conflicts.append({'kind':'ambiguous_geonim_name','entity_ids':[row['id']],'candidate_geonim_ids':sorted(candidates),'name':ns,'locality_id':loc})
            return None,sorted(candidates)
        gid=next(iter(candidates)) if candidates else 'osm:geonim:'+hashlib.sha256(dumps([loc or row['id'],role,key]).encode()).hexdigest()[:24]
        if gid not in geos:
            geos[gid]={'id':gid,'locality_id':loc,'role':role,'names':ns,'type':kind,'type_origin':'osm_tag' if kind else 'addr_tag_semantics',
                       'source_refs':[],'old_names':[],'variants':[],'active_status':'mapped_in_source_snapshot',
                       'snapshot_date':meta['header']['osmosis_replication_timestamp'],'locality_link':link,
                       'identity_scope':'same_name_group_not_certified_physical_street' if role=='street' else 'source_address_area_observation'}
            if loc:name_lookup[(loc,role,key)].add(gid)
        g=geos[gid];ref=source_ref(row)
        if ref not in g['source_refs']:g['source_refs'].append(ref)
        for lang,v in ns.items():
            if not v:continue
            if not g['names'].get(lang):g['names'][lang]=v
            elif g['names'][lang]!=v:
                variant={'value':v,'language':lang,'origin':'source','source_id':row['id']}
                if variant not in g['variants']:g['variants'].append(variant)
            if loc:name_lookup[(loc,role,street_key(v))].add(gid)
        if own_name:
            for k,v in row['tags'].items():
                if k=='old_name' or k.startswith('old_name:'):
                    for old in v.split(';'):
                        g['old_names'].append({'old_name':old,'language':k.partition(':')[2] or None,'source_refs':[ref],
                                               'verification':'reported_by_osm','target_status':'source_object'})
                elif k in {'int_name','alt_name','loc_name','short_name','official_name'} or k.startswith(('name:','alt_name:','official_name:')):
                    if v not in name_values(g):g['variants'].append({'value':v,'language':k.partition(':')[2] or None,'origin':'source','source_id':row['id']})
        return gid,[gid]
    for row in iter_jsonl(args.extraction,meta['observations']['files']):
        t=row['tags'];stats['observations']+=1
        is_house='addr:housenumber' in t
        link,loc=geo.resolve(row,whole=not is_house)
        known=existing_osm.get(row['id'],set()) if is_house else set()
        if len(known)==1:
            hid=next(iter(known));h=houses[hid]
            if loc and h['locality_id']!=loc:conflicts.append({'kind':'inherited_locality_disagrees_with_new_evidence','entity_ids':[hid],'inherited':h['locality_id'],'candidate':loc})
            loc=h['locality_id'];link=h['locality_link'];stats['existing_house_observations_reused']+=1
        stats[link['status']]+=1;city_stats[loc or 'unmatched']['observations']+=1
        if is_house:stats['house_observations']+=1;city_stats[loc or 'unmatched']['house_observations']+=1
        else:stats['nonhouse_observations']+=1
        if t.get('place') in {'city','town','village','hamlet','isolated_dwelling'}:
            # Place-node matching has its own evidence, separate from addresses located at this point.
            stats['settlement_observations']+=1
        gids=[];primary=None;primary_candidates=[]
        for prefix,role in [('addr:street','street'),('addr:place','address_area')]:
            if prefix in t:
                gid,cands=get_geonim(row,loc,link,role,names_from_tags(t,prefix))
                if gid:gids.append(gid)
                if primary is None:primary=gid;primary_candidates=cands
        if t.get('highway') and any(k=='name' or k.startswith('name:') for k in t):
            gid,_=get_geonim(row,loc,link,'street',names_from_tags(t),kind={'highway':t['highway']},own_name=True)
            if gid:gids.append(gid)
        if (t.get('place') in {'suburb','neighbourhood','quarter','city_block'} or t.get('landuse')=='residential' or t.get('residential') or t.get('name','').lower().startswith(('жк ','жилой комплекс'))) and any(k=='name' or k.startswith('name:') for k in t):
            gid,_=get_geonim(row,loc,link,'address_area',names_from_tags(t),kind={k:t[k] for k in ['place','landuse','residential'] if k in t},own_name=True)
            if gid:gids.append(gid)
        if is_house:
            if len(known)==1:h=houses[next(iter(known))]
            else:
                hid=row['id'];number=t['addr:housenumber'];family=house_family(number)
                h={'id':hid,'locality_id':loc,'geonim_id':primary,'geonim_candidates':primary_candidates,
                   'house_number':number,'corpus_block':t.get('addr:block',t.get('addr:corpus')),'districts':[],
                   'source_refs':[source_ref(row)],'active_status':'mapped_in_source_snapshot','source_feature_kind':'osm_address_observation',
                   'snapshot_date':meta['header']['osmosis_replication_timestamp'],'locality_link':link,
                   'numeric_family':family,'neighbour_eligible':family is not None,
                   'address_area_ids':[g for g in gids if geos[g]['role']=='address_area']}
                if family is None:
                    h['quality_flags']=['missing_or_noncanonical_house_number']
                    conflicts.append({'kind':'house_number_excluded_from_neighbours','entity_ids':[hid],'details':{'house_number':number}})
                houses[hid]=h
                if len(known)>1:conflicts.append({'kind':'multiple_inherited_objects_for_osm_observation','entity_ids':sorted(known|{hid})})
            for evidence in geo.districts(row,loc):
                if evidence not in h['districts']:h['districts'].append(evidence)
        if link['status']!='matched':
            unresolved.append({'id':row['id'],'tags':t,'point':row.get('point'),'locality_link':link,'geonim_ids':sorted(set(gids)),
                               'house_id':row['id'] if is_house and not known else None,'snapshot_date':meta['header']['osmosis_replication_timestamp']})
        mapping.append({'id':row['id'],'locality_id':loc,'status':link['status'],'method':link['method'],
                        'geonim_ids':sorted(set(gids)),'house_ids':sorted(known) if known else ([row['id']] if is_house else [])})
        if stats['observations']%100000==0:print('processed',stats['observations'],'matched',stats['matched'],flush=True)
    # Re-evaluate old registry points against all available district polygons, preserving conflicting evidence.
    for hid,p in original_points.items():
        h=houses[hid]
        for evidence in geo.districts({'point':p,'point_method':'inherited_source_point'},h['locality_id']):
            if evidence not in h['districts']:h['districts'].append(evidence)
    for h in houses.values():
        ids=sorted({d['district_id'] for d in h['districts']})
        h['district_status']='conflict' if len(ids)>1 else ('observed' if ids else 'unknown')
        if len(ids)>1:conflicts.append({'kind':'house_district_conflict','entity_ids':[h['id']],'district_ids':ids})
    # Exact duplicates remain observations. Conflicting evidence prevents neighbour use for the complete key.
    exact=collections.defaultdict(list)
    for h in houses.values():
        if h.get('locality_id') and h.get('geonim_id'):exact[(h['locality_id'],h['geonim_id'],h['house_number'],h.get('corpus_block'))].append(h)
    for key,records in exact.items():
        ds={d['district_id'] for h in records for d in h['districts']}
        if len(ds)>1:
            conflicts.append({'kind':'exact_address_district_conflict','entity_ids':sorted(h['id'] for h in records),'key':list(key),'district_ids':sorted(ds)})
            for h in records:h['neighbour_eligible']=False;h['exact_conflict']=True
    extra={'scope':'all_selected_address_observations_in_local_country_pbf_plus_preserved_base','extraction':meta,
           'observation_coverage':dict(stats),'by_locality_observations':dict(city_stats),'baseline_preserved':baseline,
           'boundary_matches':dict(collections.Counter(r['status'] for r in geo.rows)),
           'place_matches':dict(collections.Counter(r['status'] for r in geo.place_audit)),
           'named_locality_footprints':len(geo.footprints),'nearest_locality_assignment':False}
    report=publish(args.root,args.out,args.out.name,admin,geos,houses,conflicts,extra)
    for name,records in [('unresolved',unresolved),('observation_links',mapping),('boundary_links',geo.audit),('place_links',geo.place_audit)]:
        shards_write(args.out,name,records)
    write_json(args.out/'source_catalog.json',source_catalog)
    write_json(args.out/'run_metrics.json',{'seconds':time.perf_counter()-start,'houses':len(houses),'geonims':len(geos)})
    print(json.dumps({'seconds':time.perf_counter()-start,'coverage':dict(stats),'validation':report['validation'],'houses':len(houses),'geonims':len(geos)},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
