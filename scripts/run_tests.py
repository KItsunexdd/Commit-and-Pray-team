"""Все проверки репозитория одной командой: python scripts/run_tests.py

Тесты API и парсера. Регрессия на 6000 строк train запускается, только если
файл datasets/train/train.jsonl положен рядом: в git он не хранится из-за размера.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRAIN = ROOT / 'datasets' / 'train' / 'train.jsonl'
TRAIN_TESTS = {'test_all_train_contracts'}


def flatten(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from flatten(item)
        else:
            yield item


def main() -> int:
    sys.path.insert(0, str(ROOT))
    modules = ['app.test_api'] + sorted(f'AddressParser.{p.stem}' for p in (ROOT / 'AddressParser').glob('test_*.py'))
    tests = list(flatten(unittest.defaultTestLoader.loadTestsFromNames(modules)))
    if not TRAIN.is_file():
        skipped = [t for t in tests if t.id().rsplit('.', 1)[-1] in TRAIN_TESTS]
        tests = [t for t in tests if t not in skipped]
        print(f'Пропущено {len(skipped)}: нет {TRAIN.relative_to(ROOT).as_posix()} (передаётся отдельно, 6000 строк)\n')
    result = unittest.TextTestRunner(verbosity=1).run(unittest.TestSuite(tests))
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main())
