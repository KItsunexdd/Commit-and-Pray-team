import json
import time
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.service import FIELDS, utf16_offsets

ROOT = Path(__file__).resolve().parents[1]
KEYS = ['id', 'raw_address', *FIELDS, 'confidence']
SAMPLE = 'город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70'


class ApiControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = TestClient(create_app())
        cls.client = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)

    def test_health_after_start(self):
        self.assertEqual(self.client.get('/api/health').json()['status'], 'ok')

    def test_sample_matches_organizers_output(self):
        records = json.loads((ROOT / 'Samples/sample_input.json').read_text(encoding='utf-8'))
        expected = json.loads((ROOT / 'Samples/sample_output.json').read_text(encoding='utf-8'))
        answer = self.client.post('/api/parse/batch', json=records).json()
        self.assertEqual(len(answer), len(expected))
        for got, want in zip(answer, expected):
            self.assertEqual(list(got), KEYS)
            self.assertEqual({k: got[k] for k in KEYS if k != 'confidence'}, {k: want[k] for k in KEYS if k != 'confidence'})
            self.assertTrue(0 <= got['confidence'] <= 1)

    def test_batch_formats_order_and_duplicate_ids(self):
        records = [{'id': 'same', 'raw_address': SAMPLE}, {'id': 'same', 'raw_address': 'Туран 55/6 магазин береке 4подьезд 9этаж'},
                   {'id': 'x', 'raw_address': ''}]
        plain = self.client.post('/api/parse/batch', json=records).json()
        wrapped = self.client.post('/api/parse/batch', json={'records': records}).json()
        upload = self.client.post('/api/parse/batch', files={'file': ('input.json', json.dumps(records).encode(), 'application/json')}).json()
        self.assertEqual(plain, wrapped)
        self.assertEqual(plain, upload)
        self.assertEqual([r['id'] for r in plain], ['same', 'same', 'x'])
        self.assertEqual([r['raw_address'] for r in plain], [r['raw_address'] for r in records])
        self.assertEqual(plain[1]['house'], '55/6')
        self.assertIsNone(plain[2]['city'])

    def test_bad_records_still_get_an_answer(self):
        answer = self.client.post('/api/parse/batch', json=[{'id': 'a'}, 'строка', {'id': 'b', 'raw_address': 'x' * 20000}]).json()
        self.assertEqual(len(answer), 3)
        self.assertEqual([list(r) for r in answer], [KEYS] * 3)
        self.assertEqual(answer[2]['raw_address'], 'x' * 20000)

    def test_rejects_non_json_and_wrong_shape(self):
        self.assertEqual(self.client.post('/api/parse/batch', content=b'not json').status_code, 422)
        self.assertEqual(self.client.post('/api/parse/batch', json={'items': []}).status_code, 422)
        self.assertEqual(self.client.post('/api/ui/parse', json={'records': [{'id': 1, 'raw_address': 'x'}]}).status_code, 422)

    def test_ui_spans_use_utf16_positions(self):
        raw = '📦 Алматы, ул. Абая 10'
        item = self.client.post('/api/ui/parse', json={'records': [{'id': 'r', 'raw_address': raw}]}).json()['items'][0]
        units = raw.encode('utf-16-le')
        pieces = {s['field']: units[2 * s['start']:2 * s['end']].decode('utf-16-le') for s in item['explain']['spans']}
        self.assertEqual(pieces['city'], 'Алматы')
        self.assertEqual(pieces['street_name'], 'Абая')
        self.assertEqual(pieces['house'], '10')
        self.assertEqual(list(item['result']), KEYS)

    def test_ui_sources_mark_dictionary_district(self):
        item = self.client.post('/api/ui/parse', json={'records': [{'id': 'r', 'raw_address': SAMPLE}]}).json()['items'][0]
        self.assertEqual(item['result']['district'], 'Ауэзовский')
        self.assertEqual(item['explain']['sources']['district'], 'dictionary')
        self.assertEqual(item['explain']['sources']['street_name'], 'string')

    def test_info_has_real_counts(self):
        info = self.client.get('/api/info').json()
        counts = info['gazetteer']['counts']
        self.assertEqual(counts['regions'], 20)
        self.assertGreater(counts['streets'], 50_000)
        self.assertTrue(all(isinstance(v, int) for v in counts.values()))
        self.assertIsInstance(info['metrics'], list)

    def test_thousand_records_are_fast(self):
        records = [{'id': str(i), 'raw_address': f'г. Астана, ул. Кенесары {i % 90 + 1}, кв {i % 200 + 1}'} for i in range(1000)]
        started = time.perf_counter()
        answer = self.client.post('/api/parse/batch', json=records).json()
        self.assertEqual(len(answer), 1000)
        self.assertLess(time.perf_counter() - started, 30)

    def test_web_interface_is_served(self):
        if not (ROOT / 'web/dist/index.html').is_file():
            self.skipTest('нет сборки web/dist')
        page = self.client.get('/')
        self.assertEqual(page.status_code, 200)
        self.assertIn('<div id="root">', page.text)

    def test_docs_work_offline(self):
        page = self.client.get('/api/docs').text
        self.assertNotIn('cdn.jsdelivr', page)
        self.assertNotIn('fastapi.tiangolo.com', page)
        self.assertIn('/api/static/swagger/swagger-ui-bundle.js', page)
        self.assertEqual(self.client.get('/api/static/swagger/swagger-ui-bundle.js').status_code, 200)
        self.assertEqual(self.client.get('/api/static/swagger/swagger-ui.css').status_code, 200)

    def test_openapi_describes_request_bodies(self):
        spec = self.client.get('/api/openapi.json').json()
        batch = spec['paths']['/api/parse/batch']['post']
        self.assertIn('application/json', batch['requestBody']['content'])
        self.assertIn('multipart/form-data', batch['requestBody']['content'])
        example = batch['requestBody']['content']['application/json']['example']
        self.assertEqual(len(self.client.post('/api/parse/batch', json=example).json()), len(example))
        result = batch['responses']['200']['content']['application/json']['schema']['items']
        self.assertEqual(result['required'], KEYS)

    def test_body_size_limit(self):
        import app.main as main
        original = main.MAX_BODY_BYTES
        main.MAX_BODY_BYTES = 100
        try:
            response = self.client.post('/api/parse/batch', json=[{'id': str(i), 'raw_address': 'Алматы, Абая 10'} for i in range(20)])
            self.assertEqual(response.status_code, 413)
        finally:
            main.MAX_BODY_BYTES = original

    def test_parser_failure_is_logged_and_isolated(self):
        import app.service as service
        original = service.parse_address
        def flaky(text):
            if 'сбой' in text:
                raise RuntimeError('проверка журнала')
            return original(text)
        service.parse_address = flaky
        try:
            with self.assertLogs('jana_address', level='ERROR') as logs:
                answer = self.client.post('/api/parse/batch', json=[{'id': 'a', 'raw_address': 'сбой'}, {'id': 'b', 'raw_address': SAMPLE}]).json()
        finally:
            service.parse_address = original
        self.assertIn('№1', logs.output[0])
        self.assertIsNone(answer[0]['city'])
        self.assertEqual(answer[1]['district'], 'Ауэзовский')

    def test_lone_surrogate_does_not_break_batch(self):
        records = [{'id': str(i), 'raw_address': 'Алматы, ул. Абая 10'} for i in range(999)] + [{'id': 'x\ud800', 'raw_address': '\ud800'}]
        body = json.dumps(records).encode('ascii')
        response = self.client.post('/api/parse/batch', content=body, headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status_code, 200)
        answer = json.loads(response.content.decode('ascii'))
        self.assertEqual(len(answer), 1000)
        self.assertEqual(answer[-1]['id'], 'x\ud800')
        self.assertEqual(answer[-1]['raw_address'], '\ud800')
        self.assertEqual(answer[0]['street_name'], 'Абая')
        ui = self.client.post('/api/ui/parse', content=json.dumps({'records': [{'id': 'u', 'raw_address': 'Алматы \ud800'}]}).encode('ascii'),
                              headers={'Content-Type': 'application/json'})
        self.assertEqual(ui.status_code, 200)

    def test_chunked_multipart_respects_body_limit(self):
        import app.main as main
        original = main.MAX_BODY_BYTES
        main.MAX_BODY_BYTES = 2048
        boundary = 'jana-test-boundary'
        payload = json.dumps([{'id': str(i), 'raw_address': 'Алматы, ул. Абая 10'} for i in range(100)]).encode()
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.json"\r\n'
                f'Content-Type: application/json\r\n\r\n').encode() + payload + f'\r\n--{boundary}--\r\n'.encode()

        def chunks():
            for start in range(0, len(body), 500):
                yield body[start:start + 500]
        try:
            response = self.client.post('/api/parse/batch', content=chunks(), headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
            self.assertEqual(response.status_code, 413)
        finally:
            main.MAX_BODY_BYTES = original
        small = self.client.post('/api/parse/batch', files={'file': ('s.json', json.dumps([{'id': 'a', 'raw_address': SAMPLE}]).encode(), 'application/json')})
        self.assertEqual(small.status_code, 200)

    def test_pathological_long_address_is_fast(self):
        for raw in ['г. ' * 1365, 'А' * 4096, ' ' * 600 + SAMPLE]:
            started = time.perf_counter()
            answer = self.client.post('/api/parse/batch', json=[{'id': 'p', 'raw_address': raw}]).json()
            self.assertLess(time.perf_counter() - started, 3)
            self.assertEqual(answer[0]['raw_address'], raw)

    def test_utf16_offsets(self):
        self.assertEqual(utf16_offsets('a📦b'), [0, 1, 3, 4])


if __name__ == '__main__':
    unittest.main()
