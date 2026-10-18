"""Детерминированный разбор: маркеры, интервальные кандидаты и справочник."""
import json
import math
import os
import re
import threading
import unicodedata
from pathlib import Path
from .contracts import ADDRESS_FIELDS, SLICE_FIELDS, empty_record, validate_record, trim_span, SPACE_CF, CF_CLASS, word_boundaries, spaced_words
from .reference import ROOT, Reference, EmptyReference, normalize, district_name
from .neighbours import Neighbours
from .administrative import LOCALITY_TYPES, PREFIX as CITY_PREFIX, city_options as find_city_options
from .uniform import UniformDistricts, is_territory
from .territories import TerritoryDistricts

LET = r'[^\W\d_]'
LITERAL = r'(?:[кk]\d+|[a-zа-яәғқңөұүһіё](?![^\W\d_]))'
NUM = r'-?\d+'+LITERAL+r'?(?:/\d+'+LITERAL+r'?)?'
NUMBER = re.compile(NUM, re.I)
CORPUS_GAP=r'(?:'+SPACE_CF+r'+|'+SPACE_CF+r'*[,;]'+SPACE_CF+r'*)'
HOUSE_PARTS=re.compile(r'(.+?)(?:'+CORPUS_GAP+r'(?:корп(?:ус|\.)?|[кk]\.?)'+SPACE_CF+r'*|[кk])([\w]+)',re.I)
HOUSE_APARTMENT=re.compile(r'(?<![\d/-])(?P<house>\d+'+LITERAL+r'?(?:/\d+'+LITERAL+r'?)?)-(?P<apartment>\d+)$',re.I)
WORD = r'[^\W\d_][\w\-\u0300-\u036f'+CF_CLASS+']*'
MARKERS = {
    'house': r'дом|д\s*\.?|house|үй',
    'apartment': r'квартира|квартиры|кв-ра|квар\.|кв\.?|apt\.?|apartment|flat|kv\.?|пәтер',
    'entrance': r'подъезд|подьезд|подезд|подъез|под\.?|entrance|кіреберіс',
    'floor': r'(?:этаж|етаж|этж)\.?|эт\.?|қабат|floor',
}
STREET_TYPES = {
    'улица': r'улица|ул(?:\s*\.)?|көшесі|көш\.?|street|str\.?|st\.?',
    'проспект': r'проспект|пр-т|пр\.?|avenue|ave\.?|даңғылы',
    'микрорайон': r'микрорайон|мкр(?:-?н)?\.?|м-н\.?|шағын\s+аудан(?:ы)?|microdistrict|mkr\.?',
    'переулок': r'переулок|пер\.?', 'квартал': r'квартал',
    'бульвар': r'бульвар|бул\.?', 'проезд': r'проезд', 'ЖК': r'жк',
}
CITY_SUFFIX = re.compile(r'\s+(?:қаласы|ауылы|кенті)(?!\w)', re.I)
GLUED_TYPES={'улица':r'(?:улица|(?-i:ул|Ул)\.?)','проспект':r'(?:проспект|(?-i:пр|Пр)\.?)',
             'микрорайон':r'(?:микрорайон|(?-i:мкр|Мкр)\.?)',
             'переулок':r'(?:переулок|(?-i:пер|Пер)\.?)','квартал':'квартал','бульвар':'бульвар','проезд':'проезд'}
STREET_RE = re.compile(r'(?<![^\W\d_])(?:'+'|'.join(
    '(?P<t%d>(?:%s)(?![^\\W\\d_])%s)' % (i,v,
       '|'+GLUED_TYPES[k]+r'(?=(?-i:[A-ZА-ЯӘҒҚҢӨҰҮҺІЁ]))' if k in GLUED_TYPES else '')
    for i,(k,v) in enumerate(STREET_TYPES.items()))+r')',re.I)
TYPE_NAMES = list(STREET_TYPES)
PHONE_RE=re.compile(r'(?<!\w)(?:(?:тел(?:ефон)?\.?|т\.)\s*:?\s*)?'
                    r'(?:\+7[\s()-]*(?:\d[\s()-]*){9}\d|\d{10,11})(?!\d)',re.I)
LIVING_RE=re.compile(r'(?<!\w)(?:ж/м|ж\.м\.|жилмассив|жилой\s+массив|мкр-н)(?![^\W\d_])',re.I)

def tokens(raw):
    """Без нормализации raw; объединяем marks/Cf с буквенным токеном."""
    result = []
    start = 0
    kind = None
    boundaries=set(word_boundaries(raw))
    for i, c in enumerate(raw):
        cat = unicodedata.category(c)
        current = 'number' if c.isdigit() else 'word' if cat[0] in 'LM' or cat == 'Cf' else 'separator'
        if current != kind or i in boundaries:
            if kind is not None:
                result.append(dict(text=raw[start:i], key=normalize(raw[start:i]), start=start, end=i, kind=kind))
            start, kind = i, current
    if kind is not None:
        result.append(dict(text=raw[start:], key=normalize(raw[start:]), start=start, end=len(raw), kind=kind))
    return result

def trim(raw, start, end):
    return trim_span(raw,start,end)

def overlap(a,b): return a[0] < b[1] and b[0] < a[1]

def tail_locality(raw,free,reference):
    """Известный город завершает часть строки только после адресного номера."""
    for segment in re.finditer(r'[^,;\n]+',free):
        a,b=trim(free,*segment.span())
        numbers=list(NUMBER.finditer(free,a,b))
        if not numbers:continue
        number=numbers[-1]
        if number.start()>a and free[number.start()-1] in '-/':continue
        if number.end()>=b or not re.fullmatch(SPACE_CF,free[number.end()]):continue
        if re.search(r'(?<!\w)(?:'+ '|'.join(MARKERS[f] for f in ('apartment','entrance','floor'))+')'+SPACE_CF+'*$',free[:number.start()],re.I):continue
        head=STREET_RE.sub('',free[:number.start()])
        if not re.search(LET,head):continue
        tail=free[number.end():b]
        if re.search(r'(?<!\w)(?:'+ '|'.join(MARKERS.values())+r'|магазин|рядом|возле|напротив)(?!\w)',tail,re.I):continue
        starts={number.end()+m.start() for m in re.finditer(WORD,tail)}
        starts.update(number.end()+n for n in word_boundaries(tail))
        for start in sorted(starts):
            name=spaced_words(raw[start:b])
            found=[c for c in reference.admins(name) if c['type'] in ('city','town')]
            if len({c['id'] for c in found})!=1:continue
            ta,tb=trim(raw,number.end(),start)
            # Хвост допускает короткое имя района, но не новую адресную часть.
            if len(spaced_words(raw[ta:tb]).split())>3 or STREET_RE.search(raw,ta,tb):continue
            return dict(city=(8,start,b,start,b,raw[start:b],found),house=number.span(),tail=(ta,tb))
    return None

def street_tail_locality(raw,free,reference,province=None):
    """Хвост имени становится городом только вместе с подтверждённой улицей."""
    options=[]
    for segment in re.finditer(r'[^,;\n]+',free):
        a,b=trim(free,*segment.span())
        marker=STREET_RE.match(free,a,b)
        if marker:a=marker.end()
        number=NUMBER.search(free,a,b)
        if number:b=number.start()
        a,b=trim(free,a,b)
        starts={m.start() for m in re.finditer(WORD,free[a:b])}
        starts.update(word_boundaries(free[a:b]))
        for offset in sorted(starts):
            start=a+offset
            sa,sb=trim(raw,a,start)
            if sa>=sb:continue
            name=spaced_words(raw[start:b])
            cities=[c for c in reference.admins(name) if c['type'] in ('city','town')
                    and (not province or c['province']==province)]
            for city in cities:
                if reference.geonims(raw[a:b],city['id']):continue
                streets=[g for g in reference.geonim_forms(raw[sa:sb],city['id']) if g['role']=='street']
                if streets:
                    options.append(dict(city=(8,start,b,start,b,raw[start:b],[city]),
                                        geonim_ids=[g['id'] for g in streets]))
    return options[0] if len(options)==1 else None

def candidate(field, start, end, score, method, value=None, evidence=None):
    c = dict(field=field, spans=[[start,end]], score=score, method=method)
    if value is not None: c['value'] = value
    if evidence: c['evidence'] = evidence
    return c

def decode(candidates, width=8):
    """Ограниченный поиск: одно значение поля, непересекающиеся интервалы."""
    encoded={id(c):json.dumps(c,ensure_ascii=False,sort_keys=True) for c in candidates}
    groups = {}
    for c in candidates: groups.setdefault(c['field'], []).append(c)
    states = [(0.0, [])]
    for field, choices in groups.items():
        next_states = list(states)
        for score, chosen in states:
            for c in choices:
                if any(overlap(a,b) for old in chosen for a in old['spans'] for b in c['spans']): continue
                next_states.append((score+c['score'], chosen+[c]))
        next_states.sort(key=lambda s: (-s[0], '['+', '.join(encoded[id(c)] for c in s[1])+']'))
        states = next_states[:width]
    return states

class AddressParser:
    def __init__(self, variant='B', beam_width=8, db_path=None, provider=None, mapping_path=None,
                 reference=True, neighbours_path=None, uniform_path=None, territories_path=None):
        if variant not in ('A','B'): raise ValueError('variant должен быть A или B')
        if not isinstance(beam_width,int) or beam_width < 1: raise ValueError('beam_width >= 1')
        self.variant, self.beam_width, self.provider = variant, beam_width, provider
        self.reference = Reference(db_path) if reference else EmptyReference()
        neighbour_file=Path(neighbours_path or os.environ.get('JANA_NEIGHBOURS_DB',ROOT/'artifacts/baseline/neighbours-v1.sqlite'))
        self.neighbours=Neighbours(neighbour_file) if reference and variant=='B' and neighbour_file.exists() else None
        uniform_file=Path(uniform_path or os.environ.get('JANA_UNIFORM_DB',ROOT/'artifacts/baseline/v3/uniform-v3/uniform.sqlite'))
        self.uniform=UniformDistricts(uniform_file,self.reference) if reference and variant=='B' and uniform_file.exists() else None
        territory_file=Path(territories_path or os.environ.get('JANA_TERRITORIES_DB',getattr(self.reference,'path',ROOT/'missing.sqlite')))
        self.territories=TerritoryDistricts(territory_file) if reference and variant=='B' and territory_file.exists() else None
        self.mapping = None
        if mapping_path:
            m = json.loads(Path(mapping_path).read_text(encoding='utf-8'))
            points = m.get('points', [])
            if (m.get('schema_version') != 'confidence-mapping/1' or len(points)<2
                or points[0][0]!=0 or points[-1][0]!=1
                or any(len(p)!=2 or any(isinstance(v,bool) or not isinstance(v,(float,int))
                           or not math.isfinite(v) or not 0<=v<=1 for v in p) for p in points)
                or any(b[0]<=a[0] or b[1]<a[1] for a,b in zip(points,points[1:]))):
                raise ValueError('Некорректное отображение confidence')
            self.mapping = points

    def parse_address(self, raw): return self.explain_address(raw)['record']

    def close(self):
        """Закрыть соединения экземпляра после завершения работы потока."""
        for reader in (self.reference,self.neighbours,self.uniform,self.territories):
            db=getattr(reader,'db',None)
            if db is not None:db.close()

    def explain_address(self, raw):
        if not isinstance(raw,str): raise TypeError('Адрес должен быть строкой')
        record = empty_record(raw)
        origins = dict.fromkeys(ADDRESS_FIELDS,'absent')
        methods = dict.fromkeys(ADDRESS_FIELDS)
        span_map = {f:[] for f in ADDRESS_FIELDS}
        evidence, reasons, all_candidates, consumed = {}, [], [], []
        # Пояснение к территории не превращается в отдельную улицу или район.
        reserved=[m.span('annotation') for m in re.finditer(
            r'(?i)(?<!\w)(?:квартал|микрорайон|мкр(?:-?н)?\.?|жк)\s+[^,;()\n]+(?P<annotation>\([^()]*\))',raw)]
        ref = self.reference
        # Виртуальный разделитель той же длины: raw и все смещения неизменны.
        structural=re.sub(r'(?<=\s)[-–—](?=\s)',',',raw)
        ignored=[]
        for phone in PHONE_RE.finditer(raw):
            consumed.append(phone.span())
            ignored.append(dict(kind='phone',start=phone.start(),end=phone.end()))
        postal=re.match(r'\s*(\d{6})(?=\s|[,;]|$)',raw)
        if postal:
            consumed.append(postal.span())
            ignored.append(dict(kind='postal_code',start=postal.start(1),end=postal.end(1)))

        def put(field, value, spans=(), method='marker', proof=None):
            if spans:
                spans=[trim(raw,a,b) for a,b in spans]
                spans=[(a,b) for a,b in spans if a<b]
                if not spans:return
                if field in SLICE_FIELDS:value=raw[spans[0][0]:spans[0][1]]
            if value is None or value == '': return
            record[field] = value
            span_map[field] = [list(s) for s in spans]
            origins[field] = 'explicit' if spans else 'inferred'
            methods[field] = method
            if proof: evidence[field] = proof

        def mask(intervals,include_reserved=True):
            chars = list(structural)
            for a,b in list(intervals)+(reserved if include_reserved else []): chars[a:b] = ' '*(b-a)
            return ''.join(chars)

        country=re.match(r'[\s,;]*(?P<name>Республика\s+Казахстан|Казахстан|Қазақстан|Kazakhstan|РК)(?=\s|[,;]|$)',mask(consumed),re.I)
        if country:
            consumed.append(country.span())
            ignored.append(dict(kind='country',start=country.start('name'),end=country.end('name')))
            postal_after=re.match(r'[\s,;]*(\d{6})(?=\s|[,;]|$)',mask(consumed))
            if postal_after:
                consumed.append(postal_after.span())
                ignored.append(dict(kind='postal_code',start=postal_after.start(1),end=postal_after.end(1)))

        # Область извлекается отдельно и ограничивает разрешение одноимённых городов.
        province_marker=r'(?:область|обл\.?)'
        for m in re.finditer(r'(?<!\w)(?:'+province_marker+SPACE_CF+'+'+WORD+'|'+WORD+SPACE_CF+'+'+province_marker+r')(?!\w)',raw,re.I):
            province_query=re.sub(r'(?i)\bобл\.?(?!\w)','область',m.group())
            found = [a for a in ref.admins(province_query) if a['type']=='province']
            val = next(iter({a['province'] for a in found}), None) if len({a['province'] for a in found})==1 else None
            if val is None:
                name = re.sub(r'(?i)\bобласть\b','',province_query)
                name = name[slice(*trim(name,0,len(name)))]
                val = {'абай':'Абайская','жетісу':'Жетысуская','ұлытау':'Улытауская'}.get(name.lower(),name)+' область'
            put('province',val,[m.span()],'province_project',ref.evidence([a['id'] for a in found]))
            consumed.append(m.span())

        # Маркер определяет начало имени, справочник — его границу в общем потоке.
        locality_types = LOCALITY_TYPES
        city_options = find_city_options(raw,mask(consumed),ref,record['province'])
        tail=tail_locality(raw,mask(consumed),ref) if not city_options else None
        if tail:city_options=[tail['city']]
        street_tail=street_tail_locality(raw,mask(consumed),ref,record['province']) if not city_options else None
        if street_tail:city_options=[street_tail['city']]
        city_id = None
        if city_options:
            city_options.sort(key=lambda x:(-x[0],x[1]))
            chosen = city_options[0]
            _,a,b,start,end,val,found=chosen
            city_spans = [(c[3],c[4]) for c in city_options if c[5]==val]
            put('city',val,city_spans,'admin_project' if found else 'city_marker',ref.evidence([x['id'] for x in found]))
            if street_tail:
                methods['city']='confirmed_street_city'
                evidence['city']['geonim_ids']=street_tail['geonim_ids']
            for c in city_options: consumed.append((c[1],c[2]))
            unique_ids={x['id'] for x in found}
            if len(unique_ids)==1: city_id=next(iter(unique_ids))
            provinces={x['province'] for x in found if x['province']}
            if record['province'] and provinces and record['province'] not in provinces:
                reasons.append(dict(code='city_province_conflict',fields=['city','province'],
                                    message='Явная область не совпадает с областью населённого пункта в справочнике.'))
            if not record['province'] and len(provinces)==1:
                put('province',next(iter(provinces)),method='city_parent',proof=ref.evidence(sorted(unique_ids)))
            if len({c[5] for c in city_options})>1:
                reasons.append(dict(code='city_conflict',fields=['city','province'],message='В строке несколько населённых пунктов.'))
            if len(unique_ids)>1:
                reasons.append(dict(code='city_identity_ambiguous',fields=['city'],message='Название соответствует нескольким населённым пунктам.'))

        if tail:
            a,b=tail['house']
            put('house',raw[a:b],[(a,b)],'house_before_tail_city');consumed.append((a,b))
            a,b=tail['tail']
            if a<b:
                matches=[d for d in ref.district_localities(spaced_words(raw[a:b])) if d['city']['id']==city_id]
                if len({d['district_id'] for d in matches})==1:
                    put('district',raw[a:b],[(a,b)],'district_before_tail_city',ref.evidence([d['district_id'] for d in matches]))
                    consumed.append((a,b))
                else:
                    reserved.append((a,b))
                    reasons.append(dict(code='unrecognized_address_tail',fields=['district'],
                                        message='Часть хвоста не распознана как район; написание не исправлялось.'))

        # Отдельный сегмент «20 неизвестный хвост» сохраняет номер дома,
        # даже когда административная часть не распознана.
        if not record['house'] and re.search(r'[,;\n]\s*\d',raw):
            free=mask(consumed)
            for segment in re.finditer(r'[^,;\n]+',free):
                a,b=trim(free,*segment.span())
                if not a or not re.search(LET,free[:a]):continue
                number=NUMBER.match(free,a,b)
                if not number or number.end()>=b or not re.fullmatch(SPACE_CF,free[number.end()]):continue
                ta,tb=trim(raw,number.end(),b)
                if ta>=tb or not re.fullmatch(WORD+'(?:'+SPACE_CF+'+'+WORD+'){0,2}',free[ta:tb]):continue
                if STREET_RE.search(free,ta,tb):continue
                if re.search(r'(?<!\w)(?:'+'|'.join(MARKERS.values())+r'|магазин|рядом|возле|напротив)(?!\w)',free[ta:tb],re.I):continue
                put('house',raw[number.start():number.end()],[number.span()],'house_before_unrecognized_tail')
                consumed.append(number.span());reserved.append((ta,tb))
                reasons.append(dict(code='unrecognized_address_tail',fields=['district'],
                                    message='Номер перед нераспознанным хвостом принят за дом.'))
                break

        # Явный район сохраняет падеж исходной строки.
        district_pattern = r'(?P<name>'+WORD+'(?:'+SPACE_CF+'+'+WORD+r'){0,2})'+SPACE_CF+r'+(?:район(?:а)?|р-н)(?!\w)'
        for m in re.finditer(district_pattern,mask(consumed),re.I):
            put('district',raw[m.start('name'):m.end('name')],[m.span('name')],'district_marker')
            consumed.append(m.span())
        district_free=mask(consumed)
        for m in re.finditer(r'(?<!\w)(?:район|р-н)'+SPACE_CF+'+',district_free,re.I):
            start=m.end()
            boundaries=[len(raw)]
            for pattern in (re.compile(r'[,;\n]'),STREET_RE,CITY_PREFIX,
                            re.compile(r'(?<!\w)(?:'+ '|'.join(MARKERS.values())+r')(?![^\W\d_])',re.I)):
                stop=pattern.search(district_free,start)
                if stop:boundaries.append(stop.start())
            end=min(boundaries);start,end=trim(raw,start,end)
            if start<end:
                put('district',raw[start:end],[(start,end)],'district_prefix')
                consumed.append((m.start(),end))

        # Ориентир защищён от интерпретации его цифр как номера дома.
        land = re.compile(r'(?<!\w)(?:ориентир(?:'+SPACE_CF+'*:'+SPACE_CF+'*|'+SPACE_CF+'+)|(?:возле|напротив|около|за|рядом'+SPACE_CF+'+с)'+SPACE_CF+r'+)|(?<!\w)(?=магазин\b|аптека\b|qazpost\b|дүкен\b|пункт\s+выдачи\b)',re.I)
        free = mask(consumed)
        lm = land.search(free)
        if lm:
            start = lm.end()
            stop = re.search(r'[,;\n]',free[start:])
            end = start+stop.start() if stop else len(raw)
            # Деталь без запятой завершает ориентир вместе со своим числом.
            detail_markers='(?:'+'|'.join(MARKERS[f] for f in ('apartment','entrance','floor'))+r')(?![^\W\d_])'
            detail = re.search(r'(?<!\w)(?:'+NUM+SPACE_CF+'*-?'+SPACE_CF+'*'+detail_markers+'|'+detail_markers+SPACE_CF+'*'+NUM+r')',free[start:end],re.I)
            if detail: end=start+detail.start()
            start,end=trim(raw,start,end)
            put('landmark',raw[start:end],[(start,end)],'landmark_marker')
            consumed.append((lm.start(),end))

        number_candidates=[]
        number_free=mask(consumed)
        house_marker=re.compile(r'(?<![^\W\d_])(?:'+MARKERS['house']+r')(?![^\W\d_])',re.I)
        apartment_marker=re.compile(r'(?<![^\W\d_])(?:'+MARKERS['apartment']+r')(?![^\W\d_])',re.I)
        explicit_apartment=bool(apartment_marker.search(number_free))
        for short in re.finditer(r'(?<!\w)[кk]\.?'+SPACE_CF+r'*'+NUM+r'(?!\w)',number_free,re.I):
            before=list(NUMBER.finditer(number_free,0,short.start()))
            previous=before[-1] if before else None
            if not previous or not re.fullmatch(CORPUS_GAP,number_free[previous.end():short.start()]):continue
            if re.search(r'(?<!\w)(?:'+'|'.join(MARKERS[f] for f in ('apartment','entrance','floor'))+')'+SPACE_CF+'*$',number_free[:previous.start()],re.I):continue
            if explicit_apartment:
                c=candidate('house',previous.start(),short.end(),10.0,'house_with_corpus')
                previous_markers=list(house_marker.finditer(number_free,0,previous.start()))
                if previous_markers and re.fullmatch(SPACE_CF+'*(?:№'+SPACE_CF+'*)?',number_free[previous_markers[-1].end():previous.start()]):
                    c['marker_span']=list(previous_markers[-1].span())
                number_candidates.append(c)
            else:
                consumed.append(short.span())
                reasons.append(dict(code='ambiguous_k_marker',fields=['house','apartment'],
                                    message='Отдельное «к» может означать корпус или квартиру; значение не назначено.',
                                    evidence=dict(start=short.start(),end=short.end(),text=raw[short.start():short.end()])))
        number_free=mask(consumed)
        for corpus in re.finditer(r'(?<![\w/-])'+NUM+CORPUS_GAP+r'корп(?:ус|\.)?'+SPACE_CF+r'*[\w]+',number_free,re.I):
            c=candidate('house',*corpus.span(),10.0,'house_with_corpus')
            previous=list(house_marker.finditer(number_free,0,corpus.start()))
            if previous and re.fullmatch(SPACE_CF+'*(?:№'+SPACE_CF+'*)?',number_free[previous[-1].end():corpus.start()]):
                c['marker_span']=list(previous[-1].span())
            number_candidates.append(c)
        detail_marker=re.compile(r'(?<![^\W\d_])(?:'+'|'.join(MARKERS[f] for f in ('apartment','entrance','floor'))+r')(?![^\W\d_])',re.I)
        for field,pattern in MARKERS.items():
            for m in re.finditer(r'(?<![^\W\d_])(?:'+pattern+r')(?![^\W\d_])',mask(consumed),re.I):
                if (field=='house' and re.fullmatch(r'д\s*\.?',m.group(),re.I)
                        and re.search(r'(?i)(?:квартал|микрорайон|мкр(?:-?н)?\.?|м-н\.?)\s*$',number_free[:m.start()])):
                    continue
                post_start=m.end()+re.match(SPACE_CF+'*(?:№'+SPACE_CF+'*)?',raw[m.end():]).end()
                post = NUMBER.match(raw,post_start)
                before = list(NUMBER.finditer(raw[:m.start()]))
                pre = before[-1] if before and re.fullmatch(SPACE_CF+'*(?:-'+SPACE_CF+'*)?',raw[before[-1].end():m.start()]) else None
                if field!='house' and pre and post and not house_marker.search(number_free):
                    # Без типа улицы число между её именем и деталями — дом.
                    # Его интервал участвует в общем выборе, не сдвигая raw.
                    left=max([0]+[s.end() for s in re.finditer(r'[,;\n]',number_free[:pre.start()])]+
                             [b for a,b in consumed if b<=pre.start()])
                    head=number_free[left:pre.start()]
                    if (sum(ch.isalpha() for ch in head)>=3 and not STREET_RE.search(head)
                            and not detail_marker.search(head) and not pre.group().startswith('-')):
                        number_candidates.append(candidate('house',*pre.span(),10.0,'unmarked_before_details'))
                choices=[]
                # При числе с обеих сторон предпочитаем правое. Совместный
                # выбор сохраняет цепочки обратной записи с конечным маркером.
                if post: choices.append((*post.span(),9.2 if pre else 8.0,'prefix'))
                if pre: choices.append((*pre.span(),9.0 if pre.end()==m.start() else 7.8,'postfix'))
                for a,b,score,direction in choices:
                    if any(overlap((a,b),s) for s in consumed): continue
                    if field=='house':
                        corp=re.match(r'\s+корп(?:ус|\.)?\s*([\w]+)',raw[b:],re.I)
                        if corp: b+=corp.end()
                    c=candidate(field,a,b,score,'number_'+direction)
                    c['marker_span']=list(m.span())
                    number_candidates.append(c)
        states=decode(number_candidates,self.beam_width)
        for c in states[0][1]:
            a,b=c['spans'][0]
            put(c['field'],raw[a:b],c['spans'],c['method'])
            consumed.append(tuple(c['spans'][0]))
            if 'marker_span' in c:consumed.append(tuple(c['marker_span']))
        all_candidates.extend(number_candidates)

        free=mask(consumed)
        types=list(STREET_RE.finditer(free))
        segments=[trim(free,*m.span()) for m in re.finditer(r'[^,;\n]+',free)]

        def separate_address(a,b):
            if any(not overlap((a,b),t.span()) and TYPE_NAMES[int(t.lastgroup[1:])]!='ЖК' for t in types):return True
            for x,y in segments:
                if x>=y or overlap((a,b),(x,y)):continue
                text=raw[x:y]
                if re.search(LET,text) and NUMBER.search(text):return True
                if city_id and record['house'] and any(g['role']=='street' for g in ref.geonims(text,city_id)):return True
            return False

        for marker in LIVING_RE.finditer(free):
            right=min([len(raw)]+
                      [marker.end()+m.start() for m in re.finditer(r'[,;\n]',free[marker.end():])]+
                      [t.start() for t in types if t.start()>=marker.end()]+
                      [a for a,b in consumed if a>=marker.end()])
            a,b=trim(raw,marker.end(),right)
            if a<b and separate_address(marker.start(),b):
                put('living_area',raw[a:b],[(a,b)],'living_area_marker')
                consumed.append((marker.start(),b));break
        if city_id and not record['living_area']:
            for a,b in segments:
                if a>=b or NUMBER.fullmatch(raw[a:b]) or STREET_RE.search(free,a,b) or LIVING_RE.search(free,a,b):continue
                areas=[g for g in ref.geonims(raw[a:b],city_id) if g['role']=='address_area'
                       and normalize(raw[a:b]) in {normalize(n) for n in json.loads(g['names_json']).values() if n}]
                if areas and separate_address(a,b):
                    put('living_area',raw[a:b],[(a,b)],'separate_reference_area',ref.evidence([g['id'] for g in areas]))
                    consumed.append((a,b));break
        free=mask(consumed)
        types=list(STREET_RE.finditer(free))
        ordinary=[m for m in types if TYPE_NAMES[int(m.lastgroup[1:])] not in ('микрорайон','квартал','ЖК')]
        name_candidates=[]
        type_spans=[m.span() for m in types]
        for m in types:
            typ=TYPE_NAMES[int(m.lastgroup[1:])]
            left=max([0]+[x.end() for x in re.finditer(r'[,;\n]',free[:m.start()])]+
                     [b for a,b in consumed if b<=m.start()]+[t.end() for t in types if t.end()<=m.start()])
            right=min([len(raw)]+[m.end()+x.start() for x in re.finditer(r'[,;\n]',free[m.end():])]+
                      [a for a,b in consumed if a>=m.end()]+[t.start() for t in types if t.start()>=m.end()])
            la,lb=trim(raw,left,m.start()); ra,rb=trim(raw,m.end(),right)
            left_text=raw[la:lb]
            previous_type=any(t.end()==left for t in types)
            postfix=bool(left_text and not previous_type and (re.search(r'көш|даңғ',m.group(),re.I) or typ in ('микрорайон','квартал','переулок') or not raw[ra:rb].strip() or NUMBER.fullmatch(raw[ra:rb])))
            a,b=(la,lb) if postfix else (ra,rb)
            if not a<b: continue
            field='living_area' if typ=='ЖК' or (typ in ('микрорайон','квартал') and ordinary) else 'street_name'
            score=10.0
            c=candidate(field,a,b,score,'street_marker')
            c['street_type']=typ; c['marker_span']=list(m.span())
            name_candidates.append(c)
        # Без маркера остаётся одна адресная часть; соседняя числовая часть — дом.
        if not any(c['field']=='street_name' for c in name_candidates):
            name_free=list(free)
            for a,b in consumed+reserved:name_free[a:b]=','*(b-a)
            name_free=''.join(name_free)
            for m in re.finditer(r'[^,;\n]+',name_free):
                a,b=trim(name_free,*m.span())
                while a<b and unicodedata.category(raw[a]) in ('So','Cf'): a+=1
                a,b=trim(raw,a,b)
                if not a<b or any(overlap((a,b),s) for s in type_spans): continue
                if re.search(LET,raw[a:b]) and not NUMBER.fullmatch(raw[a:b]) and not any(overlap((a,b),c['spans'][0]) for c in name_candidates):
                    name_candidates.append(candidate('street_name',a,b,5.0,'unmarked_name'))

        expanded=[]
        for c in name_candidates:
            a,b=c['spans'][0]
            typ=c.get('street_type')
            parts=[c]
            nums=list(NUMBER.finditer(raw,a,b))
            pair=HOUSE_APARTMENT.search(raw,a,b) if c['field']=='street_name' and typ not in ('микрорайон','квартал','ЖК') else None
            if pair and not record['house'] and not record['apartment'] and pair.start()>a:
                na,nb=trim(raw,a,pair.start())
                if na<nb and any(ch.isalpha() for ch in raw[na:nb]) and raw[pair.start()-1] not in '-/':
                    split=dict(c,spans=[[na,nb]],score=c['score']+3)
                    split['house_span']=list(pair.span('house'))
                    split['apartment_span']=list(pair.span('apartment'))
                    parts=[split]
                else:pair=None
            else:pair=None
            if not pair and c['field']=='street_name' and nums and not record['house']:
                last=nums[-1]
                # Слитный буквенный префикс допустим, дефис внутри названия — нет.
                has_separate_number=False
                for segment in re.finditer(r'[^,;\n]+',free[b:]):
                    sa,sb=trim(segment.group(),0,len(segment.group()))
                    if re.fullmatch(NUM+r'(?:\s+'+NUM+r')*',segment.group()[sa:sb],re.I): has_separate_number=True
                attached_hyphen=(last.group().startswith('-') and last.start()>a and raw[last.start()-1].isalpha())
                if last.end()==b and last.start()>a and raw[last.start()-1] not in '-/' and not attached_hyphen and not (typ and has_separate_number):
                    na,nb=trim(raw,a,last.start())
                    # Несколько чисел без маркеров не расширяют имя автоматически.
                    if len(nums)>1:
                        first=nums[-2]
                        if first.start()>a and raw[first.start()-1].isspace() and not raw[first.end():last.start()].strip():
                            full_name=raw[a:first.end()]
                            known_name=ref.geonims(full_name,None)
                            if not known_name:nb=trim(raw,a,first.start())[1]
                    fraction=re.search(r'\s+\d+\s*/\s*$',raw[na:nb])
                    if fraction: nb=na+fraction.start()
                    if na<nb:
                        split=dict(c,spans=[[na,nb]],score=c['score']+2)
                        split['house_span']=list(last.span())
                        parts.append(split)
                        if typ not in ('микрорайон','квартал'):
                            c['score']-=3
            for choice in parts:
                na,nb=choice['spans'][0]
                if self.variant=='B':
                    matches=ref.geonims(raw[na:nb],city_id)
                    if matches:
                        choice['score']+=2
                        choice['evidence']=ref.evidence([x['id'] for x in matches])
                expanded.append(choice)
        supplied=[]
        if self.provider:
            supplied=self.provider.get_candidates(raw,tokens(raw),dict(variant=self.variant,beam_width=self.beam_width,city_id=city_id))
            for c in supplied:
                if (c.get('field') not in ADDRESS_FIELDS or not c.get('method')
                    or not isinstance(c.get('score'),(float,int)) or not math.isfinite(c['score'])
                    or not c.get('spans') or any(len(s)!=2 or not all(type(v)is int for v in s)
                        or not 0<=s[0]<s[1]<=len(raw) for s in c['spans'])):
                    raise ValueError('Некорректный кандидат поставщика')
        # Выбор имён совместно; одинаковые интервалы не могут стать улицей и жилым массивом.
        name_states=decode(expanded,self.beam_width)
        for c in name_states[0][1]:
            a,b=c['spans'][0]
            value=raw[a:b] if c['field'] in SLICE_FIELDS else c.get('value',raw[a:b])
            put(c['field'],value,c['spans'],c['method'],c.get('evidence'))
            consumed.extend(c['spans'])
            if 'marker_span' in c: consumed.append(c['marker_span'])
            if c['field']=='street_name' and c.get('street_type'):
                put('street_type',c['street_type'],[c['marker_span']],'street_marker')
            if c.get('house_span'):
                ha,hb=c['house_span']; put('house',raw[ha:hb],[(ha,hb)],'name_number_split'); consumed.append((ha,hb))
            if c.get('apartment_span'):
                aa,ab=c['apartment_span'];put('apartment',raw[aa:ab],[(aa,ab)],'house_apartment_hyphen');consumed.append((aa,ab))
                methods['house']='house_apartment_hyphen'
                reasons.append(dict(code='house_apartment_hyphen',fields=['house','apartment'],
                                    message='Запись через дефис принята за дом и квартиру; трактовка неоднозначна.'))
        all_candidates.extend(expanded)
        # Отдельный немаркированный номер после улицы/микрорайона.
        if not record['house']:
            number_free=mask(consumed)
            for m in re.finditer(r'[^,;\n]+',number_free):
                a,b=trim(number_free,*m.span())
                if a<b and NUMBER.fullmatch(raw[a:b]):
                    put('house',raw[a:b],[(a,b)],'unmarked_number'); consumed.append((a,b)); break

        # Дополнительный поставщик конкурирует с текущими явными полями в том же декодере.
        if supplied:
            joint=[]
            for f in ADDRESS_FIELDS:
                if origins[f]!='explicit': continue
                matching=[c['score'] for c in all_candidates if c['field']==f and c['spans']==span_map[f]]
                joint.append(dict(field=f,spans=span_map[f],score=max(matching,default=10.0),
                                  method=methods[f],value=record[f],evidence=evidence.get(f,{})))
            joint.extend(supplied)
            chosen=decode(joint,self.beam_width)[0][1]
            for f in ADDRESS_FIELDS:
                record[f]=None;origins[f]='absent';methods[f]=None;span_map[f]=[]
            evidence={}
            for c in chosen:
                a,b=c['spans'][0]
                value=raw[a:b] if c['field'] in SLICE_FIELDS else c.get('value',raw[a:b])
                if c['field'] in SLICE_FIELDS and any(raw[x:y]!=value for x,y in c['spans']):
                    raise ValueError('Повторные интервалы должны обозначать одно значение')
                put(c['field'],value,c['spans'],c['method'],c.get('evidence'))
            admins=[a for a in ref.admins(record['city']) if a['type'] in locality_types] if record['city'] else []
            if record['province']: admins=[a for a in admins if a['province']==record['province']]
            if any(a['type']=='city' for a in admins): admins=[a for a in admins if a['type']=='city']
            city_id=admins[0]['id'] if len(admins)==1 else None
            provinces={a['province'] for a in admins if a['province']}
            if not record['province'] and len(provinces)==1:
                put('province',next(iter(provinces)),method='city_parent',proof=ref.evidence([a['id'] for a in admins]))
            all_candidates.extend(supplied)

        if self.variant=='B' and not record['city'] and record['district']:
            associations=ref.district_localities(record['district'])
            if record['province']:
                associations=[a for a in associations if a['city']['province']==record['province']]
            cities={a['city']['id']:a['city'] for a in associations}
            if len(cities)==1:
                city_id,city=next(iter(cities.items()))
                proof=ref.evidence([city_id,*sorted({a['district_id'] for a in associations})])
                put('city',city['city'],method='district_parent',proof=proof)
                if not record['province']:put('province',city['province'],method='district_parent',proof=proof)

        reverse_diagnostic=None
        if self.variant=='B' and not record['city'] and record['street_name'] and record['house']:
            number=record['house'];corpus=None
            hm=HOUSE_PARTS.fullmatch(number)
            if hm:number,corpus=hm.groups()
            matches=ref.reverse_house(record['street_name'],number,corpus)
            reverse_diagnostic=dict(candidate_count=len(matches),candidate_ids=[m['city']['id'] for m in matches])
            blocked=[]
            corroborating=[]
            if matches and all(m['generated_latin_only'] for m in matches):
                blocked.append(dict(cause='generated_latin_only',matched_names=sorted({n for m in matches for n in m['matched_names']})))
            if len(matches)==1:
                # Проверяются целые оставшиеся сегменты, а не подстроки улиц.
                remaining_for_city=mask(consumed)
                for segment in re.finditer(r'[^,;\n]+',remaining_for_city):
                    a,b=trim(remaining_for_city,*segment.span())
                    if a>=b:continue
                    hints=ref.locality_hint(raw[a:b])
                    if hints:
                        ids={x['id'] for name in hints for x in ref.admins(name) if x['type'] in LOCALITY_TYPES}
                        proof=dict(start=a,end=b,text=raw[a:b],matched_names=hints,fragment_candidate_ids=sorted(ids))
                        if matches[0]['city']['id'] in ids:
                            # Одноимённые сёла различает уникальная пара улица/дом.
                            prefix=re.match(r'(?i)(?:city of|city)\s+',raw[a:b])
                            suffix=re.search(r'(?i)\s+(?:city|сити)$',raw[a:b])
                            start=a+(prefix.end() if prefix else 0)
                            end=a+suffix.start() if suffix else b
                            proof.update(name_span=[start,end],joint_candidate_ids=[matches[0]['city']['id']])
                            corroborating.append(proof)
                        else:blocked.append(dict(proof,cause='unrecognized_locality'))
            if blocked:
                reverse_diagnostic['blocked']=blocked
                reasons.append(dict(code='ambiguous_street_city',fields=['city','province'],
                                    message='Недостаточно свидетельств для безопасного вывода города по улице и дому.',
                                    evidence=reverse_diagnostic))
            if len(matches)>1:
                reasons.append(dict(code='reverse_locality_ambiguous',fields=['city','province'],
                                    message='Улица и дом найдены в нескольких населённых пунктах; город не выбран.',
                                    evidence=reverse_diagnostic))
            if len(matches)==1 and not blocked:
                match=matches[0];city=match['city']
                if not record['province'] or record['province']==city['province']:
                    city_id=city['id'];proof=ref.evidence([city_id,*match['geonim_ids']])
                    proof.update(candidate_count=1,matched_names=match['matched_names'],house=number,corpus=corpus)
                    if corroborating:
                        proof['corroborating_fragments']=corroborating
                        start,end=corroborating[0]['name_span']
                        put('city',raw[start:end],[(start,end)],method='unique_street_house',proof=proof)
                        consumed.extend((p['start'],p['end']) for p in corroborating)
                    else:put('city',city['city'] or city['name'],method='unique_street_house',proof=proof)
                    if not record['province']:put('province',city['province'],method='unique_street_house',proof=proof)
        # Нестрогая сверка возможна лишь после установления города. Значение
        # и интервалы остаются исходными, справочник служит подтверждением.
        if self.variant=='B' and city_id:
            if record['district']:
                ids,confirmation=ref.confirm_district(record['district'],city_id)
                if ids:
                    proof=ref.evidence(ids);proof['confirmation']=confirmation
                    evidence['district']=proof
            elif reserved:
                for a,b in reserved[:]:
                    ids,confirmation=ref.confirm_district(raw[a:b],city_id)
                    if ids:
                        proof=ref.evidence(ids);proof['confirmation']=confirmation
                        put('district',raw[a:b],[(a,b)],'district_city_confirmation',proof)
                        consumed.append((a,b));reserved.remove((a,b))
                        break
                if not reserved:reasons[:]=[r for r in reasons if r['code']!='unrecognized_address_tail']

        district_diagnostic=None
        enrichment_name=record['street_name'] or record['living_area']
        uncertain_house=any(r['code']=='ambiguous_k_marker' for r in reasons)
        if self.variant=='B' and city_id and enrichment_name and not reserved and not uncertain_house:
            matches=ref.geonims(enrichment_name,city_id)
            confirmation=None
            if not matches and record['street_name']:
                matches,confirmation=ref.confirm_geonims(enrichment_name,city_id)
            if record['street_name'] and record['street_type']:
                def compatible(g):
                    gt=(json.loads(g['type_json']) or {}).get('ru')
                    return not gt or normalize(gt)==normalize(record['street_type'])
                matches=[g for g in matches if compatible(g)]
            if matches and confirmation:
                proof=ref.evidence([g['id'] for g in matches]);proof['confirmation']=confirmation
                evidence['street_name']=proof
            house=record['house']; corpus=None
            hm=HOUSE_PARTS.fullmatch(house) if house else None
            if hm: house,corpus=hm.groups()
            observations=[(g,ref.house(city_id,g['id'],house,corpus)) for g in matches] if house else []
            observed=[(g,h) for g,h in observations if h]
            district_ids={d for g,h in observed for d in h['district_ids']}
            # Одноимённый геоним без этого дома не создаёт конфликт связи дома.
            safe=len(observed)==1 and all(not h['conflict'] and len(h['district_ids'])==1 for g,h in observed)
            if safe and len(district_ids)==1 and not record['district']:
                did=next(iter(district_ids)); admin=ref.admin_display(did,profile='project')
                name=admin['names'].get('ru',admin['name'])
                name=district_name(name)
                put('district',name,method='exact_house',proof=ref.evidence([city_id,*[g['id'] for g,h in observed],did]))
            elif observed and not safe:
                reasons.append(dict(code='district_conflict',fields=['district'],message='Точная связь дома с районом неоднозначна.'))
            if not record['district'] and not observed and matches:
                territory_scope=any(is_territory(g) for g in matches)
                chosen_id=None;chosen_method=None;chosen_proof={}
                if territory_scope:
                    contour_id,contour_proof=(self.territories.district(city_id,matches) if self.territories
                        else (None,dict(reason='territory_layer_unavailable')))
                    uniform_id,uniform_proof=(self.uniform.district(city_id,matches) if self.uniform
                        else (None,dict(reason='uniform_layer_unavailable')))
                    district_diagnostic=dict(territory=contour_proof,uniform=uniform_proof,
                                             territory_district_id=contour_id,uniform_district_id=uniform_id)
                    conflict=contour_proof.get('blocking') or uniform_proof.get('blocking')
                    disagreement=bool(contour_id and uniform_id and contour_id!=uniform_id)
                    if conflict or disagreement:
                        code='district_methods_disagree' if disagreement else 'territory_conflict'
                        district_diagnostic['reason']=code
                        reasons.append(dict(code=code,fields=['district'],
                            message='Контур и однородные дома дают разные районы.' if disagreement
                                    else 'Справочные свидетельства района содержат конфликт.',
                            evidence=district_diagnostic))
                    elif contour_id:
                        chosen_id=contour_id;chosen_method='territory_within_district';chosen_proof=dict(contour_proof)
                        if uniform_id:chosen_proof['corroborating_uniform']=uniform_proof
                    elif uniform_id:
                        chosen_id=uniform_id;chosen_method='geonim_uniform';chosen_proof=dict(uniform_proof)
                        chosen_proof['territory_unavailable']=contour_proof
                else:
                    neighbour_proof={}
                    if (house and len(matches)==1 and self.neighbours and matches[0]['role']=='street'
                            and not matches[0]['type_conflict']):
                        chosen_id,neighbour_proof=self.neighbours.district(city_id,matches[0]['id'],house)
                        if chosen_id:chosen_method='street_parity_neighbour';chosen_proof=neighbour_proof
                    district_diagnostic=dict(neighbour=neighbour_proof)
                    if not chosen_id and self.uniform:
                        chosen_id,uniform_proof=self.uniform.district(city_id,matches)
                        district_diagnostic['uniform']=uniform_proof
                        if chosen_id:chosen_method='geonim_uniform';chosen_proof=uniform_proof
                        elif uniform_proof.get('blocking'):
                            reasons.append(dict(code='district_conflict',fields=['district'],
                                                message='Известные дома имеют конфликт районов.',evidence=uniform_proof))
                if chosen_id:
                    admin=ref.admin_display(chosen_id,profile='project')
                    if admin:
                        name=district_name(admin['names'].get('ru',admin['name']))
                        put('district',name,method=chosen_method,proof=chosen_proof)

        remaining=mask(consumed,include_reserved=False)
        uncovered=[dict(start=m.start(),end=m.end(),text=m.group()) for m in re.finditer(r'[^\s,;:.\/]+',remaining)
                   if any(unicodedata.category(c)[0] in 'LN' for c in m.group())]
        explicit=sum(v=='explicit' for v in origins.values())
        rating=min(.97,.12+.11*explicit+.12*bool(record['street_name'] and record['house'])) if explicit else .02
        rating-=min(.3,.06*len(uncovered))+.12*len(reasons)
        margin=name_states[0][0]-name_states[1][0] if len(name_states)>1 else None
        numeric_conflicts=[]
        for f in MARKERS:
            values={raw[c['spans'][0][0]:c['spans'][0][1]] for c in number_candidates if c['field']==f}
            if len(values)>1: numeric_conflicts.append(f)
        if numeric_conflicts:
            rating-=.08
            reasons.append(dict(code='numeric_competition',fields=numeric_conflicts,message='Есть конкурирующие роли или значения чисел.'))
        if margin is not None and margin<1.5:
            rating-=.08
            reasons.append(dict(code='small_candidate_margin',fields=['street_name'],message='Два разбора имеют близкие оценки.'))
        if evidence.get('street_name'):
            rating+=.03
            reasons.append(dict(code='dictionary_name_match',fields=['street_name'],message='Название найдено в справочнике; написание сохранено.'))
        if not ref.available:
            reasons.append(dict(code='dictionary_disabled',fields=['province','district'],message='Справочное обогащение выключено.'))
        if uncovered:
            reasons.append(dict(code='uncovered_text',fields=[],message='Часть текста осталась неразобранной.'))
        if not explicit:
            reasons.append(dict(code='empty_parse',fields=[],message='Адресные поля не найдены.'))
        ambiguous=any(r['code'] in ('ambiguous_k_marker','reverse_locality_ambiguous','ambiguous_street_city') for r in reasons)
        if ambiguous:rating=min(rating,.59)
        rating=round(max(.02,min(.99,rating)),4)
        raw_rating=rating
        if self.mapping:
            for a,b in zip(self.mapping,self.mapping[1:]):
                if a[0]<=rating<=b[0]: rating=round(a[1]+(rating-a[0])/(b[0]-a[0])*(b[1]-a[1]),4); break
        if ambiguous:rating=min(rating,.59)
        record['confidence']=rating
        validate_record(record)
        spans=[dict(field=f,start=a,end=b) for f in ADDRESS_FIELDS for a,b in span_map[f]]
        sources={f: 'string' if origins[f]=='explicit' else 'dictionary' for f in ADDRESS_FIELDS if origins[f]!='absent'}
        return dict(record=record,spans=spans,sources=sources,span_map=span_map,origin=origins,methods=methods,
                    reasons=reasons,evidence=evidence,candidates=all_candidates,
                    diagnostics=dict(variant=self.variant,beam_width=self.beam_width,raw_rating=raw_rating,
                                     rating_kind='heuristic',uncovered=uncovered,
                                     district_lookup=district_diagnostic,ignored=ignored,
                                     reverse_locality=reverse_diagnostic,
                                     name_margin=round(margin,4) if margin is not None else None))

    def parse_records(self, records):
        output=[]
        for item in records:
            record=self.parse_address(item['raw_address'])
            record['id']=item.get('id')
            output.append(record)
        return output

_local=threading.local()
def _default():
    if not hasattr(_local,'parser'): _local.parser=AddressParser()
    return _local.parser
def parse_address(raw): return _default().parse_address(raw)
def explain_address(raw): return _default().explain_address(raw)
def parse_records(records): return _default().parse_records(records)
