# Сбор исходных данных

Скрипты первого этапа: скачивание открытых источников и их опись. Каталог источников со ссылками, датами и условиями использования: `sources_catalog.json`, манифест скачанных файлов с контрольными суммами: `download_manifest.json`.

| Скрипт | Что делает |
|---|---|
| `fetch_sources.py` | Скачивает источники по списку «метка URL», сохраняет ответы без изменений в `raw/` и записывает SHA256 |
| `extract_osm.py` | Первичное извлечение наблюдений из PBF OpenStreetMap |
| `collect_karaganda.py`, `collect_flats.py`, `verify_premises.py` | Сбор и проверка адресного реестра Караганды с открытого геопортала области |
| `build_dataset.py`, `validate_dataset.py`, `sanitize_and_inventory.py`, `write_status.py` | Сводный исследовательский набор, проверка ссылок и опись |

Зависимости: `osmium`, `shapely`, `openpyxl`. Скачанные файлы (сотни мегабайт) в git не хранятся. Справочник из них собирают скрипты [`artifacts/address_db/tools/`](../../artifacts/address_db/README.md).
