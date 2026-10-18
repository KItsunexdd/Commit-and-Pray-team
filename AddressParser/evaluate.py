"""Оценка по позиции и explicit eligibility; конфигурация задаёт веса полей."""
import argparse
from collections import defaultdict
import copy
import hashlib
import json
from pathlib import Path
import time
import unicodedata
from .parser import AddressParser
from .contracts import validate_record
from .reference import ROOT

DEV = ROOT / 'datasets/evaluation/gold/T3.1_A1'

def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]

def normalized(value, field, config, mode='primary'):
    if value is None: return None
    if not isinstance(value,str): return ('invalid_type',type(value).__name__)
    keep = '/-' if mode != 'judge_literal' and field in config['number_fields'] else ''
    return ' '.join(''.join(c for c in value.lower() if not unicodedata.category(c).startswith('P') or c in keep).split())

def unresolved(row):
    return {f for a in row.get('ambiguity',[]) if a.get('kind')=='unresolved' for f in a['fields']}

def eligible(row, config):
    scored={f for g in config['groups'].values() for f in g['fields']}
    return [f for f in config['fields'] if f in scored and row['origin'][f]=='explicit'
            and row['expected'][f] is not None and f not in unresolved(row)]

def fraction(correct,total): return correct/total if total else None

def score(rows, predictions, config, mode='primary', eligibility=None):
    if len(rows)!=len(predictions): raise ValueError('Число ответов не совпадает с числом входов')
    if eligibility is not None and len(eligibility)!=len(rows): raise ValueError('Длина eligibility не совпадает')
    stats={f:dict(correct=0,total=0,absent_extra=0,absent=0,inferred_correct=0,inferred=0) for f in config['fields']}
    groups={g:dict(records=0,exact=0,fully_present=0,fully_present_exact=0,partially_present=0) for g in config['groups']}
    errors=[]
    for i,(row,pred) in enumerate(zip(rows,predictions)):
        validate_record(pred)
        if pred['raw_address']!=row['raw_address']: raise ValueError(f'Изменён raw в позиции {i}')
        if 'id' in row and pred['id']!=row['id']: raise ValueError(f'Изменён id в позиции {i}')
        fields=eligible(row,config)
        if eligibility is not None:
            e=eligibility[i]
            if e['position_zero_based']!=i or e['record_key']!=row['record_key'] or set(fields)!=set(e['eligible_scored_fields']):
                raise ValueError(f'Eligibility не соответствует spec в позиции {i}')
        matches={f:normalized(pred[f],f,config,mode)==normalized(row['expected'][f],f,config,mode) for f in config['fields']}
        bad={}
        for f in config['fields']:
            s=stats[f]
            if f in fields:
                s['total']+=1; s['correct']+=matches[f]
                if not matches[f]: bad[f]=dict(expected=row['expected'][f],actual=pred[f])
            if row['origin'][f]=='absent':
                s['absent']+=1; s['absent_extra']+=pred[f] is not None
            if row['origin'][f]=='inferred' and f not in unresolved(row):
                s['inferred']+=1; s['inferred_correct']+=matches[f]
        if bad: errors.append(dict(position=i,record_key=row.get('record_key'),raw_address=row['raw_address'],fields=bad))
        for name,g in config['groups'].items():
            present=set(fields)&set(g['fields']); s=groups[name]
            if present:
                s['records']+=1; s['exact']+=all(matches[f] for f in present)
                full=len(present)==len(g['fields'])
                s['fully_present']+=full; s['partially_present']+=not full
                s['fully_present_exact']+=full and all(matches[f] for f in present)
    for s in stats.values():
        s['accuracy']=fraction(s['correct'],s['total'])
        s['absent_extra_rate']=fraction(s['absent_extra'],s['absent'])
        s['inferred_accuracy']=fraction(s['inferred_correct'],s['inferred'])
    for name,g in config['groups'].items():
        values=[stats[f]['accuracy'] for f in g['fields'] if stats[f]['total']]
        groups[name]['accuracy']=sum(values)/len(values) if values else None
        s=groups[name]
        s['exact_match']=fraction(s['exact'],s['records'])
        s['fully_present_exact_match']=fraction(s['fully_present_exact'],s['fully_present'])
    nonempty=[(g,config['groups'][g]['weight']) for g,s in groups.items() if s['accuracy'] is not None]
    total=sum(s['total'] for s in stats.values()); correct=sum(s['correct'] for s in stats.values())
    return dict(rows=len(rows),primary=sum(groups[g]['accuracy']*w for g,w in nonempty)/sum(w for g,w in nonempty) if nonempty else None,
                eligible_cells=total,micro_accuracy=fraction(correct,total),fields=stats,groups=groups,
                absent_extra_rate=fraction(sum(s['absent_extra'] for s in stats.values()),sum(s['absent'] for s in stats.values())),
                excluded_unresolved_cells=sum(len(unresolved(r)) for r in rows),errors=errors)

def sensitivity(rows,predictions,config):
    baseline=score(rows,predictions,config)
    policies=defaultdict(list)
    for i,row in enumerate(rows):
        for amb in row.get('ambiguity',[]):
            if amb.get('kind')=='policy_sensitivity': policies[amb.get('policy','unnamed')].append((i,amb))
    results={}
    for policy,items in policies.items():
        scenarios=[]
        explicit_cells=sum(sum(rows[i]['origin'][f]=='explicit' for f in a['fields']) for i,a in items)
        inferred_cells=sum(sum(rows[i]['origin'][f]=='inferred' for f in a['fields']) for i,a in items)
        for index in range(max(len(a.get('alternatives',[])) for i,a in items)):
            changed=copy.deepcopy(rows); affected=set(); changed_cells=0
            for i,a in items:
                alts=a.get('alternatives',[])
                if index>=len(alts): continue
                alt=alts[index]
                for section in ('expected','origin','spans'):
                    changed[i][section].update(alt.get(section,{}))
                affected.add(i); changed_cells+=len(alt.get('expected',{}))
            measured=score(changed,predictions,config)
            scenarios.append(dict(alternative_index=index,rows=len(affected),cells=changed_cells,
                                  explicit_cells=explicit_cells,inferred_cells=inferred_cells,
                                  primary=measured['primary'],eligible_cells=measured['eligible_cells'],
                                  eligible_delta=measured['eligible_cells']-baseline['eligible_cells'],
                                  primary_delta=measured['primary']-baseline['primary'] if measured['primary'] is not None and baseline['primary'] is not None else None))
        results[policy]=scenarios
    # Каждая unresolved-ветка заменяет связанные поля целиком. Никакого выбора лучшей ветки.
    unresolved_results=[]
    for i,row in enumerate(rows):
        for ambiguity_index,a in enumerate(row.get('ambiguity',[])):
            if a.get('kind')!='unresolved': continue
            for index,alt in enumerate(a.get('alternatives',[])):
                changed=copy.deepcopy(row)
                for section in ('expected','origin','spans'): changed[section].update(alt.get(section,{}))
                changed['ambiguity']=[v for j,v in enumerate(changed['ambiguity']) if j!=ambiguity_index]
                scenario=list(rows);scenario[i]=changed
                result=score(scenario,predictions,config)
                unresolved_results.append(dict(position=i,ambiguity_index=ambiguity_index,alternative_index=index,
                                               scope='one_whole_alternative_in_full_dev',
                                               primary=result['primary'],eligible_cells=result['eligible_cells'],
                                               eligible_delta=result['eligible_cells']-baseline['eligible_cells'],
                                               primary_delta=result['primary']-baseline['primary'] if result['primary'] is not None and baseline['primary'] is not None else None))
    results['unresolved_alternative_scenarios']=unresolved_results
    return results

def verify_dev_manifest():
    manifest=json.loads((DEV/'DEV_MANIFEST.json').read_text(encoding='utf-8'))
    results={}
    for relative,entry in manifest['artifacts'].items():
        allowed={str((DEV/f).relative_to(ROOT)).replace('\\','/') for f in
                 ('dev.jsonl','eligibility/dev.jsonl','annotation_spec.md','evaluation_config.json','README.md')}
        if relative not in allowed: raise ValueError('Manifest содержит неразрешённый путь')
        value=hashlib.sha256((ROOT/relative).read_bytes()).hexdigest()
        if value!=entry['sha256']: raise ValueError('Hash входа изменился: '+relative)
        results[relative]=value
    return results

def run(out,variant='B',beam_width=8,dataset='dev'):
    hashes=verify_dev_manifest()
    if dataset not in ('dev','train'): raise ValueError('Разрешены только dev и train')
    data_path=DEV/'dev.jsonl' if dataset=='dev' else ROOT/'datasets/train/train.jsonl'
    rows=read_jsonl(data_path)
    eligibility=read_jsonl(DEV/'eligibility/dev.jsonl') if dataset=='dev' else None
    hashes[str(data_path.relative_to(ROOT)).replace('\\','/')]=hashlib.sha256(data_path.read_bytes()).hexdigest()
    config=json.loads((DEV/'evaluation_config.json').read_text(encoding='utf-8'))
    parser=AddressParser(variant=variant,beam_width=beam_width)
    started=time.perf_counter()
    predictions=parser.parse_records([dict(id=r.get('id'),raw_address=r['raw_address']) for r in rows])
    elapsed=time.perf_counter()-started
    result=score(rows,predictions,config,eligibility=eligibility)
    result['judge_literal']=score(rows,predictions,config,mode='judge_literal',eligibility=eligibility)['primary']
    result['sensitivity']=sensitivity(rows,predictions,config) if dataset=='dev' else None
    result['slices']={}
    for tag in sorted({t for r in rows for t in r['tags']}):
        positions=[i for i,r in enumerate(rows) if tag in r['tags']]
        s=score([rows[i] for i in positions],[predictions[i] for i in positions],config)
        result['slices'][tag]={k:s[k] for k in ('rows','primary','eligible_cells','micro_accuracy')}
    result['by_template_family']={}
    for family in sorted({r['template_family'] for r in rows}):
        positions=[i for i,r in enumerate(rows) if r['template_family']==family]
        s=score([rows[i] for i in positions],[predictions[i] for i in positions],config)
        result['by_template_family'][family]={k:s[k] for k in ('rows','primary','eligible_cells','micro_accuracy','fields','groups')}
    result.update(variant=variant,beam_width=beam_width,elapsed_seconds=elapsed,input_sha256=hashes,
                  dataset='T3.1_A1/dev' if dataset=='dev' else 'train',synthetic=True,
                  entity_groups=len({r['entity_group'] for r in rows}),
                  template_families=len({r['template_family'] for r in rows}))
    out=Path(out); out.mkdir(parents=True,exist_ok=True)
    (out/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'predictions.jsonl').write_text(''.join(json.dumps(p,ensure_ascii=False)+'\n' for p in predictions),encoding='utf-8')
    parser.close()
    return result

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out',type=Path,required=True); ap.add_argument('--variant',choices=['A','B'],default='B')
    ap.add_argument('--beam-width',type=int,default=8)
    ap.add_argument('--dataset',choices=['dev','train'],default='dev')
    args=ap.parse_args(); result=run(args.out,args.variant,args.beam_width,args.dataset)
    print(json.dumps({k:result[k] for k in ('primary','micro_accuracy','eligible_cells','elapsed_seconds')},ensure_ascii=False))

if __name__=='__main__': main()
