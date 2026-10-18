"""Маркеры населённого пункта не входят в исходное написание имени."""
import unittest
from .parser import AddressParser
from .contracts import SLICE_FIELDS


class LocalityMarkerBoundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser()
        cls.addClassCleanup(cls.parser.close)

    def check(self,raw,**expected):
        e=self.parser.explain_address(raw)
        self.assertEqual(e['record']['raw_address'],raw)
        for field,value in expected.items():
            self.assertEqual(e['record'][field],value,(raw,field))
        for s in e['spans']:
            if s['field'] in (*SLICE_FIELDS,'city'):
                self.assertEqual(raw[s['start']:s['end']],e['record'][s['field']],(raw,s))
        return e

    def test_13_document_table(self):
        for raw,city,street,house in (
            ('г.Алматы, ул. Абая 10','Алматы','Абая','10'),
            ('г.Астана ул.Кенесары 40 кв 5','Астана','Кенесары','40'),
            ('с.Аксу, ул. Ленина 3','Аксу','Ленина','3'),
            ('пос.Боралдай, ул. Шевченко 7','Боралдай','Шевченко','7'),
            ('п.Отеген батыр, ул. Титова 15','Отеген батыр','Титова','15'),
            ('гор.Алматы, Абая 10','Алматы','Абая','10'),
            ('г.Нур-Султан, Кенесары 40','Нур-Султан','Кенесары','40'),
            ('Алматы г., Абая 10','Алматы','Абая','10'),
            ('г. Алматы','Алматы',None,None),
            ('г Алматы','Алматы',None,None),
        ):
            with self.subTest(raw=raw):
                e=self.check(raw,city=city,street_name=street,house=house)
                self.assertEqual(e['origin']['city'],'explicit')
                self.assertEqual(e['sources']['city'],'string')
                self.assertTrue(e['evidence']['city']['entity_ids'])
        self.check('г.Астана ул.Кенесары 40 кв 5',apartment='5')

    def test_prefix_suffix_marker_matrix(self):
        for name,markers in (
            ('Алматы',('г.','гор.','город','қ.','қаласы')),
            ('Боралдай',('с.','село','п.','пос.','пгт','ауыл','ауылы','кенті')),
        ):
            for marker in markers:
                gaps=('',' ','\u200b ') if marker.endswith('.') else (' ','\u200b ')
                for gap in gaps:
                    with self.subTest(name=name,marker=marker,gap=gap):
                        self.check(marker+gap+name+', ул. Луговая 18',city=name,street_name='Луговая',house='18')
                for sep in (', ',' '):
                    self.check(name+' '+marker+sep+'ул. Луговая 18',city=name,street_name='Луговая',house='18')
        for marker in ('п.','пос.','село','ауыл'):
            self.check('Отеген батыр '+marker+', ул. Луговая 18',city='Отеген батыр',province='Алматинская область',street_name='Луговая')

    def test_spelling_and_word_boundaries(self):
        for name in ('Нур-Султан','Целиноград','Алма-Ата','Өскемен','Almaty'):
            self.check('г.'+name+', ул. Луговая 18',city=name,street_name='Луговая',house='18')
            self.check(name+' г., ул. Луговая 18',city=name,street_name='Луговая',house='18')
        for name in ('Городская','Гагарина','Сельская','Посадская','Алматы'):
            self.check('ул. '+name+' 18',city=None,street_name=name,house='18')
        self.check('г.Өскемен/Усть-Каменогорск қаласы, ул. Луговая 18',city='Усть-Каменогорск',street_name='Луговая',house='18')
        self.check('Нұр-Сұлтан/Нур-Султан г., ул. Луговая 18',city='Нур-Султан',street_name='Луговая',house='18')

    def test_prefix_after_street_or_repeated_city(self):
        self.check('ул. Абая г. Алматы дом 8 кв 4',city='Алматы',street_name='Абая',house='8',apartment='4')
        for separator in (' ', '  ', '\t', '\n'):
            for city,marker in (('Караганда','г.'),('Боралдай','пос.')):
                self.check(marker+' '+city+separator+marker+city+separator+'ул. Луговая дом 18',
                           city=city,street_name='Луговая',living_area=None,house='18')


if __name__=='__main__':unittest.main()
