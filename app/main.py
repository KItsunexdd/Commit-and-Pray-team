"""HTTP-сервис Jana Address: REST API разбора и собранный веб-интерфейс в одном процессе."""
from __future__ import annotations

import asyncio
import json
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import openapi, service

API_PREFIX = '/' + os.environ.get('API_PREFIX', '/api').strip('/')
WEB_DIST = Path(os.environ.get('WEB_DIST', service.ROOT / 'web' / 'dist'))
STATIC = Path(__file__).resolve().parent / 'static'
# Предел размера тела проверяется до разбора JSON, чтобы огромный запрос не занимал память целиком.
MAX_BODY_BYTES = int(os.environ.get('MAX_BODY_BYTES', 64 * 1024 * 1024))
# Разбор — чистая работа процессора под GIL. Параллельные потоки только мешают друг другу
# и каждый открывает свои соединения SQLite, поэтому запросы встают в общую очередь
# к одному прогретому потоку. PARSE_WORKERS > 1 оставлен для экспериментов.
PARSE_WORKERS = max(1, int(os.environ.get('PARSE_WORKERS', 1)))
parse_pool = ThreadPoolExecutor(max_workers=PARSE_WORKERS, thread_name_prefix='parse')
state: dict[str, Any] = {'ready': False, 'gazetteer': None}


class SafeJSONResponse(JSONResponse):
    """JSON в UTF-8; строка с непарным суррогатом не роняет ответ, а экранируется по правилам JSON."""

    def render(self, content: Any) -> bytes:
        try:
            return super().render(content)
        except UnicodeEncodeError:
            return json.dumps(content, ensure_ascii=True, allow_nan=False, separators=(',', ':')).encode('ascii')


async def in_parse_queue(function, *args):
    return await asyncio.get_running_loop().run_in_executor(parse_pool, function, *args)


@asynccontextmanager
async def lifespan(_: FastAPI):
    for _ in range(PARSE_WORKERS):
        await in_parse_queue(service.warm_up)
    state['gazetteer'] = await run_in_threadpool(service.gazetteer_info)
    state['ready'] = True
    yield


def bad_request(error: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(error))


def too_large() -> HTTPException:
    return HTTPException(status_code=413, detail=f'Тело запроса больше {MAX_BODY_BYTES} байт')


async def read_body(request: Request) -> bytes:
    declared = request.headers.get('content-length')
    if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise too_large()
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            raise too_large()
        chunks.append(chunk)
    return b''.join(chunks)


async def read_json(request: Request) -> Any:
    """JSON из тела или из файла в поле `file` формы multipart."""
    content_type = request.headers.get('content-type', '')
    if content_type.startswith('multipart/form-data'):
        declared = request.headers.get('content-length')
        if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            raise too_large()
        # Тело читается с подсчётом объёма и до разбора формы: так лимит работает и для потоковой
        # передачи без Content-Length. Starlette разбирает форму из уже прочитанного тела.
        request._body = await read_body(request)
        form = await request.form(max_part_size=MAX_BODY_BYTES)
        try:
            upload = form.get('file')
            if upload is None or isinstance(upload, str):
                raise service.InputError('В форме нет файла в поле file')
            body = await upload.read()
        finally:
            await form.close()
    else:
        body = await read_body(request)
    try:
        return json.loads(body.decode('utf-8-sig'))
    except (UnicodeDecodeError, ValueError) as error:
        raise service.InputError('Тело запроса не является JSON в UTF-8') from error


router = APIRouter()


@router.get('/health')
def health():
    if not state['ready']:
        return JSONResponse({'status': 'starting', 'version': service.VERSION}, status_code=503)
    return {'status': 'ok', 'version': service.VERSION}


@router.get('/info')
def info():
    return {'version': service.VERSION, 'gazetteer': state['gazetteer'], 'metrics': service.quality_metrics()}


@router.post('/parse/batch', openapi_extra=openapi.BATCH, summary='Пакетный разбор в формате жюри')
async def parse_batch(request: Request):
    """Пакетный разбор строго в формате sample_output.json."""
    try:
        records = service.read_records(await read_json(request))
    except service.InputError as error:
        raise bad_request(error) from error
    return await in_parse_queue(service.parse_batch, records)


@router.post('/parse', openapi_extra=openapi.SINGLE, summary='Разбор одной строки')
async def parse_one(request: Request):
    """Одна строка: {"raw_address": "...", "id": "..."} → один результат."""
    try:
        payload = await read_json(request)
    except service.InputError as error:
        raise bad_request(error) from error
    if not isinstance(payload, dict) or not isinstance(payload.get('raw_address'), str):
        raise bad_request(service.InputError('Нужен объект с полем raw_address'))
    return (await in_parse_queue(service.parse_batch, [payload]))[0]


@router.post('/ui/parse', openapi_extra=openapi.UI, summary='Разбор с пояснениями для интерфейса')
async def parse_for_ui(request: Request):
    """Разбор для интерфейса: результат и пояснения (позиции полей и источники)."""
    try:
        records = service.read_ui_records(await read_json(request))
    except service.InputError as error:
        raise bad_request(error) from error
    return await in_parse_queue(service.explain_batch, records)


@router.get('/docs', include_in_schema=False)
def docs():
    """Swagger UI из файлов внутри образа: страница работает без интернета."""
    static = f'{API_PREFIX}/static/swagger'
    return get_swagger_ui_html(openapi_url=f'{API_PREFIX}/openapi.json', title='Jana Address — API',
                               swagger_js_url=f'{static}/swagger-ui-bundle.js', swagger_css_url=f'{static}/swagger-ui.css',
                               swagger_favicon_url=f'{static}/favicon-32x32.png')


def create_app() -> FastAPI:
    app = FastAPI(title='Jana Address', version=service.VERSION, lifespan=lifespan, default_response_class=SafeJSONResponse,
                  description='Разбор адресов доставки Jana Post на 14 полей. Работает без интернета.',
                  docs_url=None, redoc_url=None, openapi_url=f'{API_PREFIX}/openapi.json')
    app.include_router(router, prefix=API_PREFIX)
    app.mount(f'{API_PREFIX}/static', StaticFiles(directory=STATIC), name='api-static')
    if (WEB_DIST / 'index.html').is_file():
        app.mount('/', StaticFiles(directory=WEB_DIST, html=True), name='web')
    return app


app = create_app()
