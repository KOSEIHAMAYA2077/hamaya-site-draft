#!/usr/bin/env python3
"""Create an isolated synthetic site fixture from a pinned local Git snapshot.

No source checkout changes, dependencies/install, or network requests. PNGs stay
under /tmp. Source code and fixture reports may be kept in .dot/quiet-qa.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import random
import re
import struct
import subprocess
import tarfile
import zlib


FIXTURE_ROOT = Path('/tmp/hamaya-quiet-fixtures-20261004').resolve()
DIMENSIONS = [
    (320, 180), (480, 320), (640, 360), (768, 512), (900, 600),
    (1024, 768), (1200, 675), (1280, 720), (1440, 900), (1600, 900),
    (360, 640), (480, 800), (600, 900), (720, 1280), (800, 1200),
    (512, 512), (768, 768), (1024, 1024), (1500, 500), (500, 1500),
]
WORK_IDS = [
    'import-typeandsummon', 'import-game-ai-search-puzzles',
    'import-de10-nano-riscv-invader', 'import-de10-nano-voice-changer',
    'import-pong-study-raylib', 'import-one-board-incremental',
]
DISCLAIMER = 'これは表示と操作を検証するための合成データです。本人の制作物、経験、実績、発言を示しません。'
PARAGRAPH = (
    '検証用の文章です。長い日本語を読み進めたときに、行の折り返し、段落の間隔、見出しへの移動を確認します。'
    '画像の読み込み前後で本文の位置が変わるか、途中まで読んで別のページへ移動し、戻ったときに同じ場所を探せるかを見ます。'
    'ここに書かれている内容は試験のために機械的に組み立てたもので、個人の学習記録や作業結果ではありません。'
    '句読点、括弧（表示確認用）、英数字 abcXYZ0123456789 を混ぜています。'
)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def png_bytes(width, height, seed):
    """Deterministic RGB blocks: real raster bytes, no external image sources."""
    rng = random.Random(seed)
    scanlines = bytearray()
    row = b''
    for y in range(height):
        if y % 2 == 0:
            row = b''.join(bytes((rng.randrange(48, 224), rng.randrange(48, 224), rng.randrange(48, 224))) * 2
                           for _ in range((width + 1) // 2))[:width * 3]
        scanlines.extend(b'\x00' + row)

    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(scanlines), 6))
            + chunk(b'IEND', b''))


def markdown(meta, body):
    # JSON scalar/array literals are valid YAML and avoid quoting ambiguity.
    lines = []
    for key, value in meta.items():
        if isinstance(value, dict):
            lines.append(f'{key}:')
            lines.extend(f'  {k}: {json.dumps(v, ensure_ascii=False)}' for k, v in value.items())
        else:
            lines.append(f'{key}: {json.dumps(value, ensure_ascii=False)}')
    return '---\n' + '\n'.join(lines) + '\n---\n\n' + body.rstrip() + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--revision', default='HEAD')
    parser.add_argument('--target', type=Path, required=True)
    parser.add_argument('--report-dir', type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    target = args.target.resolve()
    if FIXTURE_ROOT not in target.parents or target == FIXTURE_ROOT:
        raise SystemExit('Target must be a fresh child of /tmp/hamaya-quiet-fixtures-20261004')
    if target.exists():
        raise SystemExit(f'Refusing to overwrite existing fixture: {target}')
    commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', args.revision + '^{commit}'], text=True).strip()
    archive = subprocess.check_output(['git', '-C', str(source), 'archive', '--format=tar', commit])
    target.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar:
        for member in tar.getmembers():
            member_path = (target / member.name).resolve()
            if target not in member_path.parents and member_path != target:
                raise SystemExit('Archive member escapes fixture root')
            if member.issym() or member.islnk():
                raise SystemExit('Unexpected archived symlink; refusing extraction')
        tar.extractall(target)
    dependency_root = (source / 'node_modules').resolve()
    if not dependency_root.is_dir():
        raise SystemExit('Existing node_modules is required; this generator never installs dependencies')
    (target / 'node_modules').symlink_to(dependency_root, target_is_directory=True)

    images = []
    image_root = target / 'public/images/fixture'
    image_root.mkdir(parents=True)
    for index, (width, height) in enumerate(DIMENSIONS, 1):
        relative = f'images/fixture/fixture-{index:02d}-{width}x{height}.png'
        payload = png_bytes(width, height, 2026100400 + index)
        (target / 'public' / relative).write_bytes(payload)
        images.append({'path': relative, 'width': width, 'height': height,
                       'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
    write_json(target / 'src/data/public-assets.json', [image['path'] for image in images])

    # Clearly mark the entire isolated copy. Do not alter layout/behavior code.
    site_path = target / 'src/data/site.json'
    site = json.loads(site_path.read_text(encoding='utf-8'))
    site['name'] = '検証用の仮サイト'
    site['description'] = DISCLAIMER
    site_path.write_text(json.dumps(site, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    note_records = []
    colors = ['赤', '青', '緑', '白']
    round_trip = {1, 2, 25, 50, 75, 100}
    for index in range(1, 101):
        slug = f'fixture-note-{index:03d}'
        tags = ['検証用', f'検索タグ-{colors[(index - 1) % 4]}', f'集合-{(index - 1) % 5 + 1}']
        if index in round_trip:
            tags.append('往復確認')
        title = f'【検証用】記録{index:03d}・ユニーク{index:03d}'
        if index == 1:
            title += '・長文と20枚の画像'
        elif index == 2:
            title += '・長い見出しの折り返しと日本語の読みやすさを確認するために文字数を増やした合成の題名'
        description = f'{DISCLAIMER} 記録{index:03d}、{tags[1]}、{tags[2]}の検索対象です。'
        if index == 1:
            description += ' 長文記事・多画像・関連記事からの往復を調べます。'
        body = DISCLAIMER + '\n\n[検証用の記事一覧へ](/notes/) / [検証用のfocusへ](/compare/focus/#piece-import-typeandsummon)\n\n'
        if index == 1:
            for section, image in enumerate(images, 1):
                body += f'## 検証用の区間{section:02d}・長文と画像\n\n'
                body += '\n\n'.join(f'合成段落{section:02d}-{p}。{PARAGRAPH}' for p in range(1, 5)) + '\n\n'
                body += f"![検証用の合成PNG {section:02d}、{image['width']}×{image['height']}ピクセル](/" + image['path'] + ')\n\n'
                body += f'### 検証用の小見出し{section:02d}\n\n{PARAGRAPH}\n\n'
            body += '## 検証用の末尾\n\n最後まで読んだ位置から戻る操作と再読込を確認します。これは本人の文章ではありません。\n\n'
        else:
            body += f'## 検証用の記録{index:03d}\n\n{PARAGRAPH}\n\n'
        body += '[検証用の多画像記事へ](/notes/fixture-note-001/) / [検証用の短い記事へ](/notes/fixture-note-002/)\n'
        meta = {'title': title, 'description': description, 'date': '2026-10-04', 'tags': tags,
                'draft': False, 'category': '学び' if index % 2 else '雑記'}
        text = markdown(meta, body)
        relative = f'src/content/notes/{slug}.md'
        (target / relative).write_text(text, encoding='utf-8')
        note_records.append({'id': slug, 'path': relative, 'characters': len(text),
                             'bodyCharacters': len(body), 'bytes': len(text.encode('utf-8')),
                             'category': meta['category'], 'tags': tags})

    work_records = []
    for index, work_id in enumerate(WORK_IDS, 1):
        relative = f'src/content/works/{work_id}.md'
        source_text = (target / relative).read_text(encoding='utf-8')
        repository = re.search(r"^repository: ['\"]?(https://[^'\"\s]+)", source_text, re.MULTILINE).group(1)
        description = DISCLAIMER + (PARAGRAPH * 12 if index == 1 else f' 比較画面の表示枠{index:02d}です。')
        # Preserve the fixed comparison ID and repository condition, replacing
        # every displayed claim. GitHub link destinations are outside this test.
        cover = images[10] if index == 1 else images[index - 2]
        meta = {'title': f'【検証用】作品表示枠{index:02d}・本人実績ではありません',
                'description': description, 'date': '2026-10-04', 'tags': ['検証用', '仮作品'],
                'draft': False, 'status': '記録', 'repository': repository,
                'cover': {'src': cover['path'], 'alt': f'検証用の合成表紙{index:02d}・人物や制作物の画像ではありません'}}
        body = DISCLAIMER + '\n\n固定された既存コード入口は比較処理の条件を保つために残しています。リンク先とこの合成文章に内容上の関係はありません。外部コード入口は検証対象外です。\n\n'
        body += '## 検証用の関連記事\n\n[長文と20枚の画像](/notes/fixture-note-001/) / [短い合成記事](/notes/fixture-note-002/)\n'
        text = markdown(meta, body)
        (target / relative).write_text(text, encoding='utf-8')
        work_records.append({'id': work_id, 'path': relative, 'descriptionCharacters': len(description),
                             'bytes': len(text.encode('utf-8')), 'cover': cover['path']})
    write_json(target / 'src/data/work-records.json', {
        WORK_IDS[0]: ['fixture-note-001', 'fixture-note-002', 'fixture-note-003'],
        WORK_IDS[1]: ['fixture-note-004'],
    })
    (target / 'FIXTURE-ONLY.txt').write_text(
        DISCLAIMER + '\nLocal QA only. Never deploy or copy generated content/images to the site repository.\n'
        f'Source commit: {commit}\nOnly six synthetic works and 100 synthetic notes have draft:false.\n'
        'Existing GitHub comparison URLs are retained as structural inputs; external navigation is out of scope.\n',
        encoding='utf-8')

    report = {'synthetic': True, 'neverPublish': True, 'source': str(source), 'sourceCommit': commit,
              'target': str(target), 'nodeModules': str(dependency_root), 'basePath': '/hamaya-site-draft',
              'notesCount': len(note_records), 'worksCount': len(work_records), 'imagesCount': len(images),
              'imagesTotalBytes': sum(image['bytes'] for image in images), 'images': images,
              'notes': note_records, 'works': work_records,
              'searchExamples': [{'query': '', 'expected': 100}, {'query': 'ユニーク001', 'expected': 1},
                                 {'query': '検索タグ-赤', 'expected': 25}, {'query': '往復確認', 'expected': 6},
                                 {'query': '集合-3', 'expected': 20}, {'query': '存在しない検索条件ZZZ', 'expected': 0}],
              'categoryExamples': {'学び': 50, '雑記': 50},
              'warnings': ['All generated texts/images are synthetic, not owner content.',
                           'Fixture draft:false is local QA authorization only.',
                           'PNG patterns are deterministic stress assets, not representative photos.',
                           'Existing GitHub comparison links must not be used as provenance for fixture text.',
                           'public-assets.json uses paths; image SHA256 values are recorded here; favicon is unchanged.']}
    report_path = args.report_dir.resolve() / f'fixture-{target.name}-sizes.json'
    write_json(report_path, report)
    print(json.dumps({'target': str(target), 'commit': commit, 'report': str(report_path),
                      'notes': len(note_records), 'works': len(work_records), 'images': len(images),
                      'imagesTotalBytes': report['imagesTotalBytes']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
