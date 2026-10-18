"""Compose immutable primary and evidence collections into one portable manifest."""
import argparse,copy,json,os,pathlib
from db_common_v1 import *

def run(root,release,relations,neighbours,acceptance,extraction,out,index=None):
    proof=json.loads(acceptance.read_text(encoding='utf-8'))
    if not proof['passed'] or proof['manifest_sha256']!=digest(release/'manifest.json'):raise ValueError('Acceptance does not match release')
    relational=json.loads((relations/'manifest.json').read_text(encoding='utf-8'))
    if relational['primary_manifest_sha256']!=digest(release/'manifest.json'):raise ValueError('Relation evidence does not match release')
    validation=json.loads((neighbours/'validation.json').read_text(encoding='utf-8'))
    if validation['release_manifest_sha256']!=digest(release/'manifest.json') or validation['relation_evidence_sha256']!=digest(relations/'relation_house_evidence.json'):
        raise ValueError('Neighbour evidence does not match inputs')
    out.mkdir(parents=True,exist_ok=False)
    relative=lambda p:pathlib.Path(os.path.relpath(p,out)).as_posix()
    manifest=json.loads((release/'manifest.json').read_text(encoding='utf-8'))
    if relational['pbf_sha256']!=manifest['extraction']['pbf_sha256']:raise ValueError('Source snapshot mismatch')
    for section in ['collections','auxiliary_collections']:
        for name,desc in manifest.get(section,{}).items():
            for shard in desc['shards']:shard['path']=relative(release/shard['path'])
            write_json(out/(name+'.json'),desc)
    for name,desc in copy.deepcopy(relational['collections']).items():
        for shard in desc['shards']:shard['path']=relative(relations/shard['path'])
        manifest['auxiliary_collections'][name]=desc;write_json(out/(name+'.json'),desc)
    manifest['selected_release_manifest']=relative(release/'manifest.json')
    manifest['selected_release_manifest_sha256']=digest(release/'manifest.json')
    manifest['source_catalog']=relative(release/'source_catalog.json')
    manifest['build_report']=relative(release/'build_report.json')
    manifest['acceptance']=relative(acceptance)
    manifest['extraction']['path_base']=relative(extraction)
    manifest['extraction']['path_base_anchor']='directory_containing_this_manifest'
    manifest['inference']={'policy':relative(neighbours/'policy.json'),'validation':relative(neighbours/'validation.json'),'families':relative(neighbours/'families.json'),'origin':'inferred'}
    manifest['additional_relations']={'manifest':relative(relations/'manifest.json'),'statistics':relational['statistics']}
    if index:
        build=json.loads(index.with_suffix('.build.json').read_text(encoding='utf-8'))
        if build['manifest_sha256']!=digest(release/'manifest.json') or build['integrity_check']!='ok':raise ValueError('SQLite does not match release')
        manifest['sqlite']={'path':relative(index),'sha256':build['sha256'],'bytes':build['bytes']}
    write_json(out/'manifest.json',manifest)
    print(str(out/'manifest.json'),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    for name in ['root','release','relations','neighbours','acceptance','extraction','out']:ap.add_argument('--'+name,type=pathlib.Path,required=True)
    ap.add_argument('--index',type=pathlib.Path);a=ap.parse_args();run(**vars(a))
