"""Small-process standard-library read benchmark for the new table."""
import argparse
import pathlib
import time
from db_common_v1 import digest, dumps, write_json
from runtime_index_v1 import connect
from runtime_territories_v1 import find_territory
from verify_release_v1 import peak_memory

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--runtime',type=pathlib.Path,required=True)
    ap.add_argument('--out',type=pathlib.Path,required=True);a=ap.parse_args()
    t=time.perf_counter();db=connect(a.runtime);opened=time.perf_counter()-t
    ids=[r[0] for r in db.execute('''SELECT g.id FROM territory_districts t JOIN geonims g ON g.gid=t.geonim
         WHERE t.area_m2 IS NOT NULL OR t.conflict=1 ORDER BY t.locality,t.geonim''')]
    sample=[ids[i*len(ids)//1000] for i in range(1000)]
    t=time.perf_counter();results=[find_territory(db,gid) for gid in sample];elapsed=time.perf_counter()-t
    assert len(results)==1000 and all(results)
    control=find_territory(db,'osm:way/265577783')
    assert control['district_id']=='kato:751310000'
    result={'runtime_sha256':digest(a.runtime),'bytes':a.runtime.stat().st_size,
        'open_seconds':opened,'territory_queries':1000,'territory_queries_with_json_decode_seconds':elapsed,
        'returned_conflicts':sum(r['conflict'] for r in results),'peak_process_working_set_bytes':peak_memory(),
        'stdlib_only':True,'cold_cache_guaranteed':False,'scope':'dictionary lookup, not parser/API',
        'control_aksay_3a':{'district_id':control['district_id'],'fraction':control['fraction'],'method':control['method']}}
    write_json(a.out,result);print(dumps(result),flush=True)

if __name__=='__main__':main()
