"""Подтверждение улицы и района внутри известного населённого пункта."""
import unittest
from unittest.mock import patch
from .parser import AddressParser
from .contracts import SLICE_FIELDS


class ScopedConfirmation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser();cls.addClassCleanup(cls.parser.close)

    def check(self,raw,**expected):
        e=self.parser.explain_address(raw)
        for f,v in expected.items():self.assertEqual(e['record'][f],v,(raw,f,e))
        for s in e['spans']:
            if s['field'] in (*SLICE_FIELDS,'city'):
                self.assertEqual(raw[s['start']:s['end']],e['record'][s['field']])
        return e

    def test_house_selects_geonim(self):
        raw='Астана, ул. Шаймердена Косшыгулулы 20'
        e=self.check(raw,city='Астана',province='Астана',house='20',district='Сарыарка')
        self.assertEqual(e['origin']['district'],'inferred')
        self.assertEqual(e['methods']['district'],'exact_house')
        self.assertNotIn('district_conflict',[r['code'] for r in e['reasons']])
        e=self.check('Шаймердена Косшыгулулы 20',city='Астана',province='Астана',district='Сарыарка',house='20')
        self.assertEqual(e['origin']['city'],'inferred')
        ref=self.parser.reference
        matches=ref.geonims('Шаймердена Косшыгулулы',ref.admins('Астана')[0]['id'])
        self.assertEqual({g['gid'] for g in matches},{69017,70183})
        actual=ref.house
        def both(city_id,geonim_id,number,corpus=None):
            return actual(city_id,'osm:street:da00f640595dd2e9c872',number,corpus)
        with patch.object(ref,'house',side_effect=both):
            e=self.check(raw,district=None)
            self.assertIn('district_conflict',[r['code'] for r in e['reasons']])

    def test_confirmed_city_at_street_end(self):
        for street in ('Шаймерден Косшыгулулы Астана','Шаймерден КосшыгулулыАстана'):
            e=self.check('Улица '+street+', 20 Сырыарка',city='Астана',province='Астана',
                         street_name='Шаймерден Косшыгулулы',house='20',district='Сырыарка')
            self.assertEqual(e['methods']['city'],'confirmed_street_city')
            self.assertEqual(e['sources']['city'],'string')
        self.check('ул. Астана 5',city=None,street_name='Астана',house='5')
        self.check('Атырау — Уральск',city='Атырау',street_name='Уральск',house=None)
        self.check('Алматы, ул. ДостыкАстана 5',city='Алматы',street_name='ДостыкАстана',house='5')
        self.check('ул. НеизвестнаяпроверочнаяАстана, 987654',city=None,
                   street_name='НеизвестнаяпроверочнаяАстана',house='987654')

    def test_city_scoped_confirmation_preserves_spelling(self):
        for street in ('Шаймерден Косшыгулулы','Шаймердена Косшыгулулы','Шаймердена Косшыгулулыь'):
            e=self.check('Астана, ул. '+street+' 20',street_name=street,house='20',district='Сарыарка')
            self.assertEqual(e['sources']['street_name'],'string')
            self.assertEqual(e['origin']['street_name'],'explicit')
        for raw in ('Астана, ул. Шаймерден Косшыгулулы, 20 Сырыарка',
                    'Астана, район Сырыарка, ул. Шаймерден Косшыгулулы 20'):
            e=self.check(raw,city='Астана',district='Сырыарка')
            self.assertEqual(e['origin']['district'],'explicit')
            self.assertEqual(e['sources']['district'],'string')
            self.assertEqual(e['evidence']['district']['confirmation']['method'],'one_edit')
        self.check('Алматы, ул. Луговая, 20 Сырыарка',city='Алматы',district=None)
        e=self.check('Астана, район Нуря, Турн 55/6',city='Астана',district='Нуря',street_name='Турн',house='55/6')
        self.assertEqual(e['evidence']['district']['confirmation']['method'],'one_edit')
        self.assertEqual(e['evidence']['street_name']['confirmation']['method'],'one_edit')
        e=self.check('Шаймердена Косшыгулулыь 20',city=None,district=None)
        self.assertNotIn('street_name',e['evidence'])
        e=self.check('район Сырыарка, Неизвестнаяпроверочная 987654',city=None,district='Сырыарка')
        self.assertNotIn('district',e['evidence'])
        ref=self.parser.reference;city=ref.admins('Астана')[0]['id']
        real=ref.geonims
        def ambiguity(name,city_id=None):
            if name in ('лунная','лунный'):return [{'id':name}]
            return real(name,city_id)
        with patch.object(ref,'_street_spellings',return_value={6:(('лунная','лунный'),('йыннул','яаннул'))}),patch.object(ref,'geonims',side_effect=ambiguity):
            self.assertEqual(ref.confirm_geonims('Луннай',city),([],None))
        with patch.object(ref,'_district_spellings',return_value={'лунная':{'a'},'лунный':{'b'}}):
            self.assertEqual(ref.confirm_district('Луннай',city),([],None))


if __name__=='__main__':unittest.main()
