"""Инициалы улицы и односимвольные маркеры населённых пунктов."""
import unittest
from .parser import AddressParser
from .contracts import SLICE_FIELDS


class StreetInitials(unittest.TestCase):
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

    def test_document_initials_table(self):
        for raw,city,street,house,apartment in (
            ('Астана, С.Сейфуллина 31, кв 4','Астана','С.Сейфуллина','31','4'),
            ('Алматы, ул. Г.Муратбаева 87','Алматы','Г.Муратбаева','87',None),
            ('г. Кокшетау, ул. С.Сейфуллина, дом 12','Кокшетау','С.Сейфуллина','12',None),
            ('Алматы, ул. Г. Мусрепова 5','Алматы','Г. Мусрепова','5',None),
            ('Астана, ул. С. Сейфуллина 10, кв 3','Астана','С. Сейфуллина','10','3'),
            ('Шымкент, ул. П. Морозова 4','Шымкент','П. Морозова','4',None),
            ('Алматы, пр. Г. Жукова 3','Алматы','Г. Жукова','3',None),
            ('Алматы, С. Муканова 120, кв 9','Алматы','С. Муканова','120','9'),
        ):
            with self.subTest(raw=raw):self.check(raw,city=city,street_name=street,house=house,apartment=apartment)

    def test_document_preservation_table(self):
        for raw,city,street,house in (
            ('г.Алматы, ул. Абая 10','Алматы','Абая','10'),
            ('Г.Алматы, ул. Абая 10','Алматы','Абая','10'),
            ('Г. Астана, ул. Кенесары 40','Астана','Кенесары','40'),
            ('с.Аксу, ул. Ленина 3','Аксу','Ленина','3'),
            ('п.Отеген батыр, ул. Титова 15','Отеген батыр','Титова','15'),
            ('Алматы, ул. К. Сатпаева 22','Алматы','К. Сатпаева','22'),
        ):
            with self.subTest(raw=raw):self.check(raw,city=city,street_name=street,house=house)
        e=self.check('город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70',
                     city='Алматы',province='Алматы',district='Ауэзовский',
                     street_type='микрорайон',street_name='Аксай 3а',house='59',apartment='70')
        self.assertEqual(e['methods']['district'],'territory_within_district')

    def test_initial_context_and_locality_boundaries(self):
        for gap in ('',' ','\u200b '):
            for typ,initial,name in (('улица','С.','Сейфуллина'),('проспект','Г.','Жукова'),
                                     ('пер.','П.','Морозова'),('көшесі','С.','Сейфуллина')):
                street=initial+gap+name
                self.check('Алматы, '+typ+' '+street+' 18',city='Алматы',street_name=street,house='18')
        e=self.check('Г. Мусрепова 18',city='30 лет Казахстана',street_name='Г. Мусрепова',house='18')
        self.assertEqual(e['origin']['city'],'inferred')
        self.check('Алматы, С. Сейфуллина 18',city='Алматы',street_name='С. Сейфуллина',house='18')
        self.check('ул. Абая г. Алматы дом 8 кв 4',city='Алматы',street_name='Абая',house='8',apartment='4')
        self.check('г.Алматы, г.Алматы, ул. Луговая 18',city='Алматы',street_name='Луговая',house='18')
        self.check('Г. Конаев кв. 65 переулок Луговой дом 18',city='Конаев',street_name='Луговой',house='18',apartment='65')
        self.check('С. Коккоз 3, ул. Луговая, дом 18',city='Коккоз 3',street_name='Луговая',house='18')
        self.check('с. Тентек прВагонная 157дом173кв.5подъезд-1этаж',city='Тентек',street_name='Вагонная',house='157',apartment='173',entrance='5',floor='-1')


if __name__=='__main__':unittest.main()
