"""Rebuild an immutable offline address-reference release from local inputs.

Paths are resolved against --root (default: this script's project parent).
Only artifacts/address_db is written. Existing versions are never overwritten.
Development dependencies: osmium==4.3.1, shapely==2.2.0, numpy==2.5.4.
The published JSON and SQLite can be consumed with the Python standard library.
"""
import argparse
import pathlib
import re
import subprocess
import sys

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1])
    ap.add_argument('--release',required=True,help='new immutable version name, e.g. v006-rebuild')
    ap.add_argument('--reuse-extraction',help='existing folder directly under artifacts/address_db; omit for a new PBF pass')
    ap.add_argument('--skip-sqlite',action='store_true')
    args=ap.parse_args();root=args.root.resolve();base=root/'artifacts/address_db';tools=base/'tools'
    if not re.fullmatch(r'[A-Za-z0-9_-]+',args.release):ap.error('release must be a plain version name')
    release=base/'releases'/args.release;checks=base/('checks-'+args.release)
    if release.exists() or checks.exists():ap.error('version already exists; choose a new name')
    checks.mkdir(parents=True)
    def run(script,*arguments,stdlib=False):
        command=[sys.executable]+(['-S'] if stdlib else [])+[str(tools/script)]+[str(a) for a in arguments]
        subprocess.run(command,cwd=root,check=True)
    if args.reuse_extraction:
        if not re.fullmatch(r'[A-Za-z0-9_-]+',args.reuse_extraction):ap.error('extraction must be a plain folder name')
        extraction=base/args.reuse_extraction
        if not (extraction/'extraction.json').is_file():ap.error('complete extraction manifest is absent')
    else:
        extraction=base/('extraction-'+args.release)
        run('extract_country_v3.py','--root',root,'--out',extraction)
    run('pbf_census_v1.py','--root',root,'--extraction',extraction,'--out',checks/'pbf_census.json')
    run('contract_controls_v1.py','--out',checks/'controls.json')
    run('build_country_v5.py','--root',root,'--extraction',extraction,'--out',release)
    run('verify_release_v1.py','--root',root,'--release',release,'--out',checks/'acceptance.json',stdlib=True)
    run('verify_release_v1.py','--release',release,'--benchmark','stream','--out',checks/'benchmark-stream.json',stdlib=True)
    if not args.skip_sqlite:
        run('sqlite_reference_v1.py','--release',release,'--out',checks/'reference.sqlite',stdlib=True)
        run('sqlite_reference_v1.py','--benchmark',checks/'reference.sqlite','--out',checks/'benchmark-sqlite.json',stdlib=True)
    relation_args=['--root',root,'--release',release,'--out',checks/'relations']
    if not args.skip_sqlite:relation_args+=['--index',checks/'reference.sqlite']
    run('relation_support_v2.py',*relation_args)
    run('neighbour_validation_v2.py','--release',release,'--out',checks/'neighbours','--relation-evidence',checks/'relations',stdlib=True)
    delivery=base/'deliveries'/args.release
    delivery_args=['--root',root,'--release',release,'--relations',checks/'relations','--neighbours',checks/'neighbours',
                   '--acceptance',checks/'acceptance.json','--extraction',extraction,'--out',delivery]
    if not args.skip_sqlite:delivery_args+=['--index',checks/'reference.sqlite']
    run('publish_delivery_v1.py',*delivery_args,stdlib=True)
    print('Completed:',delivery/'manifest.json',flush=True)

if __name__=='__main__':main()
