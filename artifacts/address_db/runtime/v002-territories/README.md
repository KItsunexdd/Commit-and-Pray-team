# runtime v002-territories

Самостоятельный SQLite `address_runtime.sqlite` содержит прежний компактный справочник и новую таблицу `territory_districts`. Все прежние строки admin, display_rules, geonims, name_targets, houses, house_districts сохранены без изменения; это проверено полными логическими хешами. Старый `runtime/v001-project` не изменён.

## Полный контур и порог

Использован локальный PBF от 15.10.2026 20:21 UTC. Контуры ways и relations извлечены заново; учитываются все части MultiPolygon и внутренние кольца. Площадь считается в сферической равновеликой проекции Lambert azimuthal equal-area отдельно для каждого города, после уплотнения сегментов до 0,001 градуса. Доля = площадь пересечения с районом / полная площадь территории. Непокрытая часть не отбрасывается и не перенормируется.

При доле >=0,95 у одного района записаны `district`, `method="territory_within_district"`, `fraction`. Если остаётся небольшая часть в другом районе, её доля тоже хранится в candidates: 95% не означает полное геометрическое включение. Если ни один район не достиг 95%, а пересечение есть с несколькими, это конфликт. Несогласованные отдельные контуры одной поисковой группы тоже дают конфликт, даже если крупный контур занимает более 95% их суммарной площади. Перекрывающиеся районные полигоны не разрешаются выбором первого.

Это вывод по территории, `origin="inferred"`. Он не заменяет точную районную связь дома, не разрешает менять явно указанный район и не доказывает, что любой дом территории расположен в выбранном районе. Точка территории не использовалась для назначения района. Центр проекции задаёт только систему измерения площади.

## Объекты и пропуски

Проверены геонимы с role=address_area и дополнительные геонимы с явным обозначением микрорайона в имени/типе. Контуры домов и замкнутые дорожные линии не принимаются за контуры территорий. Связь с OSM подтверждается исходной ссылкой/сопоставлением и именем, либо единственным точным именем территории в том же городе. Несколько одноимённых контуров без установленной связи не выбираются произвольно.

В таблице 12 267 геонимов: 11 607 address_area и 660 дополнительных обозначений микрорайона. Это число справочных ID, не число неповторяющихся физических территорий. У 1 122 ID есть район (1 001 address_area и 121 дополнительный микрорайон); 19 геометрических конфликтов и 8 неоднозначных соответствий контурам. 996 различных исходных OSM-контуров участвуют в назначениях. Контуры сопоставлены с 23 подтверждёнными полигонами городских районов пяти городов. Караганда явно пропущена, её 3 044 подходящих записи имеют статус skipped_karaganda и пустой район.

`no_polygon`, `unresolved_locality`, `no_district_polygons` и `insufficient_coverage` не означают отсутствие территории. Они объясняют, почему слой не назначил район. Разделение геонима типа street и роли address_area в основной таблице не изменяется.

## Таблица и чтение

`territory_districts.geonim` — ссылка на geonims.gid, `locality` и `district` — ссылки на admin.aid. Поля: method, fraction, status, conflict, area_m2, covered_fraction, candidates_json, contours_json. Составной ключ города и улицы здесь не нужен: запись относится к однозначному geonim ID, а не ко всем совпадениям его имени.

`candidates_json` сохраняет district_id и долю всей площади для геометрически определённой территории. При неоднозначном сопоставлении имени вместо выдуманной единой доли содержит `alternative_contour_fractions`: доли каждого возможного OSM-контура отдельно. `contours_json` сохраняет OSM ID, способ привязки, дату, площадь и пересечения каждого полного контура; сами координаты остаются в аудиторском `territories-v002/osm_polygons.json` и для runtime не нужны.

```python
from runtime_index_v1 import connect
from runtime_territories_v1 import find_territory

db = connect("address_runtime.sqlite")
result = find_territory(db, "osm:way/265577783")
assert result["district_id"] == "kato:751310000"  # Ауэзовский район
assert result["method"] == "territory_within_district"
assert result["fraction"] >= 0.95
db.close()
```

Оба читателя находятся в `artifacts/address_db/tools/` и используют только стандартную библиотеку Python. Для запуска достаточно SQLite и кода читателей. Никакие shapely/osmium/numpy, геометрии, старый runtime или сеть в Docker не нужны. Новый lookup возвращает `None`, если geonim вообще не входит в слой, и запись со статусом/пустым районом, если он проверен, но назначения нет.

## Воспроизведение

Из корня репозитория, с новыми свободными выходными каталогами:

```text
python -B artifacts/address_db/tools/build_territories_v2.py --root . --out artifacts/address_db/territories-v003-reproduced
python -B artifacts/address_db/tools/verify_territories_v1.py --territories artifacts/address_db/territories-v003-reproduced --out artifacts/address_db/territories-v003-reproduced/acceptance.json
python -B -S artifacts/address_db/tools/build_runtime_territories_v1.py --base-runtime artifacts/address_db/runtime/v001-project/address_runtime.sqlite --territories artifacts/address_db/territories-v003-reproduced --out artifacts/address_db/runtime/v003-reproduced
```

Для повторного расчёта без чтения PBF поддерживается `--reuse artifacts/address_db/territories-v002`; хеш PBF и хеш сохранённого извлечения проверяются. При смене PBF или исходных геонимов следует выполнить новое извлечение. Сборка геометрии использует локальные зависимости tools/vendor; чтение runtime — нет.
