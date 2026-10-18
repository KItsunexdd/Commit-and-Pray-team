"""Арифметические контроли метрики, независимые от правил извлечения."""
import json
import unittest
from .contracts import empty_record
from .evaluate import DEV, normalized, score

class EvaluationControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.config=json.loads((DEV/'evaluation_config.json').read_text(encoding='utf-8'))

    def row(self,fields,amb=()):
        return dict(raw_address='x',expected={f:fields.get(f) for f in self.config['fields']},
                    origin={f:'explicit' if f in fields else 'absent' for f in self.config['fields']},ambiguity=list(amb))

    def test_normalization(self):
        n=lambda x,f='house',m='primary':normalized(x,f,self.config,m)
        self.assertNotEqual(n('2/7'),n('27')); self.assertNotEqual(n('-1'),n('1'))
        self.assertEqual(n('2/7',m='judge_literal'),n('27',m='judge_literal'))
        self.assertNotEqual(n('Aбая','street_name'),n('Абая','street_name'))
        self.assertNotEqual(n('Св\u200bет','street_name'),n('Свет','street_name'))
        self.assertNotEqual(n('и\u0306'),n('й'))
        self.assertNotEqual(n(12),n('12'))
        self.assertEqual(n(' АБАЯ,  2 '),'абая 2')

    def test_macro_not_micro(self):
        rows=[self.row(dict(city='A',house='1',apartment='3')),self.row(dict(house='2'))]
        predictions=[empty_record('x'),empty_record('x')]
        predictions[0].update(city='A',house='9',apartment='3'); predictions[1]['house']='2'
        r=score(rows,predictions,self.config)
        self.assertAlmostEqual(r['groups']['address']['accuracy'],.75)
        self.assertAlmostEqual(r['primary'],(.75*.6+1*.25)/.85)
        self.assertEqual(r['micro_accuracy'],.75)

    def test_empty_and_unresolved(self):
        row=self.row(dict(house='1'),[dict(kind='unresolved',fields=['house'])])
        r=score([row],[empty_record('x')],self.config)
        self.assertIsNone(r['primary']); self.assertEqual(r['eligible_cells'],0)
        r=score([],[],self.config); self.assertIsNone(r['micro_accuracy'])

    def test_extra_separate(self):
        row=self.row(dict(city='A')); pred=empty_record('x'); pred.update(city='A',house='9')
        r=score([row],[pred],self.config)
        self.assertEqual(r['primary'],1); self.assertEqual(r['fields']['house']['absent_extra'],1)

    def test_contract_failure(self):
        pred=empty_record('x'); pred['house']=12
        with self.assertRaises(TypeError): score([self.row(dict(house='12'))],[pred],self.config)
        with self.assertRaises(ValueError): score([self.row({})],[],self.config)

if __name__=='__main__': unittest.main()
