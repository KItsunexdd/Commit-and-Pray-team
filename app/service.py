"""Разбор адресов для HTTP-слоя: валидация, пакетный разбор и пояснения для интерфейса."""
from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

from AddressParser import explain_address, parse_address
from AddressParser.reference import DEFAULT_DB

VERSION = '1.0.0'
log = logging.getLogger('jana_address')
FIELDS = ('province', 'city', 'district', 'living_area', 'street_type', 'street_name',
          'house', 'apartment', 'entrance', 'floor', 'landmark')
ROOT = Path(__file__).resolve().parents[1]

# Ограничения защищают сервис от случайно огромных запросов. Разбирается только начало адреса
# (512 символов — в несколько раз длиннее любого реального адреса), а в ответ строка возвращается
# целиком: на вырожденных строках в тысячи символов время разбора растёт нелинейно и одна такая
# запись надолго заняла бы общую очередь.
MAX_ADDRESS_CHARS = int(os.environ.get('MAX_ADDRESS_CHARS', 512))
MAX_BATCH_RECORDS = int(os.environ.get('MAX_BATCH_RECORDS', 100_000))
MAX_UI_RECORDS = int(os.environ.get('MAX_UI_RECORDS', 500))


class InputError(ValueError):
    """Запрос не соответствует контракту API."""


def empty_result(record_id: Any, raw: Any) -> dict[str, Any]:
    return {'id': record_id, 'raw_address': raw, **{field: None for field in FIELDS}, 'confidence': 0.0}


def _parse_one(record_id: Any, raw: Any, position: int = 0) -> dict[str, Any]:
    text = raw if isinstance(raw, str) else ''
    try:
        result = parse_address(text[:MAX_ADDRESS_CHARS])
    except Exception:  # Сбой одной строки не должен ронять весь пакет, но должен попасть в журнал.
        log.exception('Сбой разбора записи №%d (длина строки %d)', position, len(text))
        return empty_result(record_id, raw)
    return {'id': record_id, 'raw_address': raw, **{field: result.get(field) for field in FIELDS},
            'confidence': _confidence(result.get('confidence'))}


def _confidence(value: Any) -> float:
    if isinstance(value, (int, float)) and value == value:
        return round(min(1.0, max(0.0, float(value))), 4)
    return 0.0


def read_records(payload: Any) -> list[Any]:
    """Принимает массив записей или обёртку {"records": [...]}."""
    records = payload.get('records') if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise InputError('Ожидается массив записей или объект {"records": [...]}')
    if len(records) > MAX_BATCH_RECORDS:
        raise InputError(f'Слишком много записей: больше {MAX_BATCH_RECORDS}')
    return records


def parse_batch(records: list[Any]) -> list[dict[str, Any]]:
    """Строгий формат жюри: ответ на каждую запись в исходном порядке.

    `id` и `raw_address` возвращаются как пришли. Запись без строки адреса
    получает пустой разбор, а не ошибку на весь пакет.
    """
    output = []
    for position, record in enumerate(records, 1):
        if isinstance(record, dict):
            output.append(_parse_one(record.get('id'), record.get('raw_address'), position))
        else:
            output.append(empty_result(None, None))
    return output


def read_ui_records(payload: Any) -> list[dict[str, str]]:
    """Интерфейс шлёт только {"records": [{"id": str, "raw_address": str}]}."""
    if not isinstance(payload, dict) or not isinstance(payload.get('records'), list):
        raise InputError('Ожидается объект {"records": [...]}')
    records = payload['records']
    if len(records) > MAX_UI_RECORDS:
        raise InputError(f'Слишком много записей: больше {MAX_UI_RECORDS}')
    for index, record in enumerate(records, 1):
        if not isinstance(record, dict) or not isinstance(record.get('id'), str) \
                or not isinstance(record.get('raw_address'), str):
            raise InputError(f'Запись {index}: нужны строковые поля id и raw_address')
    return records


def utf16_offsets(text: str) -> list[int]:
    """Позиция каждой кодовой точки в единицах UTF-16, как считает JavaScript."""
    offsets = [0]
    for char in text:
        offsets.append(offsets[-1] + (2 if ord(char) > 0xFFFF else 1))
    return offsets


def explain_one(record: dict[str, str], position: int = 0) -> dict[str, Any]:
    raw = record['raw_address']
    try:
        detail = explain_address(raw[:MAX_ADDRESS_CHARS])
    except Exception:
        log.exception('Сбой разбора записи №%d для интерфейса (длина строки %d)', position, len(raw))
        return {'result': empty_result(record['id'], raw), 'explain': None}
    parsed = detail['record']
    result = {'id': record['id'], 'raw_address': raw, **{field: parsed.get(field) for field in FIELDS},
              'confidence': _confidence(parsed.get('confidence'))}
    # Парсер считает позиции в кодовых точках, интерфейс режет строку в UTF-16.
    offsets = utf16_offsets(raw)
    spans = []
    for span in detail.get('spans') or []:
        start, end = span.get('start'), span.get('end')
        if span.get('field') in FIELDS and isinstance(start, int) and isinstance(end, int) \
                and 0 <= start < end <= len(raw) and end <= MAX_ADDRESS_CHARS:
            spans.append({'field': span['field'], 'start': offsets[start], 'end': offsets[end]})
    sources = {field: source for field, source in (detail.get('sources') or {}).items()
               if field in FIELDS and source in ('string', 'dictionary') and result.get(field) is not None}
    return {'result': result, 'explain': {'spans': spans, 'sources': sources}}


def explain_batch(records: list[dict[str, str]]) -> dict[str, Any]:
    return {'items': [explain_one(record, position) for position, record in enumerate(records, 1)]}


def _database_path() -> Path:
    return Path(os.environ.get('JANA_ADDRESS_DB', DEFAULT_DB))


def gazetteer_info() -> dict[str, Any]:
    """Сведения о справочнике для экрана интерфейса; считаются один раз при старте."""
    uri = _database_path().resolve().as_uri() + '?mode=ro'
    with closing(sqlite3.connect(uri, uri=True)) as db:
        admin = dict(db.execute('select type, count(*) from admin group by type'))
        roles = dict(db.execute('select role, count(*) from geonims group by role'))
        houses = db.execute('select count(*) from houses').fetchone()[0]
        meta = dict(db.execute("select key, value from metadata where key = 'snapshot_dates'"))
    dates = json.loads(meta.get('snapshot_dates', '{}'))
    return {
        'sources': [
            {'name': 'OpenStreetMap', 'url': 'https://www.openstreetmap.org', 'date': str(dates.get('osm', ''))[:10] or None},
            {'name': 'КАТО — классификатор административно-территориальных объектов', 'url': 'https://stat.gov.kz',
             'date': dates.get('kato')},
        ],
        'counts': {
            'regions': admin.get('province', 0) + 3,  # области и три города республиканского значения
            'cities': admin.get('city', 0),
            'districts': admin.get('district', 0) + admin.get('urban_district', 0),
            'streets': roles.get('street', 0),
            'living_areas': roles.get('address_area', 0),
            'houses': houses,
        },
    }


def quality_metrics() -> list[dict[str, Any]]:
    """Метрики показываются, только если оценка на закрытой выборке положена рядом."""
    path = Path(os.environ.get('JANA_METRICS', ROOT / 'data' / 'metrics.json'))
    try:
        rows = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return []
    keys = ('score', 'address', 'details', 'reference')
    return [row for row in rows if isinstance(row, dict) and isinstance(row.get('version'), str)
            and all(isinstance(row.get(key), (int, float)) for key in keys)] if isinstance(rows, list) else []


def warm_up() -> None:
    """Открывает справочники заранее, чтобы первый запрос жюри не ждал."""
    parse_address('город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70')
