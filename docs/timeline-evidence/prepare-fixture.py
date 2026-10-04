from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parent
source = root.parent / 'site-timeline'
target = root / 'fixture-source'
if target.exists():
    raise SystemExit('fixture-source already exists; review it before replacing.')
for name in ['src/components/TimelineStudy.astro', 'src/local-pages/compare/timeline.astro']:
    if not (source / name).exists():
        raise SystemExit(f'Wait for UI source: {name}')
shutil.copytree(source, target, ignore=shutil.ignore_patterns('.git', 'node_modules', 'dist', '.astro', '.DS_Store', '*.log'))
(target / 'node_modules').symlink_to(source / 'node_modules', target_is_directory=True)
pages = target / 'src/pages/qa'
pages.mkdir(parents=True, exist_ok=True)
template = '''---
import Layout from '../../layouts/Layout.astro';
import TimelineStudy from '../../components/TimelineStudy.astro';
import candidates from '../../data/work-candidates.json';
import {{ timelineStudy }} from '../../lib/timeline-study.mjs';
const entries = {entries};
---
<Layout title="【合成検証】{label}" description="独立fixtureの表示確認。本人の記録や制作日ではありません。" section={{null}}>
  <p data-qa-fixture style="margin:1rem;padding:1rem;border:2px solid #60756b">
    【合成検証】{notice}
  </p>
  <TimelineStudy entries={{entries}} />
</Layout>
'''
fixtures = {
    'timeline-empty': dict(entries='timelineStudy([])', label='空の時間表示', notice='入力資料が0件の場合の表示です。通常の9件の資料を変更していません。'),
    'timeline-owner': dict(entries="timelineStudy(candidates, { 'glyph-matter': '2024-02-29' })", label='本人入力日の表示', notice='2024-02-29は表示検査用の日付です。実際の本人の制作日ではありません。公開コミット日の並びを変えないことを確認します。'),
}
for name, fields in fixtures.items():
    (pages / f'{name}.astro').write_text(template.format(**fields))
proof = {
    'scope': 'Isolated copy only. Additional routes are synthetic QA fixtures; no source content edits.',
    'files': {},
    'fixtureRoutes': [f'/qa/{name}/' for name in fixtures],
}
for name in ['src/components/TimelineStudy.astro', 'src/timeline/controller.mjs', 'src/lib/timeline-study.mjs', 'src/data/work-candidates.json', 'src/data/creation-dates.json']:
    data = (source / name).read_bytes()
    proof['files'][name] = hashlib.sha256(data).hexdigest()
    assert data == (target / name).read_bytes(), name
(root / 'fixture-source-manifest.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2))
print('Independent fixture source prepared; active source unchanged.')
