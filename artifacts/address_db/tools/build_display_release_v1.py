"""New immutable administrative overlay; unchanged collections reuse verified shards."""
import argparse
import copy
import json
import os
import pathlib
from db_common_v1 import *

def build(source, policy_path, out):
    policy = json.loads(policy_path.read_text(encoding='utf-8'))
    out.mkdir(parents=True, exist_ok=False)
    original = list(read_collection(source, 'admin'))
    admin = copy.deepcopy(original)
    byid = {r['id']: r for r in admin}
    overrides = policy['overrides']
    for r in admin:
        pid = r.get('province_id')
        if r['type'] == 'province': pid = r['id']
        if not pid:
            ancestor = r
            seen = set()
            while ancestor and ancestor['id'] not in seen:
                seen.add(ancestor['id'])
                if ancestor['type'] == 'province' or ancestor.get('province_id') == ancestor['id']:
                    pid = ancestor['id']; break
                ancestor = byid.get(ancestor.get('parent_id'))
        province = r.get('province') or (byid[pid]['display_name'] if pid else None)
        city = r.get('city')
        r['province_display'] = overrides.get(pid, {}).get('project', province)
        r['city_display'] = overrides.get(r['id'], {}).get('project', city) if city else None
        r['display_policy'] = {'schema_version': policy['schema_version'], 'profile': 'project',
                               'province_entity_id': pid, 'source_fields_unchanged': True}
        if r['id'] in overrides:
            rule = overrides[r['id']]
            actual = city if rule['field'] == 'city' else r['display_name']
            assert actual == rule['official'], (r['id'], actual)
            pairs = [(rule['project'], 'ru', 'project_display_convention'),
                     (rule['official'], 'kk' if rule['field'] == 'city' else 'ru', 'source_official')]
            pairs += [(v, k, 'source_official') for k, v in r['names'].items() if v]
            for value, lang, origin in pairs:
                r['variants'].append({'value': value, 'language': lang, 'origin': origin,
                                      'source_id': 'admin-display-policy/1'})
    source_manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    manifest = copy.deepcopy(source_manifest)
    for group in ['collections', 'auxiliary_collections']:
        for name, desc in manifest.get(group, {}).items():
            if name in ['admin', 'name_index']: continue
            for shard in desc['shards']:
                shard['path'] = pathlib.Path(os.path.relpath(source / shard['path'], out)).as_posix()
            write_json(out / (name + '.json'), desc)
    manifest['collections']['admin'] = shards_write(out, 'admin', admin)
    added = {r['key']: r for r in build_name_index(admin)}
    names = []
    for old in read_collection(source, 'name_index'):
        extra = added.pop(old['key'], {})
        names.append({'key': old['key'], **{field: sorted(set(old[field]) | set(extra.get(field, [])))
                      for field in ['current_ids', 'historical_ids', 'generated_latin_ids']}})
    names.extend(added.values())
    names.sort(key=lambda r: r['key'])
    manifest['collections']['name_index'] = shards_write(out, 'name_index', names)
    write_json(out / 'display_rules.json', policy)
    source_catalog = json.loads((source / 'source_catalog.json').read_text(encoding='utf-8'))
    write_json(out / 'source_catalog.json', source_catalog)
    report = {'release': out.name, 'base_release': source.name, 'original_names_preserved':
              all(a['names'] == b['names'] and a.get('city') == b.get('city') and a.get('province') == b.get('province')
                  for a, b in zip(original, admin)), 'display_rules_sha256': digest(policy_path),
              'admin_count': len(admin), 'name_index_count': len(names),
              'changed_source_house_or_geonim_records': 0,
              'reuse': 'Unchanged shards referenced by relative paths; keep v007-country.'}
    assert report['original_names_preserved']
    write_json(out / 'build_report.json', report)
    manifest.update(release=out.name, status='accepted_administrative_display_overlay',
                    schema_version='jana-address-db/1.1',
                    path_base='directory_containing_manifest',
                    base_release={'path': pathlib.Path(os.path.relpath(source, out)).as_posix(),
                                  'manifest_sha256': digest(source / 'manifest.json')},
                    display_policy={'path': 'display_rules.json', 'sha256': digest(out / 'display_rules.json')},
                    build_report_sha256=digest(out / 'build_report.json'))
    manifest.pop('created_at_utc', None)
    write_json(out / 'manifest.json', manifest)
    print(dumps(report), flush=True)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=pathlib.Path, required=True)
    ap.add_argument('--policy', type=pathlib.Path, required=True)
    ap.add_argument('--out', type=pathlib.Path, required=True)
    a = ap.parse_args(); build(a.source, a.policy, a.out)
