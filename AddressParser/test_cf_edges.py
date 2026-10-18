"""Cf на границах полей и сохранение исходных внутренних символов."""
import unittest
from .parser import AddressParser
from .contracts import CF_CHARS, SLICE_FIELDS, is_edge, trim_span


class FormatCharacterEdges(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser()
        cls.addClassCleanup(cls.parser.close)

    def check(self,raw,expected):
        e=self.parser.explain_address(raw)
        self.assertEqual(e['record']['raw_address'],raw)
        for field,value in expected.items():
            self.assertEqual(e['record'][field],value,(ascii(raw),field))
        for s in e['spans']:
            value=raw[s['start']:s['end']]
            self.assertFalse(is_edge(value[0]),(s,ascii(value)))
            self.assertFalse(is_edge(value[-1]),(s,ascii(value)))
            if s['field'] in SLICE_FIELDS:
                self.assertEqual(value,e['record'][s['field']])
            self.assertIn([s['start'],s['end']],e['span_map'][s['field']])
            self.assertEqual(e['sources'][s['field']],'string')
        return e

    def test_task_table(self):
        for tail,name,house in (
            ('ул\u200b Жандосова 33/1, кв 12','Жандосова','33/1'),
            ('ул.\u200b Жандосова 33/1','Жандосова','33/1'),
            ('ул \u200bЖандосова 33/1','Жандосова','33/1'),
            ('ул\u200bЖандосова 33/1','Жандосова','33/1'),
            ('ул\u200e Абая 5','Абая','5'),
            ('пр\u200b Абая 5','Абая','5'),
            ('мкр\u200b Аксай 3а, 59','Аксай 3а','59'),
            ('Абая\u200b 5','Абая','5'),
            ('ул\u00a0Жандосова 33/1','Жандосова','33/1'),
        ):
            with self.subTest(tail=ascii(tail)):
                raw='Алматы, '+tail
                e=self.check(raw,dict(city='Алматы',street_name=name,house=house))
                clean=self.parser.parse_address(raw.replace('\u200b','').replace('\u200e',''))
                for field in SLICE_FIELDS:
                    self.assertEqual(e['record'][field],clean[field])

    def test_house_after_name(self):
        self.check('Алматы, ул Абая 5\u200b, кв 12',
                   dict(city='Алматы',street_name='Абая',house='5',apartment='12'))
        for cf in CF_CHARS:
            with self.subTest(cf=ascii(cf)):
                self.check(f'Алматы, ул. Луговая {cf}18/2{cf}, кв 7',
                           dict(street_name='Луговая',house='18/2',apartment='7'))

    def test_all_format_characters_at_marked_field_edges(self):
        for cf in CF_CHARS:
            for gap in (cf,cf+' ', ' '+cf):
                with self.subTest(gap=ascii(gap)):
                    self.check(f'г{gap}Алматы{gap}, район{gap}Бостандыкский{gap}, '
                        f'ЖК{gap}Рассвет{gap}, ул{gap}Луговая{gap}, дом{gap}18/2{gap}, '
                        f'кв{gap}12{gap}, под{gap}2{gap}, эт{gap}4{gap}, ориентир:{gap}аптека{gap}',
                        dict(city='Алматы',district='Бостандыкский',living_area='Рассвет',
                             street_name='Луговая',house='18/2',apartment='12',entrance='2',floor='4',landmark='аптека'))

    def test_postfix_markers_and_separate_numbers(self):
        for cf in ('\u200b','\u200e','\u200f','\u2060','\ufeff'):
            with self.subTest(cf=ascii(cf)):
                self.check(f'Алматы{cf}, Бостандыкский{cf} район, Луговая{cf} ул., '
                           f'{cf}18{cf} дом, {cf}12{cf} кв, {cf}2{cf}-подъезд, {cf}4{cf} эт',
                           dict(city='Алматы',district='Бостандыкский',street_name='Луговая',
                                house='18',apartment='12',entrance='2',floor='4'))
                self.check(f'Алматы, мкр Аксай 3а{cf}, {cf}59{cf}',dict(street_name='Аксай 3а',house='59'))

    def test_province_and_locality_forms(self):
        for cf in ('\u200b','\u200f','\U000e0001'):
            for marker in ('г.','город','г'):
                self.check(f'область{cf} Абайская{cf}, {marker}{cf} Семей{cf}, ул. Луговая 8',
                           dict(province='Абайская область',city='Семей',street_name='Луговая',house='8'))
            self.check(f'с.{cf} Неизвестное{cf}, ул. Луговая 8',dict(city='Неизвестное'))
            self.check(f'Абайская{cf} область{cf}, Семей{cf} қаласы, ул. Луговая 8',
                       dict(province='Абайская область',city='Семей'))

    def test_internal_cf_preserved(self):
        self.check('Алматы, район Се\u200bверный, ЖК Ра\u200bссвет, ул. Лу\u200bнная 8, ориентир: ар\u200bка',
                   dict(district='Се\u200bверный',living_area='Ра\u200bссвет',street_name='Лу\u200bнная',house='8',landmark='ар\u200bка'))
        for cf in ('\u200b','\u200d'):
            self.check(f'г. Алматы, ул. Г{cf}орная, дом 18',dict(city='Алматы',street_name=f'Г{cf}орная',house='18'))

    def test_number_marker_does_not_cross_separator(self):
        self.check('Алматы, переулок Сектор Д, 18 7',dict(street_name='Сектор Д',house=None))

    def test_mixed_edges_trim_in_one_pass(self):
        for cf in CF_CHARS:
            raw=f'{cf} ,;:. \t{cf} Лу\u200bнная{cf} .:;, \n{cf}'
            a,b=trim_span(raw,0,len(raw))
            self.assertEqual(raw[a:b],'Лу\u200bнная')


if __name__=='__main__':unittest.main()
