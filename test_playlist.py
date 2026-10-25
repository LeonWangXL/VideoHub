import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from test_subtitles import h

URL = 'https://www.youtube.com/watch?v=9LKJ8JdLtfI&list=PLO_DkCSmTKMPrqKZDSrq9scXhcyrcib8E&index=2'

class PlaylistTests(unittest.TestCase):
    def test_proxy_arguments(self):
        for proxy, expected in [(None, []), ('', ['--proxy', '']),
                                ('http://127.0.0.1:17891', ['--proxy', 'http://127.0.0.1:17891'])]:
            with patch.dict(h.CONFIG, {'proxy': proxy}):
                self.assertEqual(h.proxy_arguments(), expected)
        for proxy in [True, 'ftp://127.0.0.1:80', 'http://localhost:invalid']:
            with patch.dict(h.CONFIG, {'proxy': proxy}), self.assertRaises(ValueError):
                h.proxy_arguments()

    def test_proxy_error_hint(self):
        message = h.network_error_message("Unable to connect to proxy: WinError 10061")
        self.assertIn('config.json', message)
        self.assertNotIn('urllib3', message)
        self.assertEqual(h.tail_message(['ProxyError: refused']), h.network_error_message('ProxyError: refused'))

    def test_proxy_applies_to_all_commands(self):
        with patch.dict(h.CONFIG, {'proxy': 'http://127.0.0.1:17891'}), patch.object(h, 'package_version', return_value='test'), patch.object(h, 'platform_dir', return_value=Path('fixture')):
            for command in [h.common_command('youtube', False), h.media_command('youtube', 'https://www.youtube.com/watch?v=9LKJ8JdLtfI', 'video', False), h.subtitle_command('youtube', 'https://www.youtube.com/watch?v=9LKJ8JdLtfI', False)]:
                self.assertEqual(command[command.index('--proxy') + 1], 'http://127.0.0.1:17891')

    def test_playlist_url(self):
        self.assertEqual(h.playlist_url(URL), 'https://www.youtube.com/playlist?list=PLO_DkCSmTKMPrqKZDSrq9scXhcyrcib8E')
        for url in ['http://www.youtube.com/playlist?list=abc', 'https://youtube.com.evil.test/playlist?list=abc', 'https://www.youtube.com/watch?v=abc']:
            with self.assertRaises(ValueError):
                h.playlist_url(url)

    def test_list(self):
        proc = SimpleNamespace(returncode=0, stdout=json.dumps({'title': 'fixture', 'entries': [None, {'id': '9LKJ8JdLtfI', 'title': 'test'}, {'id': '../bad'}]}))
        with patch.object(h, 'common_command', return_value=['yt-dlp', '--no-playlist']), patch.object(h.subprocess, 'run', return_value=proc) as run:
            result = h.list_playlist(URL, False)
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['items'][0]['index'], 2)
        self.assertIn('--yes-playlist', run.call_args.args[0])

    def test_batch_validation(self):
        self.assertEqual(len(h.validate_batch_urls([URL, URL])), 1)
        for urls in [[], ['https://x.com/test/status/123'], ['file:///test'], [None]]:
            with self.assertRaises(ValueError):
                h.validate_batch_urls(urls)

    def test_batch_progress_does_not_finish_parent_early(self):
        h.jobs['parent-test'] = {'state': 'downloading'}
        h.jobs['child-test'] = {'parent_id': 'parent-test', 'batch_index': 1, 'batch_total': 2}
        try:
            h.update_job('child-test', state='done', message='subtitle saved', percent='100%')
            self.assertEqual(h.jobs['parent-test']['state'], 'downloading')
            self.assertIn('1/2', h.jobs['parent-test']['message'])
        finally:
            h.jobs.pop('child-test', None)
            h.jobs.pop('parent-test', None)

    def test_batch_continues(self):
        h.jobs['batch-test'] = {}
        def download(child, platform, url, *args):
            h.update_job(child, state='error' if url == 'bad' else 'done', message=url)
        try:
            with patch.object(h, 'run_download', side_effect=download), patch.object(h, 'platform_dir', return_value='fixture'):
                h.run_batch('batch-test', ['bad', 'good'], 'video', False, True, None)
            result = h.jobs['batch-test']
            self.assertEqual([r['state'] for r in result['results']], ['error', 'done'])
            self.assertEqual(result['state'], 'error')
        finally:
            h.jobs.pop('batch-test', None)

if __name__ == '__main__':
    unittest.main()
