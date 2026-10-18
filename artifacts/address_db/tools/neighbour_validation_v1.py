"""Development reconstruction of source district labels; never a parser accuracy estimate."""
import argparse
import bisect
import collections
import json
import math
import pathlib
from db_common_v1 import *

POLICY={
 'version':'neighbour-validation/1','origin':'inferred','primary_rule':'street_parity_neighbour_interior',
 'decision_fixed_before_run':True,'unit':'complete_numeric_family_per_geonim_and_source',
 'eligibility':{'minimum_interior_families':100,'minimum_precision':0.97,'minimum_coverage':0.50,'minimum_wilson_lower_95':0.94,
                'multi_district_slice_minimum_families':30,'multi_district_slice_minimum_precision':0.97},
 'edge_uniform_enabled':False,'edge_uniform_reason':'No independent cities validated for deployment; reported only as a diagnostic.',
 'runtime_preconditions':['district absent from input','locality and exactly one geonim unambiguous','no exact house/corpus match',
                          'geonim has no conflicting explicit street-type designators',
                          'target numeric family, if already present, has no internal district conflict',
                          'no exact-record conflict','valid strict numeric-family syntax','two same-parity sides present',
                          'selected nearest family has one district','equidistant nearest families agree'],
 'limits':'Reconstruction of snapshot labels on development records. Not independent evidence for missing addresses, physical streets, or customer quality.'}

def prediction(families,n,mode):
    candidates=sorted(k for k in families if k!=n and k%2==n%2)
    if not candidates:return None,'singleton_parity'
    lower=[k for k in candidates if k<n];upper=[k for k in candidates if k>n]
    interior=bool(lower and upper)
    if not interior and mode=='interior':return None,'edge'
    if not interior and mode=='edge_uniform':
        ds=set().union(*(v for k,v in families.items() if k!=n))
        if any(len(v)!=1 for k,v in families.items() if k!=n):return None,'conflicting_family'
        return (next(iter(ds)),'edge_uniform') if len(ds)==1 else (None,'nonuniform_street')
    distance=min(abs(k-n) for k in candidates)
    nearest=[k for k in candidates if abs(k-n)==distance]
    if any(len(families[k])!=1 for k in nearest):return None,'conflicting_family'
    ds=set().union(*(families[k] for k in nearest))
    return (next(iter(ds)),'interior' if interior else 'edge') if len(ds)==1 else (None,'equidistant_conflict')

def stats_finish(c):
    n=c['given'];total=c['families'];correct=c['correct']
    p=correct/n if n else None
    lower=None
    if n:
        z=1.959963984540054
        lower=(p+z*z/(2*n)-z*math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/(1+z*z/n)
    return dict(c,precision=p,coverage=n/total if total else 0,wilson_lower_95=lower)

def run(release,out):
    out.mkdir(parents=True,exist_ok=False);write_json(out/'policy.json',POLICY)
    geos={g['id']:g for g in read_collection(release,'geonims')}
    conflicting_type_groups={gid for gid,g in geos.items() if len(street_types(g))>1}
    groups=collections.defaultdict(lambda:collections.defaultdict(set));excluded=collections.Counter();counts=collections.Counter()
    for h in read_collection(release,'house_districts'):
        n=house_family(h.get('house_number'));gid=h.get('geonim_id');loc=h.get('locality_id')
        if n is None:excluded['noncanonical_number']+=1;continue
        if not gid or not loc:excluded['missing_locality_or_geonim']+=1;continue
        if geos[gid].get('role')!='street':excluded['not_street']+=1;continue
        if gid in conflicting_type_groups:excluded['conflicting_street_type_group']+=1;continue
        if h.get('active_status')=='inactive_in_source_snapshot':excluded['inactive']+=1;continue
        # Separate provenance of labels, not just provenance of the house observation.
        ds_by_source=collections.defaultdict(set)
        for d in h['districts']:
            method=d.get('method','')
            source='karaganda_passport_text' if method.startswith('source_full_address') else 'osm_boundary'
            ds_by_source[source].add(d['district_id'])
        if not ds_by_source:excluded['no_district_label']+=1;continue
        for source,ds in ds_by_source.items():
            groups[(loc,source,gid)][n]|=ds;counts[(loc,source)]+=1
    totals=collections.defaultdict(collections.Counter);examples=[];family_rows=[]
    for (loc,source,gid),families in sorted(groups.items()):
        multi=len(set().union(*families.values()))>1
        for n,truth in sorted(families.items()):
            family_rows.append({'locality_id':loc,'source':source,'geonim_id':gid,'numeric_family':n,'district_ids':sorted(truth),'status':'conflict' if len(truth)>1 else 'observed'})
            parity=[k for k in families if k!=n and k%2==n%2]
            position='interior' if any(k<n for k in parity) and any(k>n for k in parity) else ('edge' if parity else 'singleton_parity')
            for mode in ['interior','edge','edge_uniform']:
                if mode=='edge' and position=='interior':continue
                if mode=='edge_uniform' and position=='interior':continue
                predicted,reason=prediction(families,n,mode)
                if len(truth)!=1:predicted=None;reason='hidden_family_conflict'
                correct=predicted is not None and predicted in truth
                for scope in ['all']+(['multi_district_geonim'] if multi else []):
                    c=totals[(loc,source,scope,mode,position)]
                    c['families']+=1;c['given']+=predicted is not None;c['correct']+=correct;c['wrong']+=predicted is not None and not correct;c['abstained']+=predicted is None
                    if predicted is None:c['refusal_'+reason]+=1
                if predicted is not None and not correct and len(examples)<200:
                    examples.append({'locality_id':loc,'source':source,'geonim_id':gid,'hidden_family':n,'truth':sorted(truth),'prediction':predicted,'mode':mode,'position':position})
    results=[dict(locality_id=k[0],source=k[1],scope=k[2],rule=k[3],position=k[4],**stats_finish(v)) for k,v in sorted(totals.items())]
    decisions=[];limits=POLICY['eligibility']
    for loc,source in sorted(counts):
        found={(r['scope'],r['rule'],r['position']):r for r in results if r['locality_id']==loc and r['source']==source}
        interior=found.get(('all','interior','interior'),{})
        multi=found.get(('multi_district_geonim','interior','interior'),{})
        reasons=[]
        if interior.get('families',0)<limits['minimum_interior_families']:reasons.append('insufficient_interior_families')
        if (interior.get('precision') or 0)<limits['minimum_precision']:reasons.append('precision_below_threshold')
        if interior.get('coverage',0)<limits['minimum_coverage']:reasons.append('coverage_below_threshold')
        if (interior.get('wilson_lower_95') or 0)<limits['minimum_wilson_lower_95']:reasons.append('wilson_lower_below_threshold')
        if multi and multi.get('families',0)<limits['multi_district_slice_minimum_families']:reasons.append('insufficient_multi_district_slice')
        if multi and (multi.get('precision') or 0)<limits['multi_district_slice_minimum_precision']:reasons.append('multi_district_precision_below_threshold')
        decisions.append({'locality_id':loc,'source':source,'interior_enabled':not reasons,'edge_enabled':False,'edge_uniform_enabled':False,'reasons':reasons})
    shards_write(out,'families',family_rows)
    write_json(out/'validation.json',{'release_manifest_sha256':digest(pathlib.Path(release)/'manifest.json'),'unit':POLICY['unit'],
                                     'excluded_observations':dict(excluded),'results':results,'decisions':decisions,'error_examples':examples,
                                     'interpretation':POLICY['limits']})
    print(json.dumps({'decisions':decisions,'groups':len(groups),'families':len(family_rows)},ensure_ascii=False),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--release',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True);a=ap.parse_args();run(a.release,a.out)
