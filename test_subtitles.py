import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

# Import without creating the user's real download directory.
spec = importlib.util.spec_from_file_location('helper', Path(__file__).with_name('videohub_helper.py'))
h = importlib.util.module_from_spec(spec)
with patch.object(Path, 'mkdir'):
    spec.loader.exec_module(h)


class SubtitleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name)
        self.patches = [patch.object(h, 'DOWNLOAD_ROOT', self.out),
                        patch.object(h, 'package_version', return_value='test'),
                        patch.object(h, 'ffmpeg_available', return_value=True)]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)

    def test_selection_validation(self):
        track = {'language': 'en-orig', 'source': 'auto'}
        self.assertEqual(h.validate_subtitle_tracks([track, track]), [track])
        for bad in ([{'language': 'en.*', 'source': 'auto'}], {}, [None],
                    [{'language': 'live_chat', 'source': 'auto'}]):
            with self.assertRaises(ValueError):
                h.validate_subtitle_tracks(bad)

    def test_source_and_exact_language_flags(self):
        from yt_dlp import parse_options, YoutubeDL
        for source in ('manual', 'auto'):
            cmd = h.subtitle_command('youtube', 'https://www.youtube.com/watch?v=test', False,
                                     track={'source': source, 'language': 'en-orig'})
            opts = parse_options(cmd[3:]).ydl_opts
            self.assertEqual(opts['writesubtitles'], source == 'manual')
            self.assertEqual(opts['writeautomaticsub'], source == 'auto')
            with YoutubeDL({**opts, 'quiet': True}) as ydl:
                formats = {'en-orig': [{'ext': 'vtt'}], 'en': [{'ext': 'vtt'}]}
                selected = ydl.process_subtitles('test', formats, formats)
                self.assertEqual(list(selected), ['en-orig'])
            self.assertTrue(opts['ignore_no_formats_error'])

    def test_list_metadata_and_translation(self):
        info = {'subtitles': {'en': [{'name': 'English', 'url': 'https://example.com'}]},
                'automatic_captions': {'en-orig': [{'name': 'English', 'url': 'https://example.com'}],
                                      'zh-Hans': [{'url': 'https://example.com?tlang=zh-Hans'}],
                                      'live_chat': [{'url': 'https://example.com'}]}}
        with patch.object(h.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=json.dumps(info))):
            tracks = h.list_subtitle_tracks('youtube', 'https://www.youtube.com/watch?v=test', False)
        self.assertEqual(len(tracks), 3)
        self.assertEqual(tracks[-1]['language'], 'zh-Hans')
        self.assertTrue(tracks[-1]['translated'])

    def test_default_prefers_original_auto(self):
        tracks = [{'language': 'en', 'source': 'auto', 'translated': True},
                  {'language': 'en-orig', 'source': 'auto', 'translated': False}]
        file = self.out / 'test.srt'
        file.write_text('subtitle', encoding='utf-8')
        with patch.object(h, 'list_subtitle_tracks', return_value=tracks), patch.object(h, 'execute', return_value=(0, [], [file])) as execute:
            ok, _ = h.optional_subtitles('test', 'youtube', 'url', False)
        self.assertTrue(ok)
        cmd = execute.call_args.args[1]
        self.assertEqual(cmd[cmd.index('--sub-langs') + 1], r'en\-orig')

    def test_no_file_is_failure_even_with_zero_exit(self):
        with patch.object(h, 'execute', return_value=(0, [], [])):
            ok, _ = h.optional_subtitles('test', 'youtube', 'url', False,
                                        [{'language': 'en', 'source': 'auto'}])
        self.assertFalse(ok)

    def test_one_failed_track_does_not_block_next(self):
        file = self.out / 'test.srt'
        file.write_text('subtitle', encoding='utf-8')
        tracks = [{'language': 'zh-Hans', 'source': 'auto'}, {'language': 'en-orig', 'source': 'auto'}]
        with patch.object(h, 'execute', side_effect=[(1, ['HTTP Error 429'], []),
                                                   (1, ['HTTP Error 429'], []), (0, [], [file])]) as execute:
            ok, message = h.optional_subtitles('test', 'youtube', 'url', False, tracks)
        self.assertFalse(ok)
        self.assertEqual(execute.call_count, 3)
        self.assertIn('en-orig/auto', message)
        self.assertIn('429', message)

    def test_media_success_survives_subtitle_exception(self):
        h.jobs['test'] = {}
        with patch.object(h, 'execute', return_value=(0, [], [])), patch.object(h, 'list_subtitle_tracks', side_effect=RuntimeError('metadata failed')):
            h.run_download('test', 'youtube', 'url', 'video', False, True)
        self.assertEqual(h.jobs['test']['state'], 'done')
        self.assertIn('metadata failed', h.jobs['test']['warning'])

    def test_execute_reads_existing_subtitle_marker(self):
        from io import StringIO
        file = self.out / 'existing.srt'
        file.write_text('subtitle', encoding='utf-8')
        marker = 'VH_SUBTITLE:' + json.dumps({'zh': {'filepath': str(file)}})
        process = SimpleNamespace(stdout=StringIO(marker + '\n'), wait=lambda: 0)
        with patch.object(h.subprocess, 'Popen', return_value=process):
            code, _, sources = h.execute('test', ['fixture'], 'subtitle', self.out)
        self.assertEqual(code, 0)
        self.assertEqual(sources, [file])

    def test_native_language_fallback(self):
        tracks = [{'language': 'zh', 'source': 'auto', 'translated': False}]
        file = self.out / 'test.srt'
        file.write_text('subtitle', encoding='utf-8')
        with patch.object(h, 'list_subtitle_tracks', return_value=tracks), patch.object(h, 'execute', return_value=(0, [], [file])) as execute:
            ok, _ = h.optional_subtitles('test', 'youtube', 'url', False)
        self.assertTrue(ok)
        cmd = execute.call_args.args[1]
        self.assertEqual(cmd[cmd.index('--sub-langs') + 1], 'zh')

    def test_real_ytdlp_local_subtitle_pipeline(self):
        # Inline subtitle data exercises yt-dlp and file detection without network.
        info = {'id': 'fixture', 'title': 'fixture', 'extractor': 'generic',
                'extractor_key': 'Generic', 'webpage_url': 'https://example.com/video',
                'formats': [{'format_id': 'test', 'url': 'https://example.com/video.mp4', 'ext': 'mp4'}],
                'subtitles': {'zh': [{'ext': 'vtt', 'data': 'WEBVTT\n\n00:00.000 --> 00:02.000\nManual caption\n'}]},
                'automatic_captions': {'zh': [{'ext': 'vtt', 'data': 'WEBVTT\n\n00:00.000 --> 00:02.000\nAuto caption\n'}]}}
        fixture = self.out / 'info.json'
        fixture.write_text(json.dumps(info), encoding='utf-8')
        for source in ('manual', 'auto'):
            track = {'language': 'zh', 'source': source}
            cmd = h.subtitle_command('youtube', 'unused', False, track=track)
            cmd = cmd[:-1] + ['--load-info-json', str(fixture)]
            code, tail, paths = h.execute('fixture', cmd, 'fixture', h.platform_dir('youtube'))
            self.assertEqual(code, 0, tail)
            self.assertTrue(any(p.exists() or p.with_suffix('.srt').exists() for p in paths), paths)
            files = list(h.platform_dir('youtube').glob('*.' + source + '.zh.srt'))
            self.assertEqual(len(files), 1)
            self.assertIn(source.title() + ' caption', files[0].read_text(encoding='utf-8-sig'))

    def test_short_link(self):
        self.assertEqual(h.clean_url_for_platform('youtube', 'https://youtu.be/abcdefghijk?t=2'),
                         'https://www.youtube.com/watch?v=abcdefghijk')


if __name__ == '__main__':
    unittest.main()
