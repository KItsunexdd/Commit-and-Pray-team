"""Район вместо города и неполное покрытие одноимённых улиц домами."""
import unittest
from .parser import AddressParser
from .contracts import SLICE_FIELDS

class DistrictAndSparseHouses(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser();cls.addClassCleanup(cls.parser.close)

    def check(self,raw,**expected):
        e=self.parser.explain_address(raw)
        for field,value in expected.items():self.assertEqual(e['record'][field],value,(raw,field))
        for field in (*SLICE_FIELDS,'city'):
            for a,b in e['span_map'][field]:self.assertEqual(raw[a:b],e['record'][field])
        for i,a in enumerate(e['spans']):
            for b in e['spans'][i+1:]:
                self.assertTrue(a['field']==b['field'] or max(a['start'],b['start'])>=min(a['end'],b['end']))
        return e

    def test_separate_district_segments(self):
        cases=[('Есиль, Мәңгілік Ел, д. 28, кв45','Астана','Есиль','Мәңгілік Ел','28','45'),
               ('Есильский район, Мәңгілік Ел, д. 28, кв45','Астана','Есильский','Мәңгілік Ел','28','45'),
               ('Сарыарка, Жургенова 18','Астана','Сарыарка','Жургенова','18',None),
               ('Алмалы, Абая 10','Алматы','Алмалы','Абая','10',None),
               ('Ауэзовский, Абая 10','Алматы','Ауэзовский','Абая','10',None)]
        for raw,city,district,street,house,apartment in cases:
            e=self.check(raw,city=city,province=city,district=district,street_name=street,house=house,apartment=apartment)
            self.assertEqual(e['origin']['city'],'inferred');self.assertEqual(e['sources']['district'],'string')

    def test_explicit_city_wins(self):
        self.check('Астана, Мәңгілік Ел, д. 28, кв45',city='Астана',province='Астана',district=None,
                   street_name='Мәңгілік Ел',house='28',apartment='45')
        for raw in ('Астана, Есиль, Мәңгілік Ел 28','Есиль, Астана, Мәңгілік Ел 28',
                    'Астана, Есиль р-н, Мәңгілік Ел 28','Астана, Есиль ауданы, Мәңгілік Ел 28'):
            self.check(raw,city='Астана',district='Есиль',street_name='Мәңгілік Ел',house='28')
        self.check('г. Есиль, Мәңгілік Ел 28',city='Есиль',province='Акмолинская область',house='28')

    def test_locality_and_district_ambiguity(self):
        for raw in ('Есиль, Абая 10','Есиль, Несуществующая 10'):
            e=self.check(raw,city=None,province=None,house='10')
            self.assertIn('ambiguous_district_or_locality',[r['code'] for r in e['reasons']])
            self.assertLess(e['record']['confidence'],.6)

    def test_missing_houses_are_not_proof_of_city(self):
        e=self.check('Мәңгілік Ел, д. 28, кв45',city=None,province=None,district=None,
                     street_name='Мәңгілік Ел',house='28',apartment='45')
        self.assertIn('ambiguous_street_city',[r['code'] for r in e['reasons']])
        self.assertFalse(e['diagnostics']['reverse_locality']['coverage']['safe'])
        self.assertLess(e['record']['confidence'],.6)
        for raw in ('Kabanbay batyr 53','Astana city, Kabanbay batyr 53','Kurilskaya 9'):
            self.check(raw,city=None,province=None)

    def test_official_turan_restored(self):
        e=self.check('Туран 55/6 магазин береке 4подьезд 9этаж',city='Астана',province='Астана',district='Нұра',
                     street_name='Туран',house='55/6',entrance='4',floor='9',landmark='магазин береке')
        self.check('Астана, Туран 55/6',city='Астана',district='Нұра',house='55/6')

    def test_restored_locality_examples(self):
        self.check('Абай, Толе би 25',city='Абай',province='Карагандинская область',street_name='Толе би',house='25')
        self.check('Алатау, Валиханова 11',city='Алатау',street_name='Валиханова',house='11')
        self.check('Коянды, Сарыарка 117Б',city='Коянды',street_name='Сарыарка',house='117Б')

    def test_district_prefix_word_boundaries(self):
        for raw,district,street in (
            ('Астана, район Есиль Мәңгілік Ел д28 кв45','Есиль','Мәңгілік Ел'),
            ('Астана, районЕсильМәңгілікЕл д28 кв45','Есиль','МәңгілікЕл'),
            ('Астана, ЕсильМәңгілікЕл д28 кв45','Есиль','МәңгілікЕл')):
            self.check(raw,city='Астана',district=district,street_name=street,house='28',apartment='45')
        e=self.check('Астана, районАлмалы Абая 10',city='Астана',district=None,street_name='Алмалы Абая',house='10')
        self.assertIn('unconfirmed_district_prefix',[r['code'] for r in e['reasons']])
        self.check('Алматы, районАлмалы Абая 10',city='Алматы',district='Алмалы',street_name='Абая',house='10')
        self.check('Астана, Есильский район Мәңгілік Ел 28',district='Есильский',street_name='Мәңгілік Ел',house='28')
        self.check('Астана, Есиль р-н, Мәңгілік Ел 28',district='Есиль',street_name='Мәңгілік Ел',house='28')
        self.check('Алматы, Алмалинский район Абая 10',district='Алмалинский',street_name='Абая',house='10')
        self.check('Алматы, ул. Новый район 15',street_name='Новый район',house='15')

    def test_strong_locality_evidence_is_preserved(self):
        self.check('Шаймерден Косшыгулулы 21/1',city='Астана',province='Астана',district='Сарыарка',house='21/1')
        e=self.check('Бейнеу, Аспантай 55',city='Бейнеу',street_name='Аспантай',house='55')
        self.assertEqual(e['span_map']['city'],[[0,6]])

if __name__=='__main__':unittest.main()
