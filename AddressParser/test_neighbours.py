"""Предметные проверки отказов и интервалов, без оценки закрытых адресов."""
import unittest
from .neighbours import infer, numeric_family

class NeighbourControls(unittest.TestCase):
    def test_strict_number(self):
        for raw,expected in [('12а',12),('12a',12),('55/6',55),('12 корпус 2',None),('1-4',None),('2,4',None),('кв 12',None)]:
            self.assertEqual(numeric_family(raw),expected)

    def test_two_sides_parity(self):
        f={2:['a'],6:['a'],3:['b'],7:['b']}
        self.assertEqual(infer(f,4)[0],'a');self.assertEqual(infer(f,5)[0],'b')
        for n in (0,1,8,9):self.assertIsNone(infer(f,n)[0])

    def test_conflicts(self):
        self.assertIsNone(infer({2:['a'],6:['b']},4)[0])
        self.assertIsNone(infer({2:['a'],4:['a','b'],6:['a']},4)[0])
        self.assertIsNone(infer({2:['a','b'],6:['a']},4)[0])
        self.assertEqual(infer({2:['a'],8:['b']},4)[0],'a')

if __name__=='__main__':unittest.main()
