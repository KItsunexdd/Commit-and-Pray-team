"""Preserve typed street relations as explicit, non-destructive source evidence."""
import argparse,collections,json,pathlib,sqlite3,sys
from db_common_v1 import *
from sqlite_reference_v1 import unpack
sys.path.insert(0,str(pathlib.Path(__file__).parent/'vendor'))
import osmium
from extract_country_v3 import keep_tags

class Relations(osmium.SimpleHandler):
    def __init__(self):super().__init__();self.rows=[]
    def relation(self,o):
        t=dict(o.tags)
        if t.get('type') in {'associatedStreet','street','address'}:
            self.rows.append({'id':'osm:relation/'+str(o.id),'tags':keep_tags(t),
                              'members':[{'id':'osm:'+{'n':'node','w':'way','r':'relation'}[m.type]+'/'+str(m.ref),'role':m.role} for m in o.members],
                              'timestamp':o.timestamp.isoformat(),'snapshot_date':'2026-10-15T20:21:00Z'})

def run(root,release,index,out):
    out.mkdir(parents=True,exist_ok=False);h=Relations()
    h.apply_file(osmium.io.File(str(root/'Data/research/raw/osm_kazakhstan_pbf.bin'),'pbf'))
    wanted={m['id'] for r in h.rows for m in r['members']};relation_ids={r['id'] for r in h.rows};lookup={};overlap=set()
    for row in read_collection(release,'observation_links'):
        if row['id'] in wanted:lookup[row['id']]=row
        if row['id'] in relation_ids:overlap.add(row['id'])
    geos={g['id']:g for g in read_collection(release,'geonims')}
    db=sqlite3.connect('file:'+index.resolve().as_posix()+'?mode=ro',uri=True)
    evidence=[];counts=collections.Counter()
    for r in h.rows:
        counts['relation_type_'+r['tags']['type']]+=1
        street_ids=set();missing=0
        for m in r['members']:
            member=lookup.get(m['id'])
            m['link_status']='selected_observation' if member else 'not_in_selected_observations'
            if m['role'] in {'street','road'}:
                if member:street_ids|={gid for gid in member['geonim_ids'] if geos[gid].get('role')=='street'}
                else:missing+=1
        r['geonim_candidates']=sorted(street_ids);r['missing_street_members']=missing
        r['locality_candidates']=sorted({geos[g]['locality_id'] for g in street_ids if geos[g].get('locality_id')})
        r['link_status']='member_linked' if len(street_ids)==1 and not missing else ('ambiguous_membership' if street_ids else 'unmatched_membership')
        counts[r['link_status']]+=1
        for m in r['members']:
            if m['role']!='house':continue
            member=lookup.get(m['id'])
            if not member or not member['house_ids']:
                evidence.append({'relation_id':r['id'],'source_house_id':m['id'],'house_id':None,'status':'house_not_resolved','geonim_candidates':sorted(street_ids)})
                counts['house_not_resolved']+=1;continue
            for hid in member['house_ids']:
                found=db.execute('SELECT payload FROM houses WHERE id=?',(hid,)).fetchone()
                if found is None:raise ValueError('Invalid house reference '+hid)
                house=unpack(found[0]);candidates=sorted(g for g in street_ids if house.get('locality_id') and geos[g].get('locality_id')==house['locality_id'])
                status='agrees_with_primary' if house.get('geonim_id') in candidates else ('conflicts_with_primary' if house.get('geonim_id') and candidates else 'candidate_requires_review')
                evidence.append({'relation_id':r['id'],'source_house_id':m['id'],'house_id':hid,'status':status,'geonim_candidates':candidates,
                                 'primary_geonim_id':house.get('geonim_id'),'origin':'observed','method':'explicit_osm_relation_membership',
                                 'snapshot_date':r['snapshot_date'],'automatic_override':False})
                counts[status]+=1
    db.close()
    desc={}
    desc['address_relations']=shards_write(out,'address_relations',sorted(h.rows,key=lambda r:r['id']))
    desc['relation_house_evidence']=shards_write(out,'relation_house_evidence',sorted(evidence,key=dumps))
    manifest={'schema_version':SCHEMA,'path_base':'directory_containing_this_manifest','collections':desc,'statistics':dict(counts),
              'typed_relations':len(h.rows),'already_in_primary_observation_selection':sorted(overlap),'additional_distinct_observations':len(h.rows)-len(overlap),
              'primary_manifest_sha256':digest(release/'manifest.json'),'pbf_sha256':digest(root/'Data/research/raw/osm_kazakhstan_pbf.bin'),
              'policy':'Relation membership is preserved as evidence; it never silently overrides direct addr:street or confirmed registry foreign keys.'}
    write_json(out/'manifest.json',manifest);print(dumps(manifest['statistics']))

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=pathlib.Path,required=True);ap.add_argument('--release',type=pathlib.Path,required=True);ap.add_argument('--index',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True);a=ap.parse_args();run(a.root,a.release,a.index,a.out)
