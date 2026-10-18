"""Регрессии порядка частей, языковых маркеров и консервативного обогащения."""
import itertools
import json
import sqlite3
from types import SimpleNamespace
import unittest
from .parser import AddressParser
from .contracts import ADDRESS_FIELDS,SLICE_FIELDS,validate_record
from .reference import ROOT
from .build_uniform import loo_counts
from .uniform import UniformDistricts

class BoundaryRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser();cls.addClassCleanup(cls.parser.close)

    def test_marker_orders(self):
        cases=[
            ('  г. Акколь  Пристанционная  дом 76  кв. 153 ',dict(city='Акколь',street_name='Пристанционная',house='76',apartment='153')),
            ('ул. Абая г. Алматы дом 8 кв 4',dict(city='Алматы',street_name='Абая',house='8',apartment='4')),
            ('дом 8 город Алматы ул. Абая',dict(city='Алматы',street_name='Абая',house='8')),
            ('район Сарайшық ул. Абая дом 8',dict(city='Астана',district='Сарайшық',street_name='Абая')),
            ('Турксибский район, Рыбинский переулок, дом 4',dict(city='Алматы',province='Алматы',district='Турксибский')),
            ('Яблочный ул ., 102 дом',dict(street_name='Яблочный',street_type='улица',house='102')),
            ('st Булавина, house 161, apt 76, entrance 5, floor 6',dict(street_name='Булавина',apartment='76',entrance='5',floor='6')),
            ('ave Булавина house 161 flat 76',dict(street_type='проспект',street_name='Булавина',apartment='76')),
            ('проспектЦикличный, 143дом22кв.6подъезд11этаж',dict(street_name='Цикличный',house='143',apartment='22',entrance='6',floor='11')),
            ('прЗеленый Лог-3, 169дом109кв.8подъезд20этаж',dict(street_name='Зеленый Лог-3',house='169')),
            ('бульвар ПРИШАХТИНСКАЯ дом 122',dict(street_name='ПРИШАХТИНСКАЯ')),
            ('г. Аркалык ЖК 28 пер. Тополиная дом 168',dict(city='Аркалык',living_area='28',street_name='Тополиная')),
            ('с. Тентек прВагонная 157дом173кв.5подъезд-1этаж',dict(city='Тентек',street_name='Вагонная',floor='-1')),
            ('с. им.Б.Момышулы ул. Абая дом 4',dict(city='им.Б.Момышулы',street_name='Абая')),
            ('Аяпберген 1 ауылы, Вагонное Депо даңғылы, 105 үй',dict(city='Аяпберген 1',street_name='Вагонное Депо',house='105')),
            ('г. Текели ул. Ландыш дом 205ә',dict(house='205ә')),
        ]
        for raw,expected in cases:
            with self.subTest(raw=raw):
                result=self.parser.parse_address(raw)
                for field,value in expected.items():self.assertEqual(result[field],value,field)

    def test_rural_markers(self):
        for marker in ('с.','село','пос.','п.','посёлок','ауыл','аул'):
            with self.subTest(marker=marker):
                result=self.parser.parse_address(marker+' Енбекши ул. Абая дом 4')
                self.assertEqual(result['city'],'Енбекши');self.assertEqual(result['house'],'4')

    def test_city_from_district_provenance_and_conflict(self):
        e=self.parser.explain_address('Турксибского района, Рыбинский переулок, дом 4')
        for f in ('city','province'):
            self.assertEqual(e['origin'][f],'inferred');self.assertEqual(e['methods'][f],'district_parent')
            self.assertEqual(e['sources'][f],'dictionary');self.assertFalse(e['span_map'][f]);self.assertTrue(e['evidence'][f])
        self.assertIsNone(self.parser.parse_address('район Алматы, ул. Абая 8')['city'])

    def test_sample_territory_evidence(self):
        raw='город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70'
        e=self.parser.explain_address(raw)
        self.assertEqual(e['record']['district'],'Ауэзовский')
        self.assertEqual(e['methods']['district'],'territory_within_district')
        self.assertEqual(e['origin']['district'],'inferred')
        self.assertEqual(e['evidence']['district']['corroborating_uniform']['house_count'],2)
        self.assertEqual(e['evidence']['district']['corroborating_uniform']['minimum_houses'],2)

    def test_all_train_contracts(self):
        path=ROOT/'datasets/train/train.jsonl'
        for line in path.read_text(encoding='utf-8').splitlines():
            raw=json.loads(line)['raw_address'];e=self.parser.explain_address(raw);record=e['record']
            validate_record(record);self.assertEqual(record,self.parser.parse_address(raw))
            for span in e['spans']:
                f,a,b=span['field'],span['start'],span['end']
                self.assertTrue(0<=a<b<=len(raw))
                if f in SLICE_FIELDS:self.assertEqual(record[f],raw[a:b])
            for f in ADDRESS_FIELDS:
                if e['origin'][f]=='inferred':
                    self.assertTrue(e['methods'][f]);self.assertTrue(e['evidence'].get(f));self.assertFalse(e['span_map'][f])

class UniformRegressions(unittest.TestCase):
    def test_holdout_does_not_look_at_hidden_label(self):
        # Если исключить единственный дом другого района, правило ошибётся.
        counts=loo_counts([(('a',),False)]*3+[(('b',),False)])
        self.assertEqual(counts['given'],1);self.assertEqual(counts['wrong'],1)
        self.assertEqual(loo_counts([(('a',),False)]*3)['given'],0)

    def test_aggregate_equals_explicit_leave_one_out(self):
        for values in itertools.product(('a','b',None),repeat=5):
            houses=[((v,) if v else (),False) for v in values]
            given=correct=0
            for i,(truth,bad) in enumerate(houses):
                if len(truth)!=1:continue
                remaining=houses[:i]+houses[i+1:]
                labels={d for ds,bad in remaining for d in ds}
                if all(len(ds)==1 and not bad for ds,bad in remaining) and len(labels)==1:
                    given+=1;correct+=next(iter(labels))==truth[0]
            result=loo_counts(houses)
            self.assertEqual((result['given'],result['correct']),(given,correct))

    def fixture(self,n=3,other_district='d',missing=0,enabled=1):
        u=UniformDistricts.__new__(UniformDistricts)
        u.policy={'minimum_houses':3};u.db=sqlite3.connect(':memory:');u.db.row_factory=sqlite3.Row
        u.db.executescript('CREATE TABLE cities(id,enabled);CREATE TABLE geonims(city,id,houses,missing,conflicts,district);')
        u.db.execute('INSERT INTO cities VALUES (?,?)',('c',enabled))
        u.db.executemany('INSERT INTO geonims VALUES (?,?,?,?,?,?)',[('c','g1',n,missing,0,'d'),('c','g2',n,0,0,other_district)])
        source=sqlite3.connect(':memory:')
        source.executescript('CREATE TABLE houses(locality,geonim,number,corpus,flags);CREATE TABLE geonims(gid,id);CREATE TABLE admin(aid,id);'
                            "INSERT INTO admin VALUES (1,'c');INSERT INTO geonims VALUES (1,'g1'),(2,'g2');")
        source.executemany('INSERT INTO houses VALUES (?,?,?,?,?)',[(1,g,str(i),'0',1) for g in (1,2) for i in range(n)])
        u.reference=SimpleNamespace(db=source)
        self.addCleanup(u.db.close);self.addCleanup(source.close)
        return u

    def test_alias_dedup_and_minimum(self):
        ids=[{'id':'g1'},{'id':'g2'}]
        district,proof=self.fixture().district('c',ids)
        self.assertEqual(district,'d');self.assertEqual(proof['house_count'],3)
        self.assertIsNone(self.fixture(n=2).district('c',ids)[0])

    def test_conflict_missing_and_disabled_city(self):
        ids=[{'id':'g1'},{'id':'g2'}]
        for kwargs in ({'other_district':'e'},{'missing':1},{'enabled':0}):
            self.assertIsNone(self.fixture(**kwargs).district('c',ids)[0])

if __name__=='__main__':unittest.main()
