"""Город не поглощает улицу, район или детали после ориентира."""
import unittest
from .parser import AddressParser
from .administrative import city_options
from .contracts import SLICE_FIELDS

class CityScopeControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser();cls.addClassCleanup(cls.parser.close)

    def check(self,raw,expected):
        e=self.parser.explain_address(raw)
        for f,value in expected.items():self.assertEqual(e['record'][f],value,(raw,f))
        for s in e['spans']:
            if s['field'] in SLICE_FIELDS:self.assertEqual(e['record'][s['field']],raw[s['start']:s['end']])
        self.assertEqual(e['record'],self.parser.parse_address(raw))
        return e

    def test_official_turan_example(self):
        e=self.check('Туран 55/6 магазин береке 4подьезд 9этаж',dict(city='Астана',province='Астана',street_name='Туран',
            house='55/6',landmark='магазин береке',entrance='4',floor='9'))
        for field in ('street_name','house','landmark','entrance','floor'):
            self.assertEqual(e['origin'][field],'explicit');self.assertTrue(e['span_map'][field])
        self.assertEqual(e['diagnostics']['uncovered'],[])
        self.assertEqual(e['origin']['city'],'inferred')
        self.assertEqual(e['methods']['city'],'unique_street_house')

    def test_separate_or_marked_city_locks_unmarked_search(self):
        for city in ('Целиноград,','г Астана,','город Астана','Астана,'):
            for street in ('Кабанбай батыра','Кенесары хана','Достык'):
                with self.subTest(city=city,street=street):
                    self.check(city+' '+street+' 28 кв 11',dict(city='Целиноград' if city=='Целиноград,' else 'Астана',street_name=street,house='28',apartment='11'))
        self.check('Кенесары хана 28 кв 11, Астана',dict(city='Астана',street_name='Кенесары хана',house='28'))
        self.check('Алматы, Тараз 31 кв 5',dict(city='Алматы',street_name='Тараз',house='31'))

    def test_rural_names_require_markers(self):
        for name in ('Туран','Кабанбай','Сарыарка','Боралдай'):
            with self.subTest(name=name):
                self.check(name+' Зеленая 28 кв 11',dict(city=None,street_name=name+' Зеленая',house='28'))
                self.check('с. '+name+' ул. Зеленая 28',dict(city=name,street_name='Зеленая',house='28'))

    def test_multiword_and_kazakh_postfix_streets(self):
        for raw,city,name in (
            ('Кенесары хана 28 кв 11',None,'Кенесары хана'),
            ('Кабанбай батыра 28 кв 11',None,'Кабанбай батыра'),
            ('Актобе, Қабанбай батыр көшесі 24 үй','Актобе','Қабанбай батыр'),
            ('Астана, Кенесары көшесі 26 үй','Астана','Кенесары'),
            ('Кенесары көшесі 26 үй',None,'Кенесары'),
        ):
            with self.subTest(raw=raw):self.check(raw,dict(city=city,street_name=name,house='24' if '24' in raw else '26' if '26' in raw else '28'))

    def test_number_and_landmark_do_not_establish_city(self):
        self.check('Тараз 31/2 магазин Рассвет 2подьезд 7этаж',dict(city=None,province=None,
                   street_name='Тараз',house='31/2',landmark='магазин Рассвет',entrance='2',floor='7'))
        self.check('Актау 8 мкр 26 дом 12 кв',dict(city='Актау',street_name='8',house='26',apartment='12'))

    def test_postfix_short_district(self):
        for district in ('Алатауский','Есиль','Сарыарка','Медеуский'):
            with self.subTest(district=district):
                self.check(district+' р-н, ул. Зеленая 28',dict(district=district,street_name='Зеленая',house='28'))
        self.check('Астана, Есиль р-н, ул. Сауран 14',dict(city='Астана',district='Есиль',street_name='Сауран',house='14'))

    def test_landmark_does_not_hide_short_or_latin_details(self):
        for details in ('3под 6эт','3-подъезд 6 этаж','под 3 эт 6','entrance 3 floor 6'):
            raw='ул. Зеленая 28 аптека Рассвет '+details
            with self.subTest(details=details):
                e=self.check(raw,dict(street_name='Зеленая',house='28',landmark='аптека Рассвет',entrance='3',floor='6'))
                self.assertEqual(e['diagnostics']['uncovered'],[])

    def test_supported_urban_types_without_rural_promotion(self):
        class Ref:
            def __init__(self,kind):self.kind=kind
            def admins(self,name):
                return [dict(id='x',type=self.kind,name='Городок',city='Городок',province='Область')] if name=='Городок' else []
            def geonims(self,name):return []
        raw='Городок ул. Зеленая 28'
        for kind in ('city','town','settlement','rural_locality','small_settlement'):
            with self.subTest(kind=kind):self.assertEqual(bool(city_options(raw,raw,Ref(kind))),kind in ('city','town'))

if __name__=='__main__':unittest.main()
