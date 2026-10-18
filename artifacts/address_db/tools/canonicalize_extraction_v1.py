"""Resolve duplicated fallback events without losing unassembled source relations."""
import argparse,collections,json,pathlib
from db_common_v1 import *
from extract_country_v1 import Writer
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--input',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True);a=ap.parse_args()
    a.out.mkdir(parents=True,exist_ok=False);meta=json.loads((a.input/'extraction.json').read_text(encoding='utf-8'))
    result=dict(meta);counts=collections.Counter();removed={}
    for key,prefix in [('observations','observations'),('boundaries','boundaries')]:
        seen=set();writer=Writer(a.out,prefix);duplicates=0
        for row in iter_jsonl(a.input,meta[key]['files']):
            if row['id'] in seen:
                if row.get('geometry'):raise ValueError('Cannot silently discard duplicate geometry: '+row['id'])
                duplicates+=1;continue
            seen.add(row['id']);writer.put(row)
            if key=='observations':
                counts[row['id'][4:].split('/')[0]]+=1
                if row.get('geometry_status')=='area_not_assembled':counts['relation_without_assembled_geometry']+=1
            elif not row.get('geometry'):counts['boundary_without_assembled_geometry']+=1
        result[key]=writer.close();removed[key]=duplicates
    counts['area_geometry_errors']=meta['counts']['area_geometry_errors']
    result['counts']=dict(counts);result['schema_version']='country-extraction-3';result['canonicalization']={'source_extraction':a.input.name,'duplicates_removed':removed,'rule':'first geometry-bearing observation, later no-geometry fallback suppressed'}
    write_json(a.out/'extraction.json',result);print(dumps(result))
