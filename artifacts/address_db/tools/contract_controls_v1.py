"""Small boundary and numeric controls, not training data or parser evaluation."""
import pathlib
import sys
sys.path.insert(0,str(pathlib.Path(__file__).parent/'vendor'))
from shapely.geometry import box,mapping
from db_common_v1 import *
from build_country_v5 import Geography,ROAD_TYPES
from neighbour_validation_v1 import prediction

def run():
    checks=[]
    def check(name,value):
        if not value:raise AssertionError(name)
        checks.append(name)
    check('letters_not_discarded',norm('Аксай 3')!=norm('Аксай 3а'))
    check('stops_are_not_streets','bus_stop' not in ROAD_TYPES and 'platform' not in ROAD_TYPES and 'milestone' not in ROAD_TYPES)
    check('dirty_house_refused',house_family('дом 90 офис 37') is None)
    check('fraction_same_family',house_family('12/3')==12)
    check('letter_same_family',house_family('12а')==12)
    check('range_not_a_single_family',house_family('42-43') is None)
    check('interior_nearest',prediction({2:{'A'},6:{'B'}},3,'interior')==(None,'singleton_parity'))
    check('interior_nearest_same_parity',prediction({2:{'A'},8:{'B'}},4,'interior')[0]=='A')
    check('tie_refused',prediction({2:{'A'},6:{'B'}},4,'interior')[0] is None)
    check('conflicting_nearest_family_refused',prediction({2:{'A','B'},8:{'A'}},4,'interior')[0] is None)
    check('edge_refused',prediction({2:{'A'},4:{'A'}},8,'interior')==(None,'edge'))
    check('hidden_family_removed',prediction({2:{'A'},4:{'B'},6:{'A'}},4,'interior')[0]=='A')
    def record(id,type,name,parent=None):
        return {'id':id,'type':type,'names':{'ru':name,'kk':None,'source_default':name},'parent_id':parent,'variants':[],'old_names':[]}
    admin={'country:KZ':record('country:KZ','country','Country')}
    for prefix,name in [('11','One'),('15','Two')]:
        aid='kato:'+prefix+'0000000';admin[aid]=record(aid,'province',name,'country:KZ')
    admin['kato:111010000']=record('kato:111010000','city','Twin','kato:110000000')
    admin['kato:151010000']=record('kato:151010000','city','Twin','kato:150000000')
    bounds=[{'id':'osm:relation/1','tags':{'name':'One','kato':'110000000','admin_level':'4'},'geometry':mapping(box(0,0,10,10))},
            {'id':'osm:relation/2','tags':{'name':'Two','kato':'150000000','admin_level':'4'},'geometry':mapping(box(10,0,20,10))},
            {'id':'osm:relation/3','tags':{'name':'Twin','kato':'111010000','admin_level':'8'},'geometry':mapping(box(1,1,4,4))}]
    g=Geography(admin,bounds);g.prepare_places();g.finish()
    check('same_name_scoped_by_region',g.resolve({'tags':{'addr:city':'Twin'},'point':[15,5]})[1]=='kato:151010000')
    check('outside_region_not_forced',g.resolve({'tags':{'addr:city':'Twin'},'point':[25,5]})[1] is None)
    check('no_nearest_fill',g.resolve({'tags':{},'point':[5,5]})[1] is None)
    check('cross_boundary_area_not_assigned_by_point',g.resolve({'tags':{},'point':[2,2],'geometry':mapping(box(2,2,6,6))},whole=True)[1] is None)
    check('point_house_can_use_containment',g.resolve({'tags':{},'point':[2,2]})[1]=='kato:111010000')
    g.add_place({'id':'osm:node/99','tags':{'name':'Twin','place':'city','kato':'151010000'},'point':[2,2]})
    check('reused_kato_code_not_trusted_over_region',g.place_audit[-1]['locality_id']=='kato:111010000' and g.place_audit[-1]['kato_tag_status']=='rejected_region_mismatch')
    return {'passed':True,'controls':checks,'count':len(checks),'scope':'synthetic algorithm controls only; not customer addresses'}

if __name__=='__main__':
    import argparse,json
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=pathlib.Path,required=True);a=ap.parse_args();r=run();write_json(a.out,r);print(json.dumps(r,ensure_ascii=False))
