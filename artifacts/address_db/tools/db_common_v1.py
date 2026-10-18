"""Stable schema and standard-library reader for immutable releases."""
import collections
import hashlib
import json
import pathlib
import re
import unicodedata

SCHEMA='jana-address-db/1.0'
LOCALITIES={'city','settlement','rural_locality','small_settlement'}

def dumps(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def digest(path):
    with pathlib.Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def write_json(path,value):
    with pathlib.Path(path).open('x',encoding='utf-8',newline='\n') as f:f.write(dumps(value)+'\n')
def norm(s):
    s=unicodedata.normalize('NFC',s or '').casefold().replace('ё','е')
    return re.sub(r'[^\w]+',' ',s,flags=re.UNICODE).strip()
def clean_locality(s):
    s=re.sub(r'^\s*(?:г\.|город\s+|с\.|село\s+|п\.|пос\.|поселок\s+|посёлок\s+)\s*','',s or '',flags=re.I)
    return re.sub(r'\s+(?:қ\.|а\.|к\.|кенті|ауылы|қаласы)$','',s,flags=re.I).strip()
def locality_key(s):return norm(clean_locality(s))
def district_key(s):
    return norm(re.sub(r'район|ауданы|имени|им\.|атындағы|атын\.|в городе','',s or '',flags=re.I))
def street_key(s):
    s=norm(s)
    tokens=r'(?:улица|ул|проспект|просп|пр т|переулок|пер|бульвар|бул|шоссе|көшесі|көш|даңғылы|даңғ|микрорайон|мкр|шағынауданы)'
    s=re.sub('^'+tokens+r'\s+','',s)
    return re.sub(r'\s+'+tokens+'$','',s).strip()
def generated_latin(s):
    table=dict(zip('абвгдеёзийклмнопрстуфхыэәіңғүұқөһ','abvgdeezijklmnoprstufhyeaiñğuuqoh'))
    table.update({'ж':'zh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ю':'yu','я':'ya','ь':'','ъ':'','й':'y'})
    return ''.join(table.get(c,c) for c in norm(s))
def name_values(record):
    return [v for v in record.get('names',{}).values() if isinstance(v,str) and v]
def street_types(record):
    """Explicit incompatible designators make a name group unsafe for neighbours."""
    patterns={'street':r'(?:улица|ул|көшесі|көше|street)',
              'avenue':r'(?:проспект|просп|пр т|даңғылы|даңғыл|avenue)',
              'lane':r'(?:переулок|пер|тұйық көше|тұйық көшесі|lane)',
              'boulevard':r'(?:бульвар|бул|boulevard)','highway':r'(?:шоссе|highway)'}
    values=name_values(record)+[v['value'] for v in record.get('variants',[]) if v.get('value')]
    kind=record.get('type')
    if isinstance(kind,dict):values += [v for k,v in kind.items() if k in {'ru','kk','source_default'} and isinstance(v,str)]
    types=set()
    for value in values:
        key=norm(value)
        # A compound Kazakh lane designator should not also count as a street.
        if re.search(r'(?:^| )тұйық көш(?:е|есі)$',key):types.add('lane');continue
        for name,pattern in patterns.items():
            if re.search('^'+pattern+'(?: |$)|(?:^| )'+pattern+'$',key):types.add(name)
    return types
def house_family(value):
    # Strict validation: words, unit markers, lists and numeric ranges are not neighbours.
    if not isinstance(value,str):return None
    m=re.fullmatch(r'\s*(\d+)(?:[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІіЁё])?(?:/\d+[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІіЁё]?)?\s*',value)
    return int(m.group(1)) if m else None
def shards_write(out,name,records):
    paths=[];chunk=[];size=2;count=0
    def flush():
        nonlocal chunk,size
        if not chunk:return
        filename=f'{name}-{len(paths):03d}.json'
        with (out/filename).open('xb') as f:f.write(b'['+b','.join(chunk)+b']\n')
        paths.append({'path':filename,'records':len(chunk),'bytes':(out/filename).stat().st_size,'sha256':digest(out/filename)})
        chunk=[];size=2
    for record in records:
        raw=dumps(record).encode('utf-8')
        if size+len(raw)+1>40_000_000:flush()
        chunk.append(raw);size+=len(raw)+1;count+=1
    flush()
    descriptor={'schema_version':SCHEMA,'collection':name,'record_count':count,'shards':paths}
    write_json(out/(name+'.json'),descriptor)
    return descriptor
def read_collection(release,name):
    release=pathlib.Path(release)
    descriptor=json.loads((release/(name+'.json')).read_text(encoding='utf-8'))
    for shard in descriptor['shards']:
        yield from json.loads((release/shard['path']).read_text(encoding='utf-8'))
def iter_jsonl(folder,files):
    for file in files:
        with (pathlib.Path(folder)/file).open(encoding='utf-8') as f:
            for line in f:yield json.loads(line)

def build_name_index(records):
    current=collections.defaultdict(set);historical=collections.defaultdict(set);generated=collections.defaultdict(set)
    for r in records:
        for value in name_values(r)+[v['value'] for v in r.get('variants',[]) if v.get('value')]:
            for key in {norm(value),street_key(value),locality_key(value)}:
                if key:current[key].add(r['id'])
            key=generated_latin(value)
            if key and key!=norm(value):generated[key].add(r['id'])
        for old in r.get('old_names',[]):
            if old.get('target_status')=='inherited_unverified':continue
            for key in {norm(old.get('old_name')),street_key(old.get('old_name'))}:
                if key:historical[key].add(r['id'])
    return [{'key':k,'current_ids':sorted(current[k]),'historical_ids':sorted(historical[k]),'generated_latin_ids':sorted(generated[k])}
            for k in sorted(current.keys()|historical.keys()|generated.keys())]
