"""Country-wide extraction. No geographic prefilter; source files are read-only."""
import argparse
import collections
import hashlib
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent / 'vendor'))
import osmium
import shapely.geometry as sg

PLACES = {'city', 'town', 'village', 'hamlet', 'isolated_dwelling'}
AREAS = {'suburb', 'neighbourhood', 'quarter', 'city_block'}

def relevant(t):
    return (any(k in t for k in ('addr:street', 'addr:place', 'addr:housenumber'))
            or t.get('place') in PLACES | AREAS
            or bool(t.get('highway') and any(k == 'name' or k.startswith('name:') for k in t))
            or bool(t.get('landuse') == 'residential' and t.get('name'))
            or bool(t.get('residential') and t.get('name'))
            or bool(t.get('name') and (t['name'].lower().startswith(('жк ', 'жк «', 'жилой комплекс')))))

def keep_tags(tags):
    # Exclude contact data, unit numbers and entrances from this address-reference layer.
    exact = {'name','int_name','loc_name','alt_name','old_name','short_name','official_name',
             'place','highway','landuse','residential','building','boundary','admin_level',
             'type','kato','ref:kato','population','population:date','wikidata','ISO3166-2',
             'addr:street','addr:place','addr:housenumber','addr:block','addr:corpus',
             'addr:city','addr:village','addr:hamlet','addr:suburb','addr:district','addr:region',
             'addr:country','is_in','is_in:city','is_in:country_code'}
    prefixes = ('name:','old_name:','alt_name:','official_name:','short_name:','loc_name:',
                'addr:street:','addr:place:')
    return {k:v for k,v in tags.items() if k in exact or k.startswith(prefixes)}

class Writer:
    def __init__(self, folder, prefix):
        self.folder, self.prefix = folder, prefix
        self.files, self.count, self.size, self.f = [], 0, 0, None
    def put(self, row):
        data=(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf-8')
        if self.f is None or self.size+len(data)>40_000_000:
            if self.f: self.f.close()
            name=f'{self.prefix}-{len(self.files):03d}.jsonl'
            self.files.append(name); self.f=(self.folder/name).open('xb'); self.size=0
        self.f.write(data); self.size+=len(data);self.count+=1
    def close(self):
        if self.f:self.f.close()
        return {'files':self.files,'count':self.count}

class Extractor(osmium.SimpleHandler):
    def __init__(self, out):
        super().__init__()
        self.rows=Writer(out,'observations');self.bounds=Writer(out,'boundaries')
        self.counts=collections.Counter();self.factory=osmium.geom.GeoJSONFactory()
        self.error_examples=[]
        self.pending_relations={}
        self.pending_boundaries={}
        self.emitted_relations=set()
        self.emitted_boundaries=set()
    def emit(self,obj,kind,tags,coords=None,geometry=None):
        p=None; method=None; geom=None
        if geometry:
            geom=sg.shape(geometry);q=geom.representative_point();p=[q.x,q.y];method='surface_representative_point'
        elif coords:
            if len(coords)==1:p=coords[0];method='node'
            elif len(coords)>3 and coords[0]==coords[-1]:
                geom=sg.Polygon(coords)
                if not geom.is_valid:geom=geom.buffer(0)
                if not geom.is_empty:
                    q=geom.representative_point();p=[q.x,q.y];method='way_surface_representative_point'
            else:
                geom=sg.LineString(coords);q=geom.interpolate(.5,normalized=True);p=[q.x,q.y];method='way_midpoint'
        row={'id':f'osm:{kind}/{obj.orig_id() if kind=="relation" and hasattr(obj,"orig_id") else obj.id}',
             'tags':keep_tags(tags),'point':p,'point_method':method,
             'timestamp':obj.timestamp.isoformat()}
        # Retain the footprint internally to test whole-street/territory containment.
        if geom is not None:row['geometry']=sg.mapping(geom)
        self.rows.put(row);self.counts[kind]+=1
        if kind=='relation':self.emitted_relations.add(row['id'])
    def node(self,obj):
        tags=dict(obj.tags)
        if relevant(tags):
            self.emit(obj,'node',tags,[[obj.location.lon,obj.location.lat]] if obj.location.valid() else None)
    def way(self,obj):
        tags=dict(obj.tags)
        if not relevant(tags):return
        try:
            coords=[[n.lon,n.lat] for n in obj.nodes]
            self.emit(obj,'way',tags,coords)
        except (osmium.InvalidLocationError,ValueError) as exc:
            self.counts['observation_geometry_errors']+=1
            self.emit(obj,'way',tags)
    def relation(self,obj):
        tags=dict(obj.tags)
        if tags.get('boundary')=='administrative':
            self.pending_boundaries[obj.id]={'id':f'osm:relation/{obj.id}','tags':keep_tags(tags),'timestamp':obj.timestamp.isoformat(),'geometry':None,'geometry_status':'area_not_assembled'}
        if relevant(tags) and tags.get('type') in {'multipolygon','boundary'}:
            self.pending_relations[obj.id]={'id':f'osm:relation/{obj.id}','tags':keep_tags(tags),'point':None,'point_method':None,'timestamp':obj.timestamp.isoformat(),'geometry_status':'area_not_assembled'}
        if relevant(tags) and tags.get('type') not in {'multipolygon','boundary'}:
            self.emit(obj,'relation',tags)
    def area(self,obj):
        tags=dict(obj.tags)
        is_boundary=tags.get('boundary')=='administrative'
        is_observation=not obj.from_way() and relevant(tags)
        if not (is_boundary or is_observation):return
        try:
            geom=json.loads(self.factory.create_multipolygon(obj))
            if is_boundary:
                self.bounds.put({'id':f'osm:{"way" if obj.from_way() else "relation"}/{obj.orig_id()}',
                                 'tags':keep_tags(tags),'geometry':geom,'timestamp':obj.timestamp.isoformat()})
                self.emitted_boundaries.add(f'osm:{"way" if obj.from_way() else "relation"}/{obj.orig_id()}')
                if not obj.from_way():self.pending_boundaries.pop(obj.orig_id(),None)
            if is_observation:self.emit(obj,'relation',tags,geometry=geom)
            if is_observation:self.pending_relations.pop(obj.orig_id(),None)
        except Exception as exc:
            self.counts['area_geometry_errors']+=1
            if len(self.error_examples)<30:self.error_examples.append({'id':obj.orig_id(),'error':str(exc)})
            if is_observation:
                self.emit(obj,'relation',tags)
                self.pending_relations.pop(obj.orig_id(),None)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True)
    args=ap.parse_args();args.out.mkdir(parents=True,exist_ok=False)
    pbf=args.root/'Data/research/raw/osm_kazakhstan_pbf.bin'
    f=osmium.io.File(str(pbf),'pbf');r=osmium.io.Reader(f)
    header={k:r.header().get(k) for k in ['generator','osmosis_replication_timestamp','osmosis_replication_sequence_number']};r.close()
    h=Extractor(args.out);start=time.perf_counter()
    tag_filter=osmium.filter.KeyFilter('addr:street','addr:place','addr:housenumber','place','highway','landuse','residential','building','boundary','name')
    h.apply_file(f,locations=True,idx='flex_mem',filters=[tag_filter])
    for row in sorted(h.pending_relations.values(),key=lambda r:r['id']):
        if row['id'] in h.emitted_relations:continue
        h.rows.put(row);h.counts['relation']+=1;h.counts['relation_without_assembled_geometry']+=1
    for row in sorted(h.pending_boundaries.values(),key=lambda r:r['id']):
        if row['id'] in h.emitted_boundaries:continue
        h.bounds.put(row);h.counts['boundary_without_assembled_geometry']+=1
    result={'schema_version':'country-extraction-3','header':header,'pbf_sha256':hashlib.file_digest(pbf.open('rb'),'sha256').hexdigest(),
            'observations':h.rows.close(),'boundaries':h.bounds.close(),'counts':dict(h.counts),
            'errors':h.error_examples,'seconds':time.perf_counter()-start,'geographic_filter':None,
            'selection':'addr:street/place/housenumber; named highway; place settlement/suburb/neighbourhood/quarter/city_block; named residential areas/complexes'}
    (args.out/'extraction.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
