"""Пакетный локальный интерфейс без HTTP."""
import argparse
import json
from pathlib import Path
from .parser import AddressParser

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--variant',choices=['A','B'],default='B')
    p.add_argument('--db',type=Path)
    p.add_argument('--explain',action='store_true')
    args=p.parse_args()
    data=json.loads(args.input.read_text(encoding='utf-8-sig'))
    records=data['records'] if isinstance(data,dict) else data
    parser=AddressParser(variant=args.variant,db_path=args.db)
    if args.explain:
        items=[]
        for item in records:
            e=parser.explain_address(item['raw_address']);record=e.pop('record');record['id']=item.get('id')
            items.append(dict(result=record,explain=e))
        output=dict(items=items)
    else: output=parser.parse_records(records)
    args.output.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
