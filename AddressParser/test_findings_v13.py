"""Непересекающиеся поля, сокращение корпуса и город на границе слов."""
import unittest
from .parser import AddressParser
from .contracts import SLICE_FIELDS

class ReviewFollowup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser();cls.addClassCleanup(cls.parser.close)

    def check(self,raw,**expected):
        e=self.parser.explain_address(raw)
        for field,value in expected.items():self.assertEqual(e['record'][field],value,(raw,field,e))
        for i,a in enumerate(e['spans']):
            if a['field'] in (*SLICE_FIELDS,'city'):
                self.assertEqual(raw[a['start']:a['end']],e['record'][a['field']])
            for b in e['spans'][i+1:]:
                if a['field']!=b['field']:
                    self.assertFalse(max(a['start'],b['start'])<min(a['end'],b['end']),(raw,a,b))
        return e

    def test_consumed_city_does_not_return_inside_street(self):
        e=self.check('АбаяАлматы 10',city='Алматы',street_name='Абая',house='10')
        self.assertEqual(e['span_map']['city'],[[4,10]])
        self.assertEqual(e['span_map']['street_name'],[[0,4]])
        self.check('АбаяАлматы 10 кв 5',city='Алматы',street_name='Абая',house='10',apartment='5')
        for gap in ('  ','\t','\n'):
            self.check(gap.join(['г. Шымкент','Луговая ул','27 дом','12 кв','2 подъезд','3 этаж']),
                       city='Шымкент',street_name='Луговая',street_type='улица',house='27',apartment='12',entrance='2',floor='3')

    def test_separate_k_is_ambiguous_without_apartment_marker(self):
        for raw,street,house in [('Косшыгулулы 21/1, к 21','Косшыгулулы','21/1'),
                                  ('Абая 10, к 5','Абая','10'),('Абая 10 к 5','Абая','10'),
                                  ('Алматы, ул. Абая, д. 10, к 5, подъезд 2, этаж 3','Абая','10')]:
            e=self.check(raw,street_name=street,house=house,apartment=None)
            reason=next(r for r in e['reasons'] if r['code']=='ambiguous_k_marker')
            proof=reason['evidence']
            self.assertEqual(raw[proof['start']:proof['end']],proof['text'])
            self.assertLess(e['record']['confidence'],.6)
            self.assertEqual(e['diagnostics']['raw_rating'],e['record']['confidence'])

    def test_unambiguous_corpus_keeps_continuous_raw_value(self):
        for raw,house,apartment in [('Абая 10к5','10к5',None),('Абая 10, корп 2, кв 5','10, корп 2','5'),
                                    ('Абая 10, к 2, кв 5','10, к 2','5'),('Абая 10 к 2 кв 5','10 к 2','5'),
                                    ('Алматы, ул. Абая, дом 10, к 2, кв 5','10, к 2','5'),
                                    ('Абая 10 корпус Б, кв 5','10 корпус Б','5')]:
            e=self.check(raw,street_name='Абая',house=house,apartment=apartment)
            self.assertNotIn('ambiguous_k_marker',[r['code'] for r in e['reasons']])

    def test_city_prefix_uses_only_word_boundaries(self):
        for raw in ('АстанаКосшыгулулы 21/1','г.АстанаКосшыгулулы 21/1'):
            self.check(raw,city='Астана',street_name='Косшыгулулы',house='21/1')
        self.check('АлматыАбая 10 кв 5',city='Алматы',street_name='Абая',house='10',apartment='5')
        self.check('ШымкентТаукехана 5',city='Шымкент',street_name='Таукехана',house='5')
        self.check('Аксугум, Вагонная 170',city=None,street_name='Вагонная',house='170')
        self.check('с. Аксугум, Вагонная 170',city='Аксугум',street_name='Вагонная',house='170')
        self.check('Петропавловск, ул. Мира 10',city='Петропавловск',street_name='Мира',house='10')
        self.check('Сарыагаш, ул. Мира 10',city='Сарыагаш',street_name='Мира',house='10')
        self.check('Алматы, ул. АстанаКосшыгулулы 21/1',city='Алматы',street_name='АстанаКосшыгулулы',house='21/1')
        for raw in ('астанакосшыгулулы 21/1','АСТАНАКОСШЫГУЛУЛЫ 21/1'):
            self.check(raw,city=None,street_name=raw.split()[0],house='21/1')

    def test_multiple_reverse_cities_explain_uncertainty(self):
        e=self.check('Есет Котибарулы 21',city=None,province=None,street_name='Есет Котибарулы',house='21')
        reason=next(r for r in e['reasons'] if r['code']=='reverse_locality_ambiguous')
        self.assertGreater(reason['evidence']['candidate_count'],1)
        self.assertLess(e['record']['confidence'],.6)

    def test_generated_latin_is_not_proof_of_unique_city(self):
        for raw,street,house in [('Kabanbay batyr 53','Kabanbay batyr','53'),
                                 ('Kurilskaya 9','Kurilskaya','9'),
                                 ('Astana city, Kabanbay batyr 53','Kabanbay batyr','53'),
                                 ('Almaty city, Abay 10','Abay','10')]:
            e=self.check(raw,city=None,province=None,street_name=street,house=house)
            self.assertIn('ambiguous_street_city',[r['code'] for r in e['reasons']])
            self.assertLess(e['record']['confidence'],.6)
            self.assertNotIn('city',e['sources'])

    def test_unrecognized_city_blocks_reverse_inference(self):
        for prefix in ('Almaty city','Shymkent city','Бейнеу'):
            raw=prefix+', Туран 55/6'
            e=self.check(raw,city=None,province=None,street_name='Туран',house='55/6')
            reason=next(r for r in e['reasons'] if r['code']=='ambiguous_street_city')
            proof=next(b for b in reason['evidence']['blocked'] if b['cause']=='unrecognized_locality')
            self.assertEqual(raw[proof['start']:proof['end']],prefix)
            self.assertLess(e['record']['confidence'],.6)

    def test_city_guard_preserves_supported_cyrillic_reverse(self):
        for raw in ('Шаймерден Косшыгулулы 21/1','Шаймердена Косшыгулулы 21/1'):
            e=self.check(raw,city='Астана',province='Астана',district='Сарыарка',house='21/1')
            self.assertEqual(e['methods']['city'],'unique_street_house')
        self.check('Туран 55/6 магазин береке 4подьезд 9этаж',city='Астана',district='Нұра',
                   street_name='Туран',house='55/6',entrance='4',floor='9',landmark='магазин береке')
        self.check('Кабанбай батыр 53',city=None,street_name='Кабанбай батыр',house='53')
        self.check('Ул. Курильская 9',city=None,street_name='Курильская',house='9')

    def test_city_guard_does_not_replace_explicit_city(self):
        for prefix,city in [('Astana','Astana'),('Almaty','Almaty'),('Нур-Султан','Нур-Султан')]:
            self.check(prefix+', Kabanbay batyr 53',city=city,street_name='Kabanbay batyr',house='53')
        self.check('Алматы, ул. АстанаКосшыгулулы 21/1',city='Алматы',street_name='АстанаКосшыгулулы',house='21/1')

    def test_same_locality_fragment_corroborates_unique_house(self):
        for city,address in [('Бейнеу','Аспантай 55'),('Жосалы','Жаназарова 29'),
                             ('Аккемер','Айтеке Би Байбекулы 59'),('Меновное','Жунусова 31'),
                             ('Бейне','Аспантай 55')]:
            e=self.check(city+', '+address,city=city)
            self.assertEqual(e['span_map']['city'],[[0,len(city)]])
            self.assertEqual(e['sources']['city'],'string')
            self.assertEqual(e['methods']['city'],'unique_street_house')
            self.assertNotIn('ambiguous_street_city',[r['code'] for r in e['reasons']])
        for prefix,city in [('Astana city','Astana'),('city of Astana','Astana'),
                            ('Астана сити','Астана'),('Астна','Астна'),('Нур-Султн','Нур-Султн')]:
            self.check(prefix+', Туран 55/6',city=city,province='Астана',house='55/6')
        self.check('Жосалы, Абая 12',city=None,house='12')
        for raw in ('Kabanbay batyr 53','Astana city, Kabanbay batyr 53'):
            self.check(raw,city=None,province=None,street_name='Kabanbay batyr',house='53')

    def test_settlement_word_inside_street_after_city(self):
        self.check('Семей, Правый восточный поселок 3665',city='Семей',province='Абайская область',
                   street_name='Правый восточный поселок',house='3665')
        self.check('Семей қаласы, Правый восточный поселок көшесі, 2446 үй, 01 пәтер',city='Семей',
                   street_name='Правый восточный поселок',house='2446',apartment='01')
        self.check('пос. Боралдай, ул. Шевченко 7',city='Боралдай',street_name='Шевченко',house='7')

    def test_uncertain_corpus_and_parentheses_do_not_infer_district(self):
        e=self.check('Актобе, Сактагана Баишева 7А к3',city='Актобе',district=None,
                     street_name='Сактагана Баишева',house='7А',apartment=None)
        self.assertIn('ambiguous_k_marker',[r['code'] for r in e['reasons']])
        self.check('г. Алматы, квартал Д1 (Алатау, Алма-Арасан), дом 23',city='Алматы',district=None,
                   street_type='квартал',street_name='Д1 (Алатау, Алма-Арасан)',house='23')

if __name__=='__main__':unittest.main()
