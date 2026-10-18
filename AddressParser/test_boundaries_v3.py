"""Границы города, сокращённые детали и проверенный допуск территорий."""
import json
import unittest
from unittest.mock import patch
import sqlite3
from .parser import AddressParser
from .contracts import SLICE_FIELDS
from .build_uniform import loo_counts
from . import test_regressions
from .uniform import is_territory
from .territories import TerritoryDistricts

class CityBoundaryControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser();cls.addClassCleanup(cls.parser.close)

    def check(self,raw,expected):
        e=self.parser.explain_address(raw)
        for field,value in expected.items():self.assertEqual(e['record'][field],value,(raw,field))
        for s in e['spans']:
            if s['field'] in SLICE_FIELDS:self.assertEqual(e['record'][s['field']],raw[s['start']:s['end']])
        if expected.get('city'):
            self.assertEqual(e['origin']['city'],'explicit');self.assertEqual(e['sources']['city'],'string')

    def test_unmarked_prefix_and_segment(self):
        cases=[
            ('Тараз Толе би 23б кв 17',dict(city='Тараз',street_name='Толе би',house='23б',apartment='17')),
            ('Кокшетау мкр Восточный 5, дом 12',dict(city='Кокшетау',street_name='Восточный 5',house='12')),
            ('Актау 9 мкр 17 дом 25 кв',dict(city='Актау',street_name='9',house='17',apartment='25')),
            ('дом 17, Тараз ул. Толе би кв 4',dict(city='Тараз',street_name='Толе би',house='17')),
            ('Алматы Медеуский район Достык 19',dict(city='Алматы',district='Медеуский',street_name='Достык',house='19')),
            ('Алматы район Алатауский ул. Саялы 16',dict(city='Алматы',district='Алатауский',street_name='Саялы')),
        ]
        for raw,expected in cases:
            with self.subTest(raw=raw):self.check(raw,expected)

    def test_project_aliases_and_multiword_names(self):
        for name,city in [('Өскемен','Өскемен'),('Целиноград','Целиноград'),('Ақтөбе','Ақтөбе'),
                          ('Қонаев','Қонаев'),('Усть-Каменогорск','Усть-Каменогорск')]:
            with self.subTest(name=name):self.check(name+' ул. Солнечная 29',dict(city=city,street_name='Солнечная',house='29'))

    def test_city_prefix_across_twenty_cities(self):
        cities=('Караганда','Тараз','Кокшетау','Актау','Павлодар','Алматы','Астана','Шымкент','Семей',
                'Актобе','Конаев','Талдыкорган','Костанай','Петропавловск','Уральск','Атырау',
                'Кызылорда','Туркестан','Темиртау','Балхаш')
        for city in cities:
            for tail in ('ул. Солнечная 29 кв 7','Солнечная 29 кв 7'):
                with self.subTest(city=city,tail=tail):
                    self.check(city+' '+tail,dict(city=city,street_name='Солнечная',house='29',apartment='7'))

    def test_short_markers_and_hyphen(self):
        self.check('Караганда ул. Ермекова д 27 кв 9, 2 под, 5 эт',
                   dict(city='Караганда',street_name='Ермекова',house='27',apartment='9',entrance='2',floor='5'))
        self.check('г Павлодар ул Ломова 21, 3-подъезд, 4 эт',
                   dict(city='Павлодар',street_name='Ломова',house='21',entrance='3',floor='4'))
        self.check('г Тараз ул Толе би д 29, под 3, эт -1',dict(city='Тараз',house='29',entrance='3',floor='-1'))

    def test_street_homonyms_and_letter_g(self):
        for raw,name in [('ул. Тараз 11','Тараз'),('проспект Актау 21','Актау'),('Тараз улица 11','Тараз'),
                         ('Абая 17 кв 2','Абая'),('Достык 19 кв 3','Достык'),
                         ('Шар қаласы, сектор Г көшесі, 19 үй','сектор Г')]:
            with self.subTest(raw=raw):self.check(raw,dict(street_name=name,city='Шар' if 'қаласы' in raw else None))
        self.check('Павлодар, ул. Семей 11',dict(city='Павлодар',street_name='Семей'))

class TerritoryThresholdControls(unittest.TestCase):
    fixture=test_regressions.UniformRegressions.fixture

    def test_two_is_only_for_validated_territories(self):
        u=self.fixture(n=2)
        u.territory_support=True
        u.db.executescript("CREATE TABLE territory_cities(id,enabled);INSERT INTO territory_cities VALUES ('c',1);")
        ids=[dict(id=g,role='address_area') for g in ('g1','g2')]
        district,proof=u.district('c',ids)
        self.assertEqual(district,'d');self.assertEqual(proof['minimum_houses'],2)
        self.assertIsNone(u.district('c',[dict(id=g,role='street') for g in ('g1','g2')])[0])
        u.db.execute('UPDATE territory_cities SET enabled=0')
        self.assertIsNone(u.district('c',ids)[0])

    def test_classification_comes_from_reference(self):
        self.assertTrue(is_territory(dict(role='address_area')))
        self.assertTrue(is_territory(dict(role='street',names_json=json.dumps({'source_default':'Солнечный микрорайон'}))))
        self.assertFalse(is_territory(dict(role='street',names_json=json.dumps({'ru':'Солнечная улица'}))))

    def test_two_threshold_still_counts_mixed_groups(self):
        counts=loo_counts([(('a',),False),(('a',),False),(('b',),False)],2)
        self.assertEqual((counts['given'],counts['wrong']),(1,1))
        self.assertEqual(loo_counts([(('a',),False)]*2,2)['given'],0)

class ContourControls(unittest.TestCase):
    def test_fraction_conflict_alias_and_city(self):
        reader=TerritoryDistricts.__new__(TerritoryDistricts)
        reader.available=True
        reader.db=sqlite3.connect(':memory:');reader.db.row_factory=sqlite3.Row;self.addCleanup(reader.db.close)
        reader.db.executescript("CREATE TABLE geonims(gid,id);CREATE TABLE admin(aid,id);"
            "INSERT INTO geonims VALUES (1,'g'),(2,'g2');INSERT INTO admin VALUES (1,'c'),(2,'d'),(3,'e');"
            'CREATE TABLE territory_districts(geonim,locality,district,method,fraction,status,conflict,area_m2,covered_fraction,candidates_json,contours_json);')
        reader.db.execute('INSERT INTO territory_districts VALUES (?,?,?,?,?,?,?,?,?,?,?)',(1,1,2,'territory_within_district',.96,'assigned',0,100,.99,'[]','[]'))
        geos=[dict(id='g',role='address_area')]
        self.assertEqual(reader.district('c',geos)[0],'d')
        self.assertTrue(reader.district('c',geos+[dict(id='road',role='street')])[1]['blocking'])
        self.assertIsNone(reader.district('other',geos)[0])
        reader.db.execute('UPDATE territory_districts SET fraction=.94')
        self.assertIsNone(reader.district('c',geos)[0])
        reader.db.execute('UPDATE territory_districts SET fraction=.96,conflict=1')
        self.assertTrue(reader.district('c',geos)[1]['blocking'])
        reader.db.execute('UPDATE territory_districts SET conflict=0')
        reader.db.execute('INSERT INTO territory_districts VALUES (?,?,?,?,?,?,?,?,?,?,?)',(2,1,3,'territory_within_district',.99,'assigned',0,100,.99,'[]','[]'))
        self.assertTrue(reader.district('c',geos+[dict(id='g2',role='address_area')])[1]['blocking'])

    def test_exact_house_wins_and_disagreeing_inferences_abstain(self):
        p=AddressParser();self.addCleanup(p.close)
        g=dict(id='g',role='address_area',type_json='{}',type_conflict=0)
        geonims=lambda name,city_id=None:[g] if name=='Солнечный' else []
        raw='Алматы мкр Солнечный дом 29'
        proof=dict(entity_ids=['kato:751310000'],house_count=2)
        with patch.object(p.reference,'geonims',side_effect=geonims), patch.object(p.reference,'house',
                return_value=dict(district_ids=['kato:751310000'],conflict=False)), patch.object(p.territories,'district') as contour:
            e=p.explain_address(raw)
            self.assertEqual(e['methods']['district'],'exact_house');contour.assert_not_called()
        with patch.object(p.reference,'geonims',side_effect=geonims), patch.object(p.reference,'house',return_value=None), \
             patch.object(p.uniform,'district',return_value=('kato:751310000',proof)), \
             patch.object(p.territories,'district',return_value=('kato:751710000',{})):
            e=p.explain_address(raw)
            self.assertIsNone(e['record']['district']);self.assertEqual(e['origin']['district'],'absent')
            self.assertTrue(any(r['code']=='district_methods_disagree' for r in e['reasons']))

    def test_published_sample_has_additional_contour_evidence(self):
        p=AddressParser();self.addCleanup(p.close)
        e=p.explain_address('Алматы, мкр Аксай 3а, дом 61')
        self.assertEqual(e['record']['district'],'Ауэзовский')
        self.assertEqual(e['methods']['district'],'territory_within_district')
        self.assertGreaterEqual(e['evidence']['district']['minimum_fraction'],.95)
        self.assertEqual(e['evidence']['district']['corroborating_uniform']['house_count'],2)

if __name__=='__main__':unittest.main()
