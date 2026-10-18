"""Схемы запросов и ответов для интерактивной документации /api/docs.

Обработчики читают тело сами, чтобы одна испорченная запись не отклоняла весь пакет,
поэтому FastAPI не может вывести схемы автоматически: они описаны здесь вручную.
"""
from .service import FIELDS

SAMPLE_RAW = 'город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70'
SAMPLE_RECORDS = [{'id': 'rec_00417', 'raw_address': SAMPLE_RAW},
                  {'id': 'rec_00418', 'raw_address': 'Туран 55/6 магазин береке 4подьезд 9этаж'}]

RECORD = {
    'type': 'object',
    'required': ['id', 'raw_address'],
    'properties': {
        'id': {'type': 'string', 'description': 'Идентификатор записи, возвращается без изменений; может повторяться'},
        'raw_address': {'type': 'string', 'description': 'Адрес одной строкой, как его написал клиент'},
    },
}
RESULT = {
    'type': 'object',
    'description': 'Ровно 14 полей в этом порядке; неизвестное значение — null',
    'required': ['id', 'raw_address', *FIELDS, 'confidence'],
    'properties': {
        'id': {'type': 'string'},
        'raw_address': {'type': 'string'},
        **{field: {'type': ['string', 'null']} for field in FIELDS},
        'confidence': {'type': 'number', 'minimum': 0, 'maximum': 1,
                       'description': 'Эвристическая оценка разбора, не вероятность'},
    },
}
ERROR = {'type': 'object', 'properties': {'detail': {'type': 'string'}}}
ERRORS = {
    '413': {'description': 'Тело запроса больше MAX_BODY_BYTES', 'content': {'application/json': {'schema': ERROR}}},
    '422': {'description': 'Тело не JSON или не того вида', 'content': {'application/json': {'schema': ERROR}}},
}
BATCH = {
    'requestBody': {
        'required': True,
        'description': 'Массив записей, обёртка {"records": [...]} или JSON-файл в поле file',
        'content': {
            'application/json': {
                'schema': {'oneOf': [
                    {'type': 'array', 'items': RECORD},
                    {'type': 'object', 'required': ['records'], 'properties': {'records': {'type': 'array', 'items': RECORD}}},
                ]},
                'example': SAMPLE_RECORDS,
            },
            'multipart/form-data': {
                'schema': {'type': 'object', 'required': ['file'],
                           'properties': {'file': {'type': 'string', 'format': 'binary',
                                                   'description': 'JSON-файл того же вида, например Samples/sample_input.json'}}},
            },
        },
    },
    'responses': {
        '200': {'description': 'Результаты в исходном порядке, по одному на каждую запись',
                'content': {'application/json': {'schema': {'type': 'array', 'items': RESULT}}}},
        **ERRORS,
    },
}
SINGLE = {
    'requestBody': {
        'required': True,
        'content': {'application/json': {
            'schema': {'type': 'object', 'required': ['raw_address'],
                       'properties': {'raw_address': {'type': 'string'}, 'id': {'type': 'string'}}},
            'example': {'id': 'rec_1', 'raw_address': SAMPLE_RAW},
        }},
    },
    'responses': {'200': {'description': 'Один результат', 'content': {'application/json': {'schema': RESULT}}}, **ERRORS},
}
UI = {
    'requestBody': {
        'required': True,
        'content': {'application/json': {
            'schema': {'type': 'object', 'required': ['records'],
                       'properties': {'records': {'type': 'array', 'items': RECORD}}},
            'example': {'records': SAMPLE_RECORDS[:1]},
        }},
    },
    'responses': {
        '200': {'description': 'Результат и пояснения для подсветки', 'content': {'application/json': {'schema': {
            'type': 'object', 'properties': {'items': {'type': 'array', 'items': {'type': 'object', 'properties': {
                'result': RESULT,
                'explain': {'type': ['object', 'null'], 'properties': {
                    'spans': {'type': 'array', 'items': {'type': 'object', 'properties': {
                        'field': {'type': 'string'}, 'start': {'type': 'integer'}, 'end': {'type': 'integer'}}},
                        'description': 'Позиции полей в raw_address в единицах UTF-16, end не включается'},
                    'sources': {'type': 'object', 'additionalProperties': {'type': 'string', 'enum': ['string', 'dictionary']}},
                }},
            }}}}}}}},
        **ERRORS,
    },
}
