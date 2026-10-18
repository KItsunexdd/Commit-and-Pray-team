import argparse,json,pathlib
from db_common_v1 import *
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--first',type=pathlib.Path,required=True);ap.add_argument('--second',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True);ap.add_argument('--extraction',action='store_true');a=ap.parse_args()
    compared=[];differences=[]
    if a.extraction:
        first=json.loads((a.first/'extraction.json').read_text(encoding='utf-8'));second=json.loads((a.second/'extraction.json').read_text(encoding='utf-8'))
        for key in ['observations','boundaries']:
            f=first[key];s=second[key]
            if f!=s:differences.append([key,'descriptor'])
            for name in f['files']:
                ok=(a.second/name).exists() and digest(a.first/name)==digest(a.second/name)
                compared.append({'path':name,'equal':ok})
                if not ok:differences.append([name,'bytes'])
    else:
        first=json.loads((a.first/'manifest.json').read_text(encoding='utf-8'));second=json.loads((a.second/'manifest.json').read_text(encoding='utf-8'))
        for key in ['collections','auxiliary_collections']:
            for name,f in first.get(key,{}).items():
                s=second.get(key,{}).get(name)
                equal=f==s;compared.append({'collection':name,'equal':equal,'records':f['record_count']})
                if not equal:differences.append([name,'semantic_payload'])
                for shard in f['shards']:
                    if not (a.second/shard['path']).exists() or digest(a.second/shard['path'])!=shard['sha256']:differences.append([shard['path'],'actual_second_hash'])
    result={'passed':not differences,'first':a.first.name,'second':a.second.name,'compared':compared,'differences':differences,
            'ignored':'wall-clock measurements, publication timestamp and manifest metadata; all consumer and audit collection payloads compared'}
    write_json(a.out,result);print(dumps(result))
