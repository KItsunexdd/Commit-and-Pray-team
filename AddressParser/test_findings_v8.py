"""Регрессии по открытым примерам второй независимой проверки."""
import unittest
from .parser import AddressParser
from .contracts import SLICE_FIELDS


class FreshFindings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser()
        cls.addClassCleanup(cls.parser.close)

    def check(self,raw,**expected):
        e=self.parser.explain_address(raw)
        for field,value in expected.items():
            self.assertEqual(e['record'][field],value,(raw,field))
        self.assertEqual(e['record']['raw_address'],raw)
        for s in e['spans']:
            if s['field'] in SLICE_FIELDS:
                self.assertEqual(raw[s['start']:s['end']],e['record'][s['field']])
        return e

    def test_01_phone_is_not_address_number(self):
        self.check('Астана, Сейфуллина 24 кв 7 тел 87771234567',city='Астана',street_name='Сейфуллина',house='24',apartment='7')
        self.check('Алматы, Гоголя 15 кв 3, +7 705 111 22 33',city='Алматы',street_name='Гоголя',house='15',apartment='3')
        for phone in ('тел 87771234567','т. 87771234567','+7 705 111 22 33','7771234567','87771234567'):
            e=self.check('Алматы, ул. Луговая 18 кв 4 '+phone,street_name='Луговая',house='18',apartment='4')
            self.assertEqual(e['diagnostics']['ignored'][0]['kind'],'phone')
        self.check('Алматы, ул. 8 Марта 18, кв 12',street_name='8 Марта',house='18',apartment='12')

    def test_02_leading_postal_code(self):
        for raw in ('050010 Алматы Гоголя 20 кв 5','050010, Алматы, Гоголя 20 кв 5',
                    '  010000 Астана ул. Гоголя 20 кв 5'):
            e=self.check(raw,street_name='Гоголя',house='20',apartment='5',city='Астана' if 'Астана' in raw else 'Алматы')
            self.assertIn('postal_code',{x['kind'] for x in e['diagnostics']['ignored']})
        self.check('Алматы, ул. Луговая, дом 123456',house='123456')

    def test_03_country_is_service_prefix(self):
        for country in ('Казахстан','Қазақстан','Kazakhstan','Республика Казахстан','РК'):
            e=self.check(country+', Астана, ул. Бейбитшилик 18, кв 4',city='Астана',
                         street_name='Бейбитшилик',house='18',apartment='4')
            self.assertIn('country',{x['kind'] for x in e['diagnostics']['ignored']})
        for prefix in ('Казахстан 050010 ','050010 Казахстан '):
            self.check(prefix+'Алматы Гоголя 20 кв 5',city='Алматы',street_name='Гоголя',house='20',apartment='5')
        self.check('Алматы, ул. Казахстан 18',city='Алматы',street_name='Казахстан',house='18')

    def test_04_kazakh_short_city_suffix(self):
        for city in ('Тараз','Өскемен'):
            for locality in (city+' қ.,',city+' қ.',city+' қаласы,','қ. '+city+','):
                e=self.check(locality+' Төле би көшесі 30, 5 пәтер',city=city,street_name='Төле би',house='30',apartment='5')
                self.assertTrue(all(e['record']['raw_address'][a:b]==city for a,b in e['span_map']['city']))

    def test_05_microdistrict_abbreviations(self):
        self.check('Алматы, мкрн Кулагер, 45, кв 12',street_type='микрорайон',street_name='Кулагер',house='45',apartment='12')
        self.check('Алматы, м-н Таугуль-2, 7, кв 1',street_type='микрорайон',street_name='Таугуль-2',house='7',apartment='1')
        for marker in ('мкрн','мкр-н','м-н','мкр'):
            self.check(f'Алматы, {marker} Самал-2, д 18',street_type='микрорайон',street_name='Самал-2',house='18')
            self.check(f'Алматы, 21 {marker}, д 18',street_type='микрорайон',street_name='21',house='18')

    def test_06_number_sign_after_markers(self):
        self.check('Астана, ул. Кенесары 10, подъезд№3, кв№15',city='Астана',street_name='Кенесары',house='10',entrance='3',apartment='15')
        for sep in ('№',' №',' № ','\u200b№\u200b'):
            self.check(f'Алматы, ул. Луговая, дом{sep}5, кв.{sep}15, подъезд{sep}3, этаж{sep}-1',
                       street_name='Луговая',house='5',apartment='15',entrance='3',floor='-1')

    def test_07_house_apartment_hyphen(self):
        for house in ('12','12/1','12а/3'):
            e=self.check(f'Алматы, ул. Гоголя {house}-40',street_name='Гоголя',house=house,apartment='40')
            ordinary=self.parser.parse_address(f'Алматы, ул. Гоголя {house}, кв 40')
            self.assertLess(e['record']['confidence'],ordinary['confidence'])
            self.assertIn('house_apartment_hyphen',{r['code'] for r in e['reasons']})
        self.check('Алматы, Гоголя 12/1-40',street_name='Гоголя',house='12/1',apartment='40')
        self.check('Алматы, ул. Гоголя 12-40, этаж -1',house='12',apartment='40',floor='-1')
        self.check('Алматы, мкр Таугуль-1, дом 15',street_name='Таугуль-1',house='15',apartment=None)

    def test_08_corpus_after_unmarked_house(self):
        self.check('Астана, ул. Сыганак 29 корп. 2, кв 8',city='Астана',street_name='Сыганак',house='29 корп. 2',apartment='8')
        for house in ('29 корп. 2','29 корпус Б','29 корп 2','18к2'):
            self.check('Астана, ул. Луговая '+house+', кв 8',street_name='Луговая',house=house,apartment='8')
        self.check('Астана, ул. Луговая д.10 корпус Б',street_name='Луговая',house='10 корпус Б')

    def test_09_latin_locality_and_street_markers(self):
        self.check('Astana, Kenesary str 40, apt 5',city='Astana',street_name='Kenesary',house='40',apartment='5')
        self.check('Almaty, Dostyk ave 52, flat 3',city='Almaty',province='Алматы',street_name='Dostyk',house='52',apartment='3')
        for city in ('Almaty','Astana','Shymkent'):
            self.check(city+', Abay 18, apt 4',city=city,street_name='Abay',house='18',apartment='4')
        for marker in ('str','st.','street'):
            self.check('Almaty, Dostyk '+marker+' 18',city='Almaty',street_name='Dostyk',street_type='улица',house='18')
            self.check('Almaty, '+marker+' Dostyk 18',city='Almaty',street_name='Dostyk',house='18')
        for marker in ('mkr','microdistrict'):
            self.check('Almaty, '+marker+' Samal 2, 18',city='Almaty',street_name='Samal 2',street_type='микрорайон',house='18')

    def test_10_landmark_after_house(self):
        self.check('Шымкент, Желтоксан 14 рядом с рынком 3 подъезд',city='Шымкент',street_name='Желтоксан',house='14',entrance='3',landmark='рынком')
        self.check('Астана, Кошкарбаева 26 напротив школы 2подъезд 3этаж',street_name='Кошкарбаева',house='26',entrance='2',floor='3',landmark='школы')
        for marker in ('рядом с','возле','напротив','около','за','ориентир','ориентир:'):
            self.check('Алматы, Луговая 18 '+marker+' школой, кв 4',street_name='Луговая',house='18',apartment='4',landmark='школой')
        self.check('Алматы, ул. Заозерная 18',street_name='Заозерная',house='18',landmark=None)

    def test_11_historical_city_surface(self):
        self.check('Алма-Ата, ул. Гоголя 20',city='Алма-Ата',province='Алматы',street_name='Гоголя',house='20')
        self.check('Нур-Султан, ул. Сарайшык 5',city='Нур-Султан',province='Астана',street_name='Сарайшык',house='5')
        self.check('Капчагай, ул. Абая 1',city='Капчагай',province='Алматинская область',street_name='Абая',house='1')
        for city in ('Алма-Ата','Нур-Султан','Капчагай','Целиноград'):
            for prefix in (city+', ',city+' ', 'г. '+city+', '):
                e=self.check(prefix+'ул. Луговая 18',city=city,street_name='Луговая',house='18')
                self.assertTrue(e['evidence']['city']['entity_ids'])
                for a,b in e['span_map']['city']:self.assertEqual(e['record']['raw_address'][a:b],city)
        self.check('Нұр-Сұлтан/Нур-Султан, ул. Луговая 18',city='Нур-Султан',street_name='Луговая',house='18')
        self.check('Нур-Султан, Кабанбай батыра 53, кв 7',city='Нур-Султан',street_name='Кабанбай батыра',house='53',apartment='7')

    def test_12_separate_living_area(self):
        self.check('Караганда, Майкудук, ул. Мамраева 10',city='Караганда',living_area='Майкудук',street_name='Мамраева',house='10')
        self.check('Караганда, Пришахтинск, 21 мкр, д 3',living_area='Пришахтинск',street_name='21',street_type='микрорайон',house='3')
        for marker in ('ж/м','ж.м.','жилмассив','жилой массив'):
            self.check('Караганда, '+marker+' Михайловка, ул. Ленина 3',living_area='Михайловка',street_name='Ленина',house='3')
        self.check('Караганда, мкр-н Майкудук, 21 мкр, д 3',living_area='Майкудук',street_name='21',house='3')
        self.check('Караганда, Майкудук, Мамраева 10',living_area='Майкудук',street_name='Мамраева',house='10')
        for name in ('Майкудукская','Пришахтинская'):
            self.check('Караганда, ул. '+name+' 10',street_name=name,living_area=None,house='10')
        self.check('Караганда, Майкудук, дом 10',living_area=None,street_name='Майкудук',house='10')
        self.check('Астана, Майкудук, ул. Луговая 10',city='Астана',living_area=None,street_name='Луговая',house='10')
        self.check('Караганда, 2-я Пятилетка, 78, кв 14',living_area=None,street_name='2-я Пятилетка',house='78',apartment='14')


if __name__=='__main__':unittest.main()


