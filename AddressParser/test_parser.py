"""Контрольные примеры и инварианты публичного интерфейса."""
import json
import unittest
from .parser import AddressParser, tokens
from .contracts import ADDRESS_FIELDS, SLICE_FIELDS, validate_record
from .reference import ROOT

class ParserControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser();cls.addClassCleanup(cls.parser.close)

    def test_control_table(self):
        cases=[
            ('Назарбаева8',dict(street_name='Назарбаева',house='8')),
            ('Ул .Курильская 9 кв 1',dict(street_name='Курильская',house='9',apartment='1')),
            ('Мкр Аксай 3а, 59, кв 70',dict(street_name='Аксай 3а',house='59',apartment='70')),
            ('город Актобе/Ақтөбе қаласы',dict(city='Актобе',street_name=None)),
            ('Абая 1/2',dict(street_name='Абая',house='1/2')),
            ('12а',dict(house='12а',street_name=None)),('12a',dict(house='12a',street_name=None)),
            ('ул. Маи\u0306ская 4',dict(street_name='Маи\u0306ская',house='4')),
            ('ул. ﬃ 4',dict(street_name='ﬃ',house='4')),
            ('ул. Св\u200bердлова 8',dict(street_name='Св\u200bердлова',house='8')),
            ('ул. 8 Марта дом 21',dict(street_name='8 Марта',house='21')),
            ('239 кв, 5 подьезд',dict(apartment='239',entrance='5')),
            ('Нурсити 2 микрорайон 11дом 5 подьезд 239 кв',dict(street_name='Нурсити 2',house='11',entrance='5',apartment='239')),
            ('мкр Саялы 1, улица Абая дом 8',dict(living_area='Саялы 1',street_name='Абая',house='8')),
            ('ЖК Томирис 3, улица Абая дом 8',dict(living_area='Томирис 3',street_name='Абая',house='8')),
            ('Турксибского района, Рыбинский переулок, дом 4',dict(district='Турксибского',street_name='Рыбинский')),
            ('📦 ул. Абая 8',dict(street_name='Абая',house='8')),
            ('66квартал 12дом 69квартира',dict(street_name='66',house='12',apartment='69')),
        ]
        for raw,expected in cases:
            with self.subTest(raw=raw):
                actual=self.parser.parse_address(raw)
                for f,v in expected.items(): self.assertEqual(actual[f],v,f)
                self.check_invariants(raw)

    def check_invariants(self,raw):
        e=self.parser.explain_address(raw); record=e['record']; validate_record(record)
        self.assertEqual(record,self.parser.parse_address(raw))
        for span in e['spans']:
            a,b=span['start'],span['end']; f=span['field']
            self.assertTrue(0<=a<b<=len(raw))
            if f in SLICE_FIELDS: self.assertEqual(record[f],raw[a:b])
        for f in ADDRESS_FIELDS:
            if e['origin'][f]=='inferred': self.assertTrue(e['methods'][f]); self.assertFalse(e['span_map'][f])
            if e['origin'][f]=='explicit': self.assertTrue(e['span_map'][f]); self.assertEqual(e['sources'][f],'string')

    def test_sample_explicit_fields(self):
        inputs=json.loads((ROOT/'Samples/sample_input.json').read_text(encoding='utf-8'))
        expected=json.loads((ROOT/'Samples/sample_output.json').read_text(encoding='utf-8'))
        actual=self.parser.parse_records(inputs)
        for a,e in zip(actual,expected):
            for f in e:
                if f not in ('district','confidence'): self.assertEqual(a[f],e[f],f)

    def test_repeated_id(self):
        rows=[dict(id='same',raw_address='Абая 1'),dict(id='same',raw_address='Туран 2')]
        out=self.parser.parse_records(rows)
        self.assertEqual([r['house'] for r in out],['1','2'])
        self.assertEqual([r['id'] for r in out],['same','same'])

    def test_dev_invariants(self):
        for line in (ROOT/'datasets/evaluation/gold/T3.1_A1/dev.jsonl').read_text(encoding='utf-8').splitlines():
            self.check_invariants(json.loads(line)['raw_address'])

    def test_token_offsets(self):
        raw='📦 Маи\u0306ская8 Св\u200bердлова ﬃ'
        ts=tokens(raw)
        self.assertEqual(''.join(t['text'] for t in ts),raw)
        for t in ts: self.assertEqual(t['text'],raw[t['start']:t['end']])

    def test_provider_and_empty_reference(self):
        class Provider:
            def get_candidates(self,raw,tokens,context):
                json.dumps([tokens,context])
                return [dict(field='street_name',spans=[[0,4]],score=30,method='external_candidate')]
        p=AddressParser(provider=Provider(),reference=False)
        self.addCleanup(p.close)
        self.assertEqual(p.parse_address('Тест 8')['street_name'],'Тест')
        self.assertEqual(AddressParser(reference=False).parse_address('ул. Абая 8')['house'],'8')

    def test_mapping_only_changes_rating(self):
        p=AddressParser()
        self.addCleanup(p.close)
        p.mapping=[[0,.1],[1,.8]]
        mapped=p.parse_address('ул. Абая 8');original=self.parser.parse_address('ул. Абая 8')
        self.assertNotEqual(mapped.pop('confidence'),original.pop('confidence'))
        self.assertEqual(mapped,original)

if __name__=='__main__': unittest.main()
