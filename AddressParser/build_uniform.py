"""Проверка geonim_uniform с исключением каждого домового ключа до вывода."""
import argparse
from collections import Counter,defaultdict
import hashlib
import itertools
import json
import math
from pathlib import Path
import sqlite3
from .reference import ROOT,Reference
from .uniform import is_territory

POLICY=dict(schema_version='geonim-uniform/1',minimum_houses=3,minimum_precision=.99,
            minimum_wilson_lower_95=.97,minimum_predictions=100,minimum_geonims=10,
            incomplete_labels='abstain',conflicting_observations='abstain',
            unit='unique locality/geonim/house number/corpus; all observations of held-out key removed',
            validation='leave_one_house_out; mixed-district groups included; alias groups deduplicated',
            selection='fixed thresholds before measurements; no test/calibration input')

def wilson(correct,total):
    if not total:return None
    p=correct/total;z=1.959963984540054
    return (p+z*z/(2*total)-z*math.sqrt(p*(1-p)/total+z*z/(4*total*total)))/(1+z*z/total)

def loo_counts(houses,minimum=3):
    """Агрегированное вычисление равносильно последовательному удалению ключей."""
    labels=Counter(d for ds,bad in houses for d in ds if len(ds)==1 and not bad)
    blocked=sum(len(ds)!=1 or bad for ds,bad in houses)
    eligible=sum(labels.values());given=correct=0
    if len(houses)-1>=minimum and blocked==0:
        for truth,count in labels.items():
            remaining={d for d,n in labels.items() if n-(d==truth)>0}
            if len(remaining)==1:
                given+=count;correct+=count*(next(iter(remaining))==truth)
    return dict(eligible=eligible,given=given,correct=correct,wrong=given-correct,abstained=eligible-given)

def build(out):
    out=Path(out);out.mkdir(parents=True,exist_ok=False)
    (out/'policy.json').write_text(json.dumps(POLICY,ensure_ascii=False,indent=2),encoding='utf-8')
    ref=Reference();source=ref.db
    admins={r['aid']:dict(r) for r in source.execute('SELECT aid,id,city_display,display_name,type FROM admin')}
    geos={r['gid']:dict(r) for r in source.execute('SELECT gid,id,type_conflict,role,type_json,names_json FROM geonims')}
    territories={gid for gid,g in geos.items() if is_territory(g)}
    alias_groups=defaultdict(set)
    aliases=source.execute('SELECT g.locality,n.key,g.gid FROM name_targets n JOIN geonims g ON g.gid=n.target '
                          'WHERE n.kind=1 AND g.locality IS NOT NULL ORDER BY g.locality,n.key,g.gid')
    for (locality,key),group in itertools.groupby(aliases,lambda r:(r[0],r[1])):
        alias_groups[locality].add(tuple(sorted({r[2] for r in group})))
    needed={(loc,gid) for loc,groups in alias_groups.items() for group in groups if len(group)>1 for gid in group}
    multi_houses={};single_counts={};territory_single={}
    territory_metrics={minimum:defaultdict(Counter) for minimum in (2,3)}
    territory_alias_metrics={minimum:defaultdict(Counter) for minimum in (2,3)}
    path=out/'uniform.sqlite';db=sqlite3.connect(path)
    db.executescript('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT); '
       'CREATE TABLE cities(id TEXT PRIMARY KEY,enabled INTEGER,metrics TEXT); '
       'CREATE TABLE territory_cities(id TEXT PRIMARY KEY,enabled INTEGER,metrics TEXT); '
       'CREATE TABLE geonims(city TEXT,id TEXT,houses INTEGER,missing INTEGER,conflicts INTEGER,district TEXT,'
       'PRIMARY KEY(city,id)) WITHOUT ROWID;')
    db.execute('INSERT INTO metadata VALUES (?,?)',('policy',json.dumps(POLICY)))
    sql='''SELECT h.locality,h.geonim,h.number,h.corpus,h.flags,GROUP_CONCAT(DISTINCT d.district) AS districts
       FROM houses h LEFT JOIN house_districts d ON d.locality=h.locality AND d.geonim=h.geonim
       AND d.number=h.number AND d.corpus=h.corpus AND (d.status & 1)!=0
       WHERE (h.flags & 1)!=0 GROUP BY h.locality,h.geonim,h.number,h.corpus
       ORDER BY h.locality,h.geonim,h.number,h.corpus'''
    metrics=defaultdict(Counter)
    for (locality,gid),group in itertools.groupby(source.execute(sql),lambda r:(r['locality'],r['geonim'])):
        houses=[]
        physical={}
        for r in group:
            ds=tuple(int(d) for d in r['districts'].split(',')) if r['districts'] else ()
            houses.append((ds,bool(r['flags']&12) or bool(geos[gid]['type_conflict'])))
            if (locality,gid) in needed:physical[(r['number'],r['corpus'])]=houses[-1]
        if physical:multi_houses[(locality,gid)]=physical
        c=metrics[locality];c['geonims']+=1;c['houses']+=len(houses)
        counts=loo_counts(houses);c.update(counts)
        single_counts[(locality,gid)]=counts
        if gid in territories:
            for minimum in (2,3):
                tcounts=loo_counts(houses,minimum)
                territory_single[(locality,gid,minimum)]=tcounts
                tc=territory_metrics[minimum][locality];tc.update(tcounts)
                tc['predicted_geonims']+=tcounts['given']>0
        c['predicted_geonims']+=counts['given']>0
        ds={d for labels,bad in houses for d in labels}
        missing=sum(not labels for labels,bad in houses)
        conflicts=sum(bad or len(labels)>1 for labels,bad in houses)
        did=admins[next(iter(ds))]['id'] if len(ds)==1 else None
        db.execute('INSERT INTO geonims VALUES (?,?,?,?,?,?)',(admins[locality]['id'],geos[gid]['id'],len(houses),missing,conflicts,did))
    alias_metrics=defaultdict(Counter)
    for loc,groups in alias_groups.items():
        for gids in sorted(groups):
            if len(gids)==1:counts=single_counts.get((loc,gids[0]),dict(eligible=0,given=0,correct=0,wrong=0,abstained=0))
            else:
                merged={}
                for gid in gids:
                    for key,(ds,bad) in multi_houses.get((loc,gid),{}).items():
                        if key not in merged:merged[key]=(set(),False)
                        prior,prior_bad=merged[key];merged[key]=(prior|set(ds),prior_bad or bad or not ds)
                counts=loo_counts(list(merged.values()))
            alias_metrics[loc].update(counts)
            alias_metrics[loc]['candidate_sets']+=1
            if all(gid in territories for gid in gids):
                for minimum in (2,3):
                    tc=territory_alias_metrics[minimum][loc]
                    tcounts=(territory_single.get((loc,gids[0],minimum),dict(eligible=0,given=0,correct=0,wrong=0,abstained=0))
                             if len(gids)==1 else loo_counts(list(merged.values()),minimum))
                    tc.update(tcounts);tc['candidate_sets']+=1
    results=[]
    for locality,counter in sorted(metrics.items()):
        c=dict(counter);n=c['given'];precision=c['correct']/n if n else None;lower=wilson(c['correct'],n)
        alias=dict(alias_metrics[locality]);alias_n=alias.get('given',0)
        alias_precision=alias['correct']/alias_n if alias_n else None
        alias_lower=wilson(alias.get('correct',0),alias_n)
        enabled=(n>=POLICY['minimum_predictions'] and c['predicted_geonims']>=POLICY['minimum_geonims']
                 and precision>=POLICY['minimum_precision'] and lower>=POLICY['minimum_wilson_lower_95'])
        enabled=enabled and alias_n>=POLICY['minimum_predictions'] and alias_precision>=POLICY['minimum_precision'] and alias_lower>=POLICY['minimum_wilson_lower_95']
        alias.update(precision=alias_precision,wilson_lower_95=alias_lower)
        c.update(city_id=admins[locality]['id'],city=admins[locality]['city_display'] or admins[locality]['display_name'],
                 precision=precision,wilson_lower_95=lower,coverage=n/c['eligible'] if c['eligible'] else None,
                 aliases=alias,enabled=enabled)
        results.append(c)
        db.execute('INSERT INTO cities VALUES (?,?,?)',(c['city_id'],enabled,json.dumps(c,ensure_ascii=False)))
        territory={}
        for minimum in (2,3):
            stages={}
            for label,values in [('geonims',territory_metrics),('aliases',territory_alias_metrics)]:
                v=dict(values[minimum][locality]);given=v.get('given',0);correct=v.get('correct',0)
                v.update(precision=correct/given if given else None,wilson_lower_95=wilson(correct,given))
                stages[label]=v
            territory[str(minimum)]=stages
        accepted=enabled
        for label in ('geonims','aliases'):
            two=territory['2'][label];three=territory['3'][label]
            accepted=accepted and (two.get('given',0)>=POLICY['minimum_predictions']
                 and three['precision'] is not None and two['precision']>=three['precision']
                 and two['precision']>=POLICY['minimum_precision']
                 and two['wilson_lower_95']>=POLICY['minimum_wilson_lower_95'])
        accepted=bool(accepted and territory['2']['geonims'].get('predicted_geonims',0)>=POLICY['minimum_geonims'])
        territory.update(enabled=accepted,minimum_houses=2,classification='reference role address_area or microdistrict type/name',
                         acceptance='both geonim and alias precision >= threshold 3 on same territory subset; general city gate and fixed sample gates')
        c['territories']=territory
        db.execute('INSERT INTO territory_cities VALUES (?,?,?)',(c['city_id'],accepted,json.dumps(territory,ensure_ascii=False)))
    digest=hashlib.sha256(ref.path.read_bytes()).hexdigest()
    db.execute('INSERT INTO metadata VALUES (?,?)',('source_sha256',json.dumps(digest)));db.commit();db.close()
    report=dict(policy=POLICY,source_sha256=digest,cities=results,
                interpretation='Reconstruction of reference snapshot labels, not independent geography or delivery quality.',
                output_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    (out/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(cities=len(results),enabled=[c for c in results if c['enabled']]),ensure_ascii=True))

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--out',type=Path,default=ROOT/'artifacts/baseline/v2/uniform-v2')
    build(ap.parse_args().out)
