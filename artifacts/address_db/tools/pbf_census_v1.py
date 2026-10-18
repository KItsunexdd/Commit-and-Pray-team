"""Independent no-geometry census of the documented address observation selection."""
import argparse
import collections
import json
import pathlib
import sys
import time
sys.path.insert(0,str(pathlib.Path(__file__).parent/'vendor'))
import osmium
from db_common_v1 import *

def selected(t):
    address=any(k in t for k in ['addr:housenumber','addr:street','addr:place'])
    place=t.get('place') in ['city','town','village','hamlet','isolated_dwelling','suburb','neighbourhood','quarter','city_block']
    road='highway' in t and any(k=='name' or k.startswith('name:') for k in t)
    residential=(t.get('landuse')=='residential' or bool(t.get('residential'))) and bool(t.get('name'))
    complex_name=t.get('name','').lower().startswith(('жк ','жк «','жилой комплекс'))
    return address or place or road or residential or complex_name

class Census(osmium.SimpleHandler):
    def __init__(self,observed):
        super().__init__();self.observed=observed;self.missing=[];self.counts=collections.Counter();self.outside_selector=[]
    def check(self,obj,kind):
        t=dict(obj.tags)
        if not selected(t):return
        oid=f'osm:{kind}/{obj.id}';self.counts[kind]+=1
        if oid not in self.observed:self.missing.append({'id':oid,'tags':t})
        else:self.observed.remove(oid)
    def node(self,obj):self.check(obj,'node')
    def way(self,obj):self.check(obj,'way')
    def relation(self,obj):self.check(obj,'relation')

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=pathlib.Path,required=True);ap.add_argument('--extraction',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True);a=ap.parse_args()
    t=time.perf_counter();meta=json.loads((a.extraction/'extraction.json').read_text(encoding='utf-8'))
    ids=set();duplicates=[]
    for r in iter_jsonl(a.extraction,meta['observations']['files']):
        if r['id'] in ids:duplicates.append(r['id'])
        ids.add(r['id'])
    h=Census(ids)
    h.apply_file(osmium.io.File(str(a.root/'Data/research/raw/osm_kazakhstan_pbf.bin'),'pbf'),filters=[osmium.filter.KeyFilter('addr:housenumber','addr:street','addr:place','place','highway','residential','landuse','name')])
    result={'counts':dict(h.counts),'expected':sum(h.counts.values()),'extracted':meta['observations']['count'],'missing':h.missing,
            'unexpected_ids':sorted(h.observed),'duplicates':duplicates,'passed':not h.missing and not h.observed and not duplicates,
            'elapsed_seconds':time.perf_counter()-t,'selection_scope':'documented address observations, not every OSM object or real-world address'}
    write_json(a.out,result);print(json.dumps({k:v for k,v in result.items() if k not in {'missing','unexpected_ids','duplicates'}},ensure_ascii=False),flush=True)
    if not result['passed']:sys.exit(1)
