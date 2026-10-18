# Jana Address: REST API, парсер, справочник и веб-интерфейс в одном образе.
# Для работы сеть не нужна: всё, что требуется во время запуска, уже внутри образа.
# Базовый образ закреплён по контрольной сумме, чтобы повторная сборка давала то же окружение.
FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000 \
    API_PREFIX=/api

WORKDIR /srv/jana

COPY requirements.txt constraints.txt ./
RUN pip install -r requirements.txt -c constraints.txt

# Парсер: только модули, нужные для разбора (без тестов и скриптов сборки).
COPY AddressParser/__init__.py AddressParser/parser.py AddressParser/contracts.py \
     AddressParser/reference.py AddressParser/administrative.py AddressParser/neighbours.py \
     AddressParser/uniform.py AddressParser/territories.py AddressParser/
# Справочник и вспомогательные слои лежат по тем же путям, что ждёт парсер.
COPY artifacts/address_db/runtime/v002-territories/address_runtime.sqlite artifacts/address_db/runtime/v002-territories/
COPY artifacts/baseline/neighbours-v1.sqlite artifacts/baseline/
COPY artifacts/baseline/v3/uniform-v3/uniform.sqlite artifacts/baseline/v3/uniform-v3/
COPY web/dist web/dist
COPY app/__init__.py app/__main__.py app/main.py app/service.py app/openapi.py app/
COPY app/static app/static

# Если git lfs pull не выполнен, вместо баз окажутся текстовые указатели: сборка остановится.
RUN python - <<'PY'
import sys
for path in ('artifacts/address_db/runtime/v002-territories/address_runtime.sqlite',
             'artifacts/baseline/neighbours-v1.sqlite', 'artifacts/baseline/v3/uniform-v3/uniform.sqlite'):
    with open(path, 'rb') as stream:
        if stream.read(16) != b'SQLite format 3\x00':
            sys.exit(f'{path} не является SQLite: выполните git lfs pull и соберите образ заново')
PY
RUN python -m compileall -q AddressParser app \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin jana

USER jana
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s%s/health' % (os.environ['PORT'], os.environ['API_PREFIX']), timeout=2)"
CMD ["python", "-m", "app"]
