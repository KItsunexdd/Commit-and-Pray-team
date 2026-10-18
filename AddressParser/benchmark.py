"""CPU-замер полного пакета; строки создаются вне измеряемого интервала."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import platform
import sys
import time
from .evaluate import DEV, read_jsonl
from .parser import AddressParser
from .contracts import validate_record
from .reference import ROOT

def peak_memory_bytes():
    if sys.platform=='win32':
        from ctypes import wintypes
        class Counters(ctypes.Structure):
            _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)]+[(n,ctypes.c_size_t) for n in
                ('PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage',
                 'QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage')]
        counters=Counters();counters.cb=ctypes.sizeof(counters)
        kernel=ctypes.WinDLL('kernel32',use_last_error=True);psapi=ctypes.WinDLL('psapi',use_last_error=True)
        kernel.GetCurrentProcess.restype=wintypes.HANDLE
        psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
        if psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(),ctypes.byref(counters),counters.cb):
            return counters.PeakWorkingSetSize
        return None
    try:
        import resource
        value=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return value if sys.platform=='darwin' else value*1024
    except ImportError:return None

def workload(kind='original'):
    raws=list(dict.fromkeys(r['raw_address'] for r in read_jsonl(DEV/'dev.jsonl')))
    dev_unique=len(raws)
    if kind=='regression':
        from collections import defaultdict
        families=defaultdict(list)
        with (ROOT/'datasets/train/train.jsonl').open(encoding='utf-8') as stream:
            for line in stream:
                r=json.loads(line);families[r['template_family']].append(r['raw_address'])
        seen=set(raws);position=0
        while len(raws)<1000:
            progress=False
            for family in sorted(families):
                if position>=len(families[family]):continue
                progress=True;raw=families[family][position]
                if raw not in seen:raws.append(raw);seen.add(raw)
                if len(raws)==1000:break
            if not progress:raise ValueError('Недостаточно различных строк')
            position+=1
        return [dict(id='repeat-'+str(i%17),raw_address=raw) for i,raw in enumerate(raws)],dev_unique
    cities=['Алматы','Актобе','Астана','Тараз','Шымкент','Караганда','Конаев']
    streets=['Абая','Назарбаева','Курильская','8 Марта','Маи\u0306ская','Св\u200bердлова','Туран','Достык']
    templates=[
        'город {city}, ул. {street} дом {n}, кв {apt}, подъезд {entrance}',
        '{street}{n}, город {city}, {apt}квартира, {entrance}подьезд',
        '{city}, {street} {n}/2а, ориентир: магазин Береке, этаж {floor}',
        '{city}, мкр Самал-{micro} {n}, {apt} пәтер',
        '{city}, ЖК Томирис {micro}, улица {street} дом {n} корп. 2',
        '{city}, {street} көшесі {n} үй, {apt} пәтер, {floor} қабат',
        '📦 город {city}; ул .{street} {n}; flat {apt}',
    ]
    i=0
    while len(raws)<1000:
        raw=templates[i%len(templates)].format(city=cities[i%len(cities)],street=streets[i%len(streets)],
                n=i+1,apt=str(i%257+1),entrance=i%8+1,floor=i%19+1,micro=i%7+1)
        if raw not in raws:raws.append(raw)
        i+=1
    return [dict(id='repeat-'+str(i%17),raw_address=raw) for i,raw in enumerate(raws)],dev_unique

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,required=True);p.add_argument('--variant',choices=['A','B'],default='B')
    p.add_argument('--workload',choices=['original','regression'],default='original')
    a=p.parse_args();rows,dev_unique=workload(a.workload)
    started=time.perf_counter();parser=AddressParser(variant=a.variant);startup=time.perf_counter()-started
    cpu=time.process_time();wall=time.perf_counter()
    output=parser.parse_records(rows)
    elapsed=time.perf_counter()-wall;cpu_elapsed=time.process_time()-cpu
    for incoming,result in zip(rows,output):
        validate_record(result)
        if incoming['id']!=result['id'] or incoming['raw_address']!=result['raw_address']:
            raise ValueError('Нарушен пакетный контракт')
    payload=''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows)
    metrics=dict(rows=len(rows),distinct_raw=len({r['raw_address'] for r in rows}),dev_unique=dev_unique,
                 synthetic_compositions=1000-dev_unique if a.workload=='original' else 0,
                 train_unique=1000-dev_unique if a.workload=='regression' else 0,workload=a.workload,
                 variant=a.variant,wall_seconds=elapsed,cpu_seconds=cpu_elapsed,
                 initialization_seconds=startup,peak_process_memory_bytes=peak_memory_bytes(),
                 under_300_seconds=elapsed<300,python=sys.version,platform=platform.platform(),cpu=platform.processor(),
                 logical_cpus=os.cpu_count(),workload_sha256=hashlib.sha256(payload.encode()).hexdigest(),
                 full_batch_measured=True,network_used=False,gpu_used=False,
                 timing_scope='parse_records: full decoding, lookup, enrichment, explanation computation, record adaptation; excludes JSON I/O and workload preparation')
    a.out.mkdir(parents=True,exist_ok=True)
    (a.out/'benchmark.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding='utf-8')
    (a.out/'input.jsonl').write_text(payload,encoding='utf-8')
    (a.out/'predictions.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in output),encoding='utf-8')
    parser.close()
    print(json.dumps(metrics,ensure_ascii=False))

if __name__=='__main__':main()
