"""Границы населённых пунктов независимо от разделителей адреса."""
import re
import unicodedata
from .contracts import trim_span, SPACE_CF, CF_CLASS
from .reference import normalize

URBAN_TYPES=('city','town')
LOCALITY_TYPES=(*URBAN_TYPES,'settlement','rural_locality','small_settlement')
DOTTED_LOCALITY=r'(?:гор|пос|г|с|п|қ)'+SPACE_CF+r'*\.'
WORD_LOCALITY=r'(?:город|село|посёлок|поселок|пгт|ауыл|аул|қаласы|ауылы|кенті)(?![^\W\d_])'
PREFIX=re.compile(r'(?<!\w)(?:'+DOTTED_LOCALITY+'|'+WORD_LOCALITY+'|г(?='+SPACE_CF+'))'+SPACE_CF+'*',re.I)
SUFFIX=re.compile(r'(?<!\w)(?:'+DOTTED_LOCALITY+'|'+WORD_LOCALITY+r'|г)(?!\w)',re.I)
WORD=re.compile(r'["«]?[\w][\w.\-\u0300-\u036f'+CF_CLASS+']*["»]?')
STOP=re.compile(r'(?<!\w)(?:район|р-н|улица|ул\s*\.|проспект|переулок|микрорайон|мкр(?:-?н)?\.?|м-н\.?|жк|дом|кв\.?|подъезд|этаж)(?!\w)',re.I)
ADDRESS_MARKER=re.compile(r'(?:улица|ул\.?|проспект|пр-т|пр\.?|переулок|пер\.?|бульвар|бул\.?|проезд|микрорайон|мкр(?:-?н)?\.?|м-н\.?|квартал|жк|microdistrict|mkr\.?|street|str\.?|st\.?|avenue|ave|дом|д\.?|house|район|р-н)(?!\w)',re.I)
STREET_PART=re.compile(r'(?<![^\W\d_])(?:улица|ул\.?|проспект|пр-т|переулок|пер\.?|бульвар|проезд|микрорайон|мкр(?:-?н)?\.?|м-н\.?|квартал|көшесі|көше|көш\.?|даңғылы|шағын\s+аудан(?:ы)?|microdistrict|mkr\.?|street|str\.?|st\.?|avenue|ave)(?!\w)',re.I)
POSTFIX_STREET=re.compile(r'(?:улица|ул\.?|проспект|пр-т|переулок|пер\.?|көшесі|көше|көш\.?|даңғылы|street|str\.?|st\.?|avenue|ave\.?)(?!\w)',re.I)
NAME_CONTINUATION=re.compile(r'(?:хана|хан|батыра|батыр|батыры|би|ақын)(?!\w)',re.I)

def kazakh_surface(name,found):
    """Явная казахская форма: языковые буквы либо имя kk справочника."""
    if re.search(r'[әғқңөұүһі]',name,re.I):return True
    for admin in found:
        kk=admin.get('names',{}).get('kk','')
        kk=re.sub(r'(?i)\s+(?:қ\.?|қаласы|а\.?|ауылы|кенті)$','',kk)
        if kk and normalize(kk)==normalize(name):return True
    return False

def russian_duplicate(text,found):
    if '/' not in text:return False
    canonical={normalize(a['city'] or a['name']) for a in found}
    for part in text.split('/'):
        part=PREFIX.sub('',part,count=1)
        part=SUFFIX.sub('',part).strip()
        if normalize(part) in canonical or (re.search(r'[а-яё]',part,re.I) and not kazakh_surface(part,found)):return True
    return False

def address_tail(text):
    """Адресное продолжение отличает префикс города от отдельного имени."""
    text=text[slice(*trim_span(text,0,len(text)))]
    if re.fullmatch(r'-?\d+(?:/\d+)?[\w-]*',text):return False
    if re.match(r'-?\d',text):
        # Магазин и детали после номера не превращают улицу в город.
        if not STREET_PART.search(text):return False
    return bool(text and (ADDRESS_MARKER.match(text) or re.search(r'\d|\bрайон(?:а)?\b',text,re.I)))

def city_options(raw,free,reference,province=None):
    def lookup(name,rural=False,unmarked=False):
        name=name[slice(*trim_span(name,0,len(name)))]
        found=[a for a in reference.admins(name) if a['type'] in (URBAN_TYPES if unmarked else LOCALITY_TYPES)]
        if rural and not found:
            forms={'батыр':'батыра','батыра':'батыр','хан':'хана','хана':'хан',
                   'би':'бия','бия':'би','ата':'аты','аты':'ата'}
            parts=name.rsplit(None,1)
            if len(parts)==2 and parts[1].casefold() in forms:
                alternate=parts[0]+' '+forms[parts[1].casefold()]
                found=[a for a in reference.admins(alternate) if a['type'] in LOCALITY_TYPES and a['type'] not in URBAN_TYPES]
        if province:
            matching=[a for a in found if a['province']==province]
            if matching:found=matching
        if rural and any(a['type']!='city' for a in found):found=[a for a in found if a['type']!='city']
        elif any(a['type']=='city' for a in found):found=[a for a in found if a['type']=='city']
        return found

    def item(a,b,start,end,found,marked):
        start,end=trim_span(raw,start,end)
        prefix=PREFIX.match(raw,start,end)
        if prefix:start=prefix.end()
        suffix=next((m for m in SUFFIX.finditer(raw,start,end) if m.end()==end),None)
        if suffix:end=suffix.start()
        start,end=trim_span(raw,start,end)
        vals={x['city'] or x['name'] for x in found}
        val=next(iter(vals)) if len(vals)==1 else raw[start:end]
        if marked and found and all(x['type'] not in URBAN_TYPES for x in found):
            val=raw[start:end]
        return (7+3*marked+bool(found),a,b,start,end,val,found)

    def rural_marker(marker):
        return bool(re.match(r'(?:с\b|село|пос|п\b|пгт|ауыл|аул|кенті)',marker,re.I))

    def street_initial(marker,known_locality=False):
        if marker.group()[0] not in 'СГП':return False
        if not re.fullmatch(r'[СГП]'+SPACE_CF+r'*\.'+SPACE_CF+'*',marker.group()):return False
        before=free[:marker.start()]
        types=list(STREET_PART.finditer(before))
        if types and re.fullmatch(SPACE_CF+'*',before[types[-1].end():]):return True
        if re.search(r'(?<!\w)(?:пр|бул|б-р)\.?'+SPACE_CF+'*$',before,re.I):return True
        # Инициал + имя + номер образуют улицу. Маркер перед известным
        # населённым пунктом без уличного контекста остаётся маркером.
        tail=re.match(r'(?P<name>[^\d,;\n]+?)'+SPACE_CF+r'*\d',free[marker.end():])
        if not tail:return False
        name=tail['name'].strip()
        if STREET_PART.search(name) or ADDRESS_MARKER.search(name):return False
        if not known_locality and not lookup(name,rural_marker(marker.group())):return True
        for segment in re.finditer(r'[^,;\n]+[,;\n]',before):
            a,b=trim_span(free,segment.start(),segment.end()-1)
            prefix=PREFIX.match(free,a,b)
            if prefix:a=prefix.end()
            suffix=next((m for m in SUFFIX.finditer(free,a,b) if m.end()==b),None)
            if suffix:b=suffix.start()
            if lookup(raw[a:b],rural_marker(prefix.group()) if prefix else False,unmarked=not prefix):return True
        return False

    # Известное имя перед маркером задаёт его постфиксную роль. Это не даёт
    # «Алматы г. ул. ...» начать новый поиск имени со слова «ул.».
    postfix_options={}
    for marker in SUFFIX.finditer(free):
        if street_initial(marker):continue
        segment_start=max([0]+[m.end() for m in re.finditer(r'[,;/\n]',free[:marker.start()])])
        if STREET_PART.search(free,segment_start,marker.start()):continue
        words=list(WORD.finditer(free,0,marker.start()))
        if not words:continue
        end=words[-1].end()
        if re.search(r'[\r\n]',free[end:marker.start()]) or not re.fullmatch(SPACE_CF+'*',free[end:marker.start()]):continue
        candidates=[]
        for w in reversed(words[-5:]):
            if re.search(r'[,;/\n]',free[w.start():end]):break
            found=lookup(raw[w.start():end],rural_marker(marker.group()))
            if found:candidates.append((w.start(),found))
        if candidates:
            start,found=candidates[-1]
            # Повтор «г. Алматы г. Алматы» содержит два префикса, а не
            # постфикс первого имени с оставленным вторым именем.
            prefix=PREFIX.match(free,marker.start())
            duplicate=False
            if prefix:
                previous=prefix.end()
                for index,w in enumerate(WORD.finditer(free,previous)):
                    if index>=5 or not re.fullmatch(SPACE_CF+'*',free[previous:w.start()]) or STOP.match(free,w.start()):break
                    matches=lookup(raw[prefix.end():w.end()],rural_marker(marker.group()))
                    if {x['id'] for x in matches} & {x['id'] for x in found}:
                        duplicate=True;break
                    previous=w.end()
            if duplicate:continue
            postfix_options[marker.start()]=item(start,marker.end(),start,end,found,True)

    options=list(postfix_options.values())
    for marker in PREFIX.finditer(free):
        if marker.start() in postfix_options:
            continue
        start=marker.end()
        rural=rural_marker(marker.group())
        words=[]
        for w in WORD.finditer(free,start):
            prev=words[-1].end() if words else start
            if not re.fullmatch(SPACE_CF+'*',free[prev:w.start()]) or len(words)>=5:break
            if STOP.match(free,w.start()):break
            words.append(w)
        recognized=[]
        for w in words:
            found=lookup(raw[start:w.end()],rural)
            if found:recognized.append((w.end(),found))
        if street_initial(marker,bool(recognized)):continue
        if recognized:end,found=recognized[-1]
        elif words and re.sub(SPACE_CF+'+$','',marker.group()).casefold()!='г':
            # Неизвестное имя ограничивается следующим полем или явным разрывом.
            end=words[0].end();found=[]
            for w in words[1:]:
                if re.search(r'\t|\n|\s{2,}',free[end:w.start()]):break
                end=w.end()
        else:continue
        options.append(item(marker.start(),end,start,end,found,True))

    for marker in SUFFIX.finditer(free):
        if marker.start() in postfix_options:continue
        # Неизвестные имена по постфиксу допускаются для прежних полных
        # казахских типов. Короткий маркер требует справочного имени слева.
        if marker.group().casefold() not in ('қаласы','ауылы','кенті'):continue
        words=list(WORD.finditer(free,0,marker.start()))
        if not words:continue
        end=words[-1].end()
        if not re.fullmatch(SPACE_CF+'*',free[end:marker.start()]):continue
        candidates=[]
        for w in reversed(words[-5:]):
            if re.search(r'[,;/\n]',free[w.start():end]):break
            found=lookup(raw[w.start():end],rural_marker(marker.group()))
            if found:candidates.append((w.start(),found))
        start,found=candidates[-1] if candidates else (words[-1].start(),[])
        if not any(a<=start and end<=b for _,a,b,*_ in options):
            options.append(item(start,marker.end(),start,end,found,True))

    # Сначала ищем целый городской сегмент во всей строке. Он имеет приоритет
    # перед совпадением первого слова улицы в другом сегменте.
    segments=[]
    for segment in re.finditer(r'[^,;\n]+',free):
        a,b=segment.span()
        a,b=trim_span(free,a,b)
        while a<b and (free[a].isspace() or unicodedata.category(free[a]) in ('Cf','So')):a+=1
        while b>a and free[b-1].isspace():b-=1
        if a<b:segments.append((a,b))
    for a,b in segments:
        if options:break
        found=lookup(raw[a:b],unmarked=True)
        if found:
            options.append(item(a,b,a,b,found,False))
        elif '/' in raw[a:b]:
            parts=[]
            for part in re.finditer(r'[^/]+',raw[a:b]):
                pa,pb=a+part.start(),a+part.end()
                pa,pb=trim_span(raw,pa,pb)
                found=lookup(raw[pa:pb],unmarked=True)
                if not found:break
                parts.append(item(pa,pb,pa,pb,found,False))
            else:options.extend(parts)

    for a,b in segments:
        if options:break
        if not ADDRESS_MARKER.match(free,a):
            # На границе сегмента пробуем только известные имена, от длинного
            # к короткому. Уличный маркер перед именем исключает этот путь.
            words=[]
            for w in WORD.finditer(free,a,b):
                previous=words[-1].end() if words else a
                if not re.fullmatch(SPACE_CF+'*',free[previous:w.start()]) or len(words)>=5:break
                words.append(w)
            for w in reversed(words):
                end=w.end()
                if end>=b or not address_tail(free[end:b]):continue
                found=lookup(raw[a:end],unmarked=True)
                if not found:continue
                # Постфиксный тип относится к предшествующему имени улицы.
                ta,tb=trim_span(free,end,b);tail=free[ta:tb]
                if NAME_CONTINUATION.match(tail):continue
                if re.match(r'р-н(?!\w)',tail,re.I):continue
                postfix=POSTFIX_STREET.match(tail)
                if postfix and (not tail[postfix.end():].strip() or re.match(r'\s*\d',tail[postfix.end():])):continue
                # Известное многословное имя улицы нельзя сокращать до хвоста.
                stop=re.search(r'\d|(?<!\w)(?:дом|д\.?|house|үй)(?!\w)',free[a:b],re.I)
                head=raw[a:a+stop.start()].strip() if stop else raw[a:b].strip()
                if len(head.split())>1 and reference.geonims(head):continue
                options.append(item(a,end,a,end,found,False))
                break

    # Двуязычный дубль через / не оставляет вторую половину в названии улицы.
    expanded=[]
    for score,a,b,start,end,val,found in options:
        ids={x['id'] for x in found}
        after=re.match(r'\s*/\s*',free[b:])
        if after:
            tail_start=b+after.end()
            for w in list(WORD.finditer(free,tail_start))[:5]:
                if re.search(r'[,;/\n]',free[tail_start:w.end()]):break
                matches=lookup(raw[tail_start:w.end()])
                if ids & {x['id'] for x in matches}:
                    b=w.end()
                    suffix=SUFFIX.match(free,b+len(free[b:])-len(free[b:].lstrip()))
                    if suffix:b=suffix.end()
                    break
        before=re.search(r'([^,;/\n]+?)\s*/\s*$',free[:a])
        if before:
            left=before.group(1).strip();matches=lookup(left)
            if ids & {x['id'] for x in matches}:a=before.start(1)
        expanded.append((score,a,b,start,end,val,found))
    # Явное имя сохраняет написание строки, включая исторические алиасы.
    # В двуязычном дубле выбираем русскую часть; ID для обогащения прежний.
    rendered=[]
    for score,a,b,start,end,val,found in expanded:
        if russian_duplicate(raw[a:b],found):
            for part in re.finditer(r'[^/]+',raw[a:b]):
                pa,pb=trim_span(raw,a+part.start(),a+part.end())
                prefix=PREFIX.match(raw,pa,pb)
                if prefix:pa=prefix.end()
                suffix=SUFFIX.search(raw,pa,pb)
                if suffix:pb=suffix.start()
                pa,pb=trim_span(raw,pa,pb)
                name=raw[pa:pb]
                if (re.search(r'[а-яё]',name,re.I) and not kazakh_surface(name,found)
                    and {x['id'] for x in lookup(name)} & {x['id'] for x in found}):
                    start,end=pa,pb;break
        val=raw[start:end]
        rendered.append((score,a,b,start,end,val,found))
    # Одно и то же имя может иметь несколько подтверждений, но не дублирующие позиции.
    unique={}
    for c in rendered:
        key=(c[3],c[4])
        if key not in unique or c[2]-c[1]>unique[key][2]-unique[key][1]:unique[key]=c
    return list(unique.values())
