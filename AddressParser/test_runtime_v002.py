"""Приоритет контура, запасной вывод и отказы новой компактной базы."""
import hashlib
import json
import unittest
from unittest.mock import patch
from .parser import AddressParser
from .reference import ROOT,DEFAULT_DB

class RuntimeTerritoryControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parser=AddressParser();cls.addClassCleanup(cls.parser.close)

    def test_published_runtime_hash_and_counts(self):
        manifest=json.loads((DEFAULT_DB.parent/'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(hashlib.sha256(DEFAULT_DB.read_bytes()).hexdigest(),manifest['runtime']['sha256'])
        self.assertEqual(self.parser.reference.path,DEFAULT_DB)
        self.assertEqual(self.parser.territories.path,DEFAULT_DB)
        row=self.parser.reference.db.execute('SELECT COUNT(*),SUM(district IS NOT NULL),SUM(conflict) FROM territory_districts').fetchone()
        self.assertEqual(tuple(row),(12267,1122,27))

    def test_all_published_conflict_rows_block(self):
        p=self.parser
        rows=p.reference.db.execute('SELECT g.*,a.id AS city_id FROM territory_districts t '
             'JOIN geonims g ON g.gid=t.geonim JOIN admin a ON a.aid=t.locality WHERE t.conflict!=0').fetchall()
        self.assertEqual(len(rows),27)
        for row in rows:
            with self.subTest(id=row['id']):
                did,proof=p.territories.district(row['city_id'],[dict(row)])
                self.assertIsNone(did);self.assertTrue(proof['blocking']);self.assertTrue(proof.get('rows'))

    def evaluate(self,contour,uniform,raw='Алматы мкр Солнечный дом 29'):
        p=self.parser;g=dict(id='fixture',role='address_area',type_json='{}',type_conflict=0)
        with patch.object(p.reference,'geonims',side_effect=lambda name,city_id=None:[g] if name=='Солнечный' else []), \
             patch.object(p.reference,'house',return_value=None), \
             patch.object(p.territories,'district',return_value=contour), \
             patch.object(p.uniform,'district',return_value=uniform), \
             patch.object(p.neighbours,'district') as neighbour:
            result=p.explain_address(raw);neighbour.assert_not_called();return result

    def test_contour_primary_even_with_uniform_confirmation(self):
        did='kato:751310000';proof=dict(source='test',entity_ids=[did],minimum_fraction=.96)
        for uniform in ((did,dict(house_count=8)),(None,dict(reason='insufficient_houses')),
                        (None,dict(reason='incomplete_labels'))):
            with self.subTest(uniform=uniform):
                e=self.evaluate((did,proof),uniform)
                self.assertEqual(e['record']['district'],'Ауэзовский')
                self.assertEqual(e['methods']['district'],'territory_within_district')
                self.assertEqual(e['origin']['district'],'inferred');self.assertEqual(e['sources']['district'],'dictionary')
                self.assertEqual(e['span_map']['district'],[])

    def test_uniform_only_without_accepted_contour(self):
        e=self.evaluate((None,dict(reason='no_accepted_contour')),('kato:751310000',dict(house_count=3)))
        self.assertEqual(e['record']['district'],'Ауэзовский');self.assertEqual(e['methods']['district'],'geonim_uniform')
        self.assertEqual(e['evidence']['district']['territory_unavailable']['reason'],'no_accepted_contour')

    def test_conflict_and_disagreement_never_fall_back(self):
        a,b='kato:751310000','kato:751710000'
        for contour,uniform,code in (
            ((None,dict(reason='territory_conflict',blocking=True)),(a,{}),'territory_conflict'),
            ((a,{}),(None,dict(reason='house_conflict',blocking=True)),'territory_conflict'),
            ((a,{}),(b,{}),'district_methods_disagree'),
        ):
            e=self.evaluate(contour,uniform)
            self.assertIsNone(e['record']['district']);self.assertEqual(e['origin']['district'],'absent')
            self.assertIsNone(e['methods']['district']);self.assertNotIn('district',e['sources'])
            self.assertTrue(any(r['code']==code and r.get('evidence') for r in e['reasons']))

    def test_standalone_living_area_uses_contour(self):
        e=self.evaluate(('kato:751310000',dict(minimum_fraction=.99)),(None,dict(reason='no_houses')),
                        'Алматы ЖК Солнечный дом 29')
        self.assertEqual(e['record']['living_area'],'Солнечный')
        self.assertEqual(e['methods']['district'],'territory_within_district')

    def test_explicit_district_is_preserved(self):
        with patch.object(self.parser.territories,'district') as contour:
            e=self.parser.explain_address('Алматы Медеуский район мкр Солнечный дом 29')
            self.assertEqual(e['record']['district'],'Медеуский');self.assertEqual(e['origin']['district'],'explicit')
            contour.assert_not_called()

if __name__=='__main__':unittest.main()
