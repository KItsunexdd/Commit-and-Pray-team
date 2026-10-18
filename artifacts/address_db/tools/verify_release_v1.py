"""Contract, preservation, completeness and loader-resource checks."""
import argparse
import collections
import ctypes
import hashlib
import json
import os
import pathlib
import platform
import sys
import time
from db_common_v1 import *

def peak_memory():
    if os.name=='nt':
        class Counters(ctypes.Structure):
            _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(x,ctypes.c_size_t) for x in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
        c=Counters();c.cb=ctypes.sizeof(c)
        kernel=ctypes.WinDLL('kernel32',use_last_error=True);psapi=ctypes.WinDLL('psapi',use_last_error=True)
        kernel.GetCurrentProcess.restype=ctypes.c_void_p
        psapi.GetProcessMemoryInfo.argtypes=[ctypes.c_void_p,ctypes.POINTER(Counters),ctypes.c_ulong]
        if psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(),ctypes.byref(c),c.cb):return c.PeakWorkingSetSize
    try:
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)
    except ImportError:return None

def benchmark(release,mode):
    start=time.perf_counter();read_seconds=0;index_seconds=0;records=0;data={};index={};bytes_read=0
    for collection in ['admin','geonims','house_districts','name_index']:
        desc=json.loads((release/(collection+'.json')).read_text(encoding='utf-8'))
        if mode=='full':data[collection]=[]
        for shard in desc['shards']:
            t=time.perf_counter();raw=(release/shard['path']).read_bytes();rows=json.loads(raw);del raw
            read_seconds+=time.perf_counter()-t;bytes_read+=shard['bytes'];records+=len(rows)
            t=time.perf_counter()
            if mode=='full':
                data[collection].extend(rows)
                if collection=='house_districts':
                    for r in rows:
                        if r.get('locality_id') and r.get('geonim_id'):
                            key=(r['locality_id'],r['geonim_id'],r['house_number'],r.get('corpus_block'))
                            index.setdefault(key,[]).append(r['id'])
            else:
                # Streaming can compute statistics with only one shard resident.
                for r in rows:
                    if collection=='house_districts':index[r.get('locality_id')]=index.get(r.get('locality_id'),0)+1
            index_seconds+=time.perf_counter()-t
            del rows
    return {'mode':mode,'machine':{'os':platform.platform(),'processor':platform.processor(),'logical_cpus':os.cpu_count(),'python':sys.version},
            'bytes_read':bytes_read,'records':records,'json_read_decode_seconds':read_seconds,'index_seconds':index_seconds,
            'elapsed_seconds':time.perf_counter()-start,'peak_process_working_set_bytes':peak_memory(),'cold_cache_guaranteed':False,
            'runtime':'Python standard library; process launched with -S for isolated acceptance','index_keys':len(index)}

def verify(root,release):
    errors=[];checks={};manifest=json.loads((release/'manifest.json').read_text(encoding='utf-8'))
    collections_meta=dict(manifest['collections'],**manifest.get('auxiliary_collections',{}))
    for name,desc in collections_meta.items():
        actual=json.loads((release/(name+'.json')).read_text(encoding='utf-8'))
        if desc!=actual:errors.append(['descriptor_mismatch',name])
        count=0
        for shard in desc['shards']:
            path=release/shard['path']
            if digest(path)!=shard['sha256']:errors.append(['sha256',shard['path']])
            if path.stat().st_size!=shard['bytes']:errors.append(['size',shard['path']])
            if path.stat().st_size>=100_000_000:errors.append(['too_large',shard['path']])
            count+=shard['records']
        if count!=desc['record_count']:errors.append(['count',name])
    admin={r['id']:r for r in read_collection(release,'admin')};geos={r['id']:r for r in read_collection(release,'geonims')}
    houses={r['id']:r for r in read_collection(release,'house_districts')}
    source=json.loads((root/'Data/kazakhstan_addresses.json').read_text(encoding='utf-8'))
    preserved=collections.Counter();text_evidence=collections.Counter();district_before=collections.defaultdict(set);district_after=collections.defaultdict(set)
    for e in source['entities']:
        if e['type'] not in {'building','geonim'}:continue
        out=houses.get(e['id']) if e['type']=='building' else geos.get(e['id'])
        if not out:errors.append(['missing_original',e['id']]);continue
        preserved[e['type']]+=1
        if e['type']=='building':
            for k in ['house_number','corpus_block','locality_id']:
                if e.get(k)!=out.get(k):errors.append(['changed_original',e['id'],k])
            if e.get('address_object_id')!=out.get('geonim_id'):errors.append(['changed_original_geonim_link',e['id']])
            if not set(e.get('district_ids',[]))<={d['district_id'] for d in out['districts']}:errors.append(['lost_district',e['id']])
            for d in out['districts']:
                if d['method'].startswith('source_full_address'):text_evidence[d['district_id']]+=1
            if e.get('address_object_id'):district_before[(e['locality_id'],e['address_object_id'])]|=set(e.get('district_ids',[]))
            if out.get('geonim_id'):district_after[(out['locality_id'],out['geonim_id'])]|={d['district_id'] for d in out['districts']}
        else:
            for lang,value in e['names'].items():
                if value and value!=out['names'].get(lang) and value not in [v['value'] for v in out['variants']]:errors.append(['lost_name',e['id'],lang])
    del source
    assert norm('Аксай 3')!=norm('Аксай 3а')
    assert house_family('дом 90 офис 37') is None and house_family('12а')==12 and house_family('12/3')==12
    assert admin['kato:151010000']['province']=='Актюбинская область'
    for aid in ['kato:710000000','kato:750000000','kato:790000000']:
        assert admin[aid]['province']==admin[aid]['city']
    for r in admin.values():
        if r['type']=='city' and (not r.get('city') or not r.get('province')):errors.append(['missing_city_province_rule',r['id']])
    for h in houses.values():
        if h.get('locality_id') and h['locality_id'] not in admin:errors.append(['house_locality',h['id']])
        if h.get('geonim_id') and h['geonim_id'] not in geos:errors.append(['house_geonim',h['id']])
        if h.get('geonim_id') and h['geonim_id'] in geos and geos[h['geonim_id']].get('locality_id')!=h.get('locality_id'):errors.append(['geonim_locality_mismatch',h['id']])
        for d in h['districts']:
            if d['district_id'] not in admin:errors.append(['district',h['id']])
        if h.get('locality_id') is None and h.get('locality_link',{}).get('status')=='matched':errors.append(['false_matched',h['id']])
        if h.get('active_status')=='inactive_in_source_snapshot' and h.get('neighbour_eligible'):errors.append(['inactive_neighbour',h['id']])
        if any(k in h for k in ['apartment','apartment_data','entrance','entrance_data','geometry','polygon']):errors.append(['forbidden_house_fields',h['id']])
    checks.update(original_records_preserved=dict(preserved),karaganda_text_districts=dict(text_evidence),
                  baseline_multidistrict_geonims=sum(len(v)>1 for v in district_before.values()),
                  preserved_multidistrict_geonims=sum(len(district_after[k])>1 for k,v in district_before.items() if len(v)>1),
                  record_counts={'admin':len(admin),'geonims':len(geos),'houses':len(houses)},
                  all_payload_files_under_100MB=all((release/s['path']).stat().st_size<100_000_000 for d in collections_meta.values() for s in d['shards']))
    if (release/'observation_links.json').exists():
        ids=set();counts=collections.Counter();house_counts=collections.Counter()
        for r in read_collection(release,'observation_links'):
            if r['id'] in ids:errors.append(['duplicate_observation',r['id']])
            ids.add(r['id']);counts[r['status']]+=1
            if r['house_ids']:house_counts[r['status']]+=1
            for hid in r['house_ids']:
                if hid not in houses:errors.append(['observation_house',hid])
            for gid in r['geonim_ids']:
                if gid not in geos:errors.append(['observation_geonim',gid])
        checks['observation_status_counts']=dict(counts);checks['house_observation_status_counts']=dict(house_counts)
        checks['all_extracted_observations_accounted_for']=len(ids)==manifest['extraction']['observations']['count']
        if not checks['all_extracted_observations_accounted_for']:errors.append(['missing_extracted_observations'])
    return {'passed':not errors,'errors':errors,'checks':checks,'manifest_sha256':digest(release/'manifest.json')}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=pathlib.Path,default=pathlib.Path('.'));ap.add_argument('--release',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True);ap.add_argument('--benchmark',choices=['full','stream']);a=ap.parse_args()
    result=benchmark(a.release,a.benchmark) if a.benchmark else verify(a.root,a.release)
    write_json(a.out,result);print(json.dumps(result,ensure_ascii=False),flush=True)
    if not a.benchmark and not result['passed']:sys.exit(1)
