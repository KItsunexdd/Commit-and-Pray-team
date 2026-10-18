"""Город после дома, границы склеенных слов и обратный справочный поиск."""
import unittest
from .parser import AddressParser,tokens
from .contracts import SLICE_FIELDS,spaced_words

class TailAndReverse(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser();cls.addClassCleanup(cls.parser.close)

    def check(self,raw,**expected):
        e=self.parser.explain_address(raw)
        for f,v in expected.items():self.assertEqual(e['record'][f],v,(raw,f))
        for s in e['spans']:
            if s['field'] in (*SLICE_FIELDS,'city'):
                self.assertEqual(raw[s['start']:s['end']],e['record'][s['field']])
        self.assertEqual(e['record']['raw_address'],raw)
        return e

    def test_city_after_house(self):
        for tail in ('Сырыарка Астана','СырыаркаАстана'):
            e=self.check('Улица Шаймерден Косшыгулулы, 20 '+tail,city='Астана',province='Астана',
                         street_name='Шаймерден Косшыгулулы',house='20',district='Сырыарка')
            self.assertEqual(e['origin']['city'],'explicit')
            self.assertEqual(e['sources']['district'],'string')
        self.check('ул. Луговая 18 Сарыарка Астана',city='Астана',district='Сарыарка',street_name='Луговая',house='18')
        self.check('ул. Луговая, 18 Усть-Каменогорск',city='Усть-Каменогорск',street_name='Луговая',house='18')
        self.check('ул. Астана 5',city=None,street_name='Астана',house='5')
        self.check('Атырау — Уральск',city='Атырау',street_name='Уральск',house=None)
        self.check('ул. Луговая, кв 20 Астана',house=None)

    def test_word_boundaries_keep_house_letters(self):
        self.assertEqual(spaced_words('СырыаркаАстана'),'Сырыарка Астана')
        self.assertEqual(spaced_words('ШаймерденКосшыгулулы'),'Шаймерден Косшыгулулы')
        for value in ('44А','12Б','СырыаркаА','А'):
            self.assertEqual(spaced_words(value),value)
        raw='СырыаркаАстана 44А'
        self.assertEqual([t['text'] for t in tokens(raw) if t['text'].strip()],['Сырыарка','Астана','44','А'])
        for house in ('44А','12Б'):
            self.check('Алматы, ул. Луговая '+house,house=house,street_name='Луговая')

    def test_unique_street_and_house(self):
        for street,house in (('Туран','55/6'),('Шаймерден Косшыгулулы','20'),
                             ('Шаймердена Косшыгулулы','20'),('ШаймерденКосшыгулулы','20')):
            e=self.check(street+' '+house,street_name=street,house=house,city='Астана',province='Астана')
            for f in ('city','province'):
                self.assertEqual(e['origin'][f],'inferred');self.assertEqual(e['sources'][f],'dictionary')
                self.assertEqual(e['span_map'][f],[])
                self.assertEqual(e['methods'][f],'unique_street_house')
                self.assertEqual(e['evidence'][f]['candidate_count'],1)
        e=self.check('Абая 12',city=None,province=None,street_name='Абая',house='12')
        self.assertEqual(e['diagnostics']['reverse_locality']['candidate_count'],121)
        e=self.check('Неизвестнаяпроверочная 987654',city=None,province=None)
        self.assertEqual(e['diagnostics']['reverse_locality']['candidate_count'],0)

    def test_number_before_unrecognized_tail(self):
        self.check('Улица Шаймерден Косшыгулулы, 20 Сырыарка',house='20',street_name='Шаймерден Косшыгулулы',district='Сырыарка')
        e=self.check('Улица Шаймерден Косшыгулулы, 20 Нераспознанныйрайон',house='20',district=None)
        self.assertEqual(e['diagnostics']['uncovered'][0]['text'],'Нераспознанныйрайон')
        ordinary=self.parser.parse_address('Улица Шаймерден Косшыгулулы, 20')
        self.assertLess(e['record']['confidence'],ordinary['confidence'])
        self.check('Алматы, ул. Луговая, 20 Сырыарка',city='Алматы',street_name='Луговая',house='20',district=None)

if __name__=='__main__':unittest.main()
