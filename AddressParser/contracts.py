"""Общий контракт извлечения. Все позиции — кодовые точки исходной Python str.

Поставщик получает tokens [{text, key, start, end, kind}] и JSON-совместимый
context {variant, beam_width, city_id}. Ответ — список Candidate, то есть
{field, spans: [[start,end]], score, method, value?}. Для вырезаемых полей
value не заменяет исходное написание. Поставщик не получает id записи.

Необязательный mapping: {schema_version: "confidence-mapping/1",
points: [[raw_score, displayed_score], ...]}. Точки монотонны по обеим
координатам, покрывают [0,1]; линейная интерполяция меняет только confidence.
Этот локальный формат требует адаптера, если поставщик выпускает иной формат.
"""
from typing import Protocol, TypedDict, NotRequired
import re
import unicodedata

# Полный класс Cf текущей версии Unicode; позиции исходной строки не меняются.
CF_CHARS=''.join(chr(n) for n in range(0x110000) if unicodedata.category(chr(n))=='Cf')
CF_CLASS=re.escape(CF_CHARS)
SPACE_CF=r'[\s'+CF_CLASS+']'
CAMEL_BOUNDARY=re.compile(r'(?<=[a-zа-яәғқңөұүһіё])(?=[A-ZА-ЯӘҒҚҢӨҰҮҺІЁ][a-zа-яәғқңөұүһіё])')

def word_boundaries(value):
    """Смещения границ склеенных слов; цифра с литерой и одиночная буква целы."""
    return [m.start() for m in CAMEL_BOUNDARY.finditer(value)]

def spaced_words(value):
    return CAMEL_BOUNDARY.sub(' ',value)

def is_edge(char):
    return char.isspace() or char in ',;:.' or unicodedata.category(char)=='Cf'

def trim_span(raw,start,end):
    """Обрезать только края интервала; внутренние пробелы и Cf сохраняются."""
    while start<end and is_edge(raw[start]):start+=1
    while end>start and is_edge(raw[end-1]):end-=1
    return start,end

ADDRESS_FIELDS = ('province', 'city', 'district', 'living_area', 'street_type',
                  'street_name', 'house', 'apartment', 'entrance', 'floor', 'landmark')
RECORD_FIELDS = ('id', 'raw_address', *ADDRESS_FIELDS, 'confidence')
ORIGINS = ('explicit', 'inferred', 'absent')
SLICE_FIELDS = ('district', 'living_area', 'street_name', 'house', 'apartment',
                'entrance', 'floor', 'landmark')

class Candidate(TypedDict):
    field: str
    spans: list[list[int]]
    score: float
    method: str
    value: NotRequired[str]
    evidence: NotRequired[dict]

class CandidateProvider(Protocol):
    def get_candidates(self, raw: str, tokens: list[dict], context: dict) -> list[Candidate]: ...

def empty_record(raw):
    return dict(id=None, raw_address=raw, **{f: None for f in ADDRESS_FIELDS}, confidence=0.0)

def validate_record(record):
    if set(record) != set(RECORD_FIELDS):
        raise ValueError('Требуются ровно 14 полей')
    if not isinstance(record['raw_address'], str):
        raise TypeError('raw_address должен быть строкой')
    for field in ADDRESS_FIELDS:
        value = record[field]
        if value is not None and (not isinstance(value, str) or not value):
            raise TypeError(f'Неверное значение {field}')
    value = record['confidence']
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
        raise ValueError('confidence вне [0,1]')
