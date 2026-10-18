"""Регрессии по открытым классам ошибок независимой проверки."""
import unittest
from .parser import AddressParser, NUMBER
from .contracts import SLICE_FIELDS
from .reference import district_name


class MeasurementFindings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser()
        cls.addClassCleanup(cls.parser.close)

    def check(self,raw,**expected):
        e=self.parser.explain_address(raw)
        for field,value in expected.items():
            self.assertEqual(e['record'][field],value,(raw,field))
        for s in e['spans']:
            if s['field'] in SLICE_FIELDS:
                self.assertEqual(raw[s['start']:s['end']],e['record'][s['field']])
        self.assertEqual(e['record']['raw_address'],raw)
        return e

    def test_14_hyphen_in_unmarked_name(self):
        for name in ('Таугуль-1','Аксай-4','Жетысу-3','Орбита-1','Мамыр-4','Коктем-1'):
            self.check(f'Алматы, {name}, 15, кв 3',street_name=name,house='15',apartment='3')
        self.check('Алматы, мкр Таугуль-1, д 15, кв 3',street_name='Таугуль-1',house='15',apartment='3')
        for detail in ('этаж -1','-1 этаж'):
            self.check('Алматы, ул. Луговая 8, '+detail,street_name='Луговая',house='8',floor='-1')

    def test_02_unmarked_glued_street_and_details(self):
        for raw,name,house,apt in (
            ('Алматы Жандосова58кв12','Жандосова','58','12'),
            ('Шымкент Рыскулова41/2кв8','Рыскулова','41/2','8'),
            ('Алматы Жандосова 58кв12','Жандосова','58','12'),
            ('Алматы, ул. Жандосова 58 кв12','Жандосова','58','12'),
        ):
            self.check(raw,street_name=name,house=house,apartment=apt)
        self.check('Астана Кошкарбаева26кв31подъезд3этаж6',street_name='Кошкарбаева',house='26',
                   apartment='31',entrance='3',floor='6')
        for tail,name in [('улица 25','25'),('1 Мая','1 Мая'),('мкр Аксай 3а','Аксай 3а'),
                          ('Нурсити 2 микрорайон','Нурсити 2'),('66квартал','66')]:
            self.check('Алматы, '+tail+', дом 17',street_name=name,house='17')

    def test_03_number_between_street_and_apartment(self):
        self.check('Астана ул.Кошкарбаева 26кв31',street_name='Кошкарбаева',house='26',apartment='31')
        self.check('Атырау ул.Азаттык 48кв5',street_name='Азаттык',house='48',apartment='5')
        for gap in ('',' ','\u200b'):
            self.check(f'Алматы, ул. Луговая 18{gap}кв{gap}7',street_name='Луговая',house='18',apartment='7')
        self.check('Алматы, Сейфуллина, 41 дом, 7 кв, 1 подъезд',street_name='Сейфуллина',house='41',apartment='7',entrance='1')
        self.check('66квартал 12дом 69квартира',street_name='66',street_type='квартал',house='12',apartment='69')
        self.check('ул. Луговая, 18дом7кв2под4этаж',street_name='Луговая',house='18',apartment='7',entrance='2',floor='4')

    def test_04_spaced_dashes_are_separators(self):
        for dash in ('-','–','—'):
            self.check(f'г Астана {dash} ул Кошкарбаева {dash} 26 {dash} кв 31',
                       city='Астана',street_name='Кошкарбаева',house='26',apartment='31')
            self.check(f'Алматы {dash} Жандосова 58 {dash} кв 12',
                       city='Алматы',street_name='Жандосова',house='58',apartment='12')
        for name in ('Кок-Тобе','Кызыл-Ординская','Бухар-Жырауский','Таугуль-1'):
            self.check('Алматы, '+name+', дом 18, этаж -1',street_name=name,house='18',floor='-1')

    def test_05_letter_before_fraction(self):
        self.check('Алматы, Тимирязева 3б/1',street_name='Тимирязева',house='3б/1')
        self.check('Астана, ул. Кенесары 12а/3, кв 4',street_name='Кенесары',house='12а/3',apartment='4')
        for number in ('2а/7','2А/7','1/2','55/6','12а','3/1б','48/1','7/3','12к2'):
            self.check('Алматы, ул. Луговая '+number,street_name='Луговая',house=number)
        self.assertIsNone(NUMBER.fullmatch('12абая'))

    def test_05_exact_reference_number_and_case(self):
        ref=self.parser.reference
        for number in ('2а/7','12а'):
            row=ref.db.execute('SELECT a.id city,g.id geonim,h.locality,h.geonim gid,h.corpus '
                'FROM houses h JOIN admin a ON a.aid=h.locality JOIN geonims g ON g.gid=h.geonim '
                'WHERE h.number=? LIMIT 1',(number,)).fetchone()
            self.assertIsNotNone(row,number)
            corpus=None if row['corpus']=='0' else row['corpus'][1:]
            self.assertIsNotNone(ref.house(row['city'],row['geonim'],number,corpus))
            # Точный SQL-ключ чувствителен к регистру одинаково для обоих форматов.
            for spelling in (number,number.upper()):
                exists=bool(ref.db.execute('SELECT 1 FROM houses WHERE locality=? AND geonim=? AND number=? AND corpus=?',
                    (row['locality'],row['gid'],spelling,row['corpus'])).fetchone())
                self.assertEqual(ref.house(row['city'],row['geonim'],spelling,corpus) is not None,exists)

    def test_08_detail_marker_spellings(self):
        for marker in ('етаж','этж','эт','этаж.'):
            self.check('Алматы, ул. Жандосова 58, кв 12, '+marker+' 4',
                       street_name='Жандосова',house='58',apartment='12',floor='4')
            self.check('ул. Луговая 18, -1 '+marker,house='18',floor='-1')
        for marker in ('кв-ра','квар.'):
            self.check('ул. Луговая 18, '+marker+' 7, подъез 2',house='18',apartment='7',entrance='2')

    def test_09_kazakh_microdistrict_suffix(self):
        self.check('Астана, Самал шағын ауданы 5, 12 пәтер',street_name='Самал',street_type='микрорайон',house='5',apartment='12')
        self.check('Астана, Көктал шағын ауданы, 7 үй',street_name='Көктал',street_type='микрорайон',house='7')
        for marker in ('шағын аудан','шағын ауданы'):
            self.check('Астана, '+marker+' Самал, 7 үй',street_name='Самал',street_type='микрорайон',house='7')

    def test_12_dictionary_district_has_no_type(self):
        for raw,name,method in (
            ('Актобе, пр. Санкибай батыра 10','Астана','exact_house'),
            ('Актобе, пр. Абилкайыр хана 2','Астана','exact_house'),
            ('Актобе, ул. Сатпаева 5','Алматы','geonim_uniform'),
            ('г. Актобе, ул. Есет батыра 100','Астана','street_parity_neighbour'),
            ('Шымкент, Павлова ул, 231 дом','Тұран','geonim_uniform'),
            ('Алматы, ул. Кок-Тобе 5','Медеуский','geonim_uniform'),
        ):
            e=self.check(raw,district=name)
            self.assertEqual(e['methods']['district'],method)
            self.assertEqual(e['sources']['district'],'dictionary')
            self.assertEqual(e['span_map']['district'],[])
        for name in ('район Есиль','Есиль район','Есиль ауданы'):
            self.assertEqual(district_name(name),'Есиль')

    def test_07_explicit_abbreviated_province(self):
        for marker in ('обл.','обл','область'):
            for district in ('','Илийский р-н, '):
                e=self.check(f'Алматинская {marker}, {district}пос. Боралдай, ул. Шевченко 7',
                    province='Алматинская область',city='Боралдай',street_name='Шевченко',house='7')
                self.assertEqual(e['sources']['province'],'string')
                self.assertEqual(e['origin']['province'],'explicit')
                self.assertTrue(e['span_map']['province'])
        self.check('Алматинская обл., Карасайский р-н, г. Каскелен, ул. Абая 5',province='Алматинская область',city='Каскелен')
        self.check('Карагандинская обл., г. Темиртау, пр. Республики 9',province='Карагандинская область',city='Темиртау')
        self.check('Алматинская обл., г. Павлодар, ул. Луговая 18',province='Алматинская область',city='Павлодар')

    def test_11_rural_honorific_and_original_spelling(self):
        for prefix in ('','Акмолинская область, '):
            e=self.check(prefix+'с. Кабанбай батыр, ул. Мира 3',city='Кабанбай батыр',
                         province='Акмолинская область',street_name='Мира',house='3')
            self.assertIn('kato:116665100',e['evidence']['city']['entity_ids'])
        e=self.check('с. Отеген батыр, ул. Мира 3',city='Отеген батыр',province='Алматинская область')
        self.assertEqual(e['sources']['city'],'string')
        a,b=e['span_map']['city'][0]
        self.assertEqual(e['record']['raw_address'][a:b],e['record']['city'])
        e=self.check('Алматинская область, г. Павлодар, ул. Луговая 18',province='Алматинская область',city='Павлодар')
        self.assertIn('city_province_conflict',{r['code'] for r in e['reasons']})
        self.check('Астана, Кенесары хана 28',city='Астана',street_name='Кенесары хана',house='28')

    def test_policy_42_kazakh_city_without_russian_duplicate(self):
        for city in ('Өскемен','Түркістан','Жезқазған','Қонаев','Ақтөбе','Орал','Қарағанды','Нұр-Сұлтан'):
            for prefix in (city+' қаласы, ',city+' ', 'г. '+city+', '):
                e=self.check(prefix+'ул. Луговая 18',city=city,street_name='Луговая',house='18')
                a,b=e['span_map']['city'][0]
                self.assertEqual(e['record']['raw_address'][a:b],city)
                self.assertTrue(e['evidence']['city']['entity_ids'])
        for city in ('Өскемен/Усть-Каменогорск','Усть-Каменогорск/Өскемен қаласы'):
            self.check('город '+city+', ул. Луговая 18',city='Усть-Каменогорск',street_name='Луговая',house='18')
        self.check('Өскемен/Өскемен қаласы, ул. Луговая 18',city='Өскемен',street_name='Луговая',house='18')
        self.check('город Алматы/Алматы қаласы, Мкр Аксай 3а, 59',city='Алматы',district='Ауэзовский')
        self.check('область Абай, Семей, ул. Луговая 18',province='Абайская область',city='Семей')


if __name__=='__main__':unittest.main()
