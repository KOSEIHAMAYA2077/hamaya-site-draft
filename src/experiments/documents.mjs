import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { build } from 'vite';

const css = `
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;padding:16px;background:#f5f6ee;color:#29382f;font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif;font-size:14px;line-height:1.6}button,select{font:inherit;color:inherit;border:1px solid #a5aea0;border-radius:5px;background:#fffef8;min-height:44px;padding:8px 12px}button{cursor:pointer;touch-action:manipulation}button:hover{background:#e8edda}button:active,button[data-held]{background:#d6e6a4}button:focus-visible,select:focus-visible,canvas:focus-visible{outline:3px solid #406a61;outline-offset:3px}button#replay{background:#dce9b2;border-color:#879960}header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;color:#596556;font-size:12px}.settings{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}.settings label{display:grid;gap:4px;font-size:12px;flex:1;min-width:100px}canvas{display:block;width:100%;height:auto;border:1px solid #c4cbbb;border-radius:6px}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}.directions{display:flex;gap:8px;justify-content:center}.directions button{min-width:48px;touch-action:none;font-size:18px}.directions.clock{display:grid;grid-template-columns:repeat(3,48px);grid-template-areas:". up ." "left down right"}.directions.clock button[data-direction=up]{grid-area:up}.directions.clock button[data-direction=left]{grid-area:left}.directions.clock button[data-direction=right]{grid-area:right}.directions.clock button[data-direction=down]{grid-area:down}#stats{font-variant-numeric:tabular-nums;font-size:12px;min-height:20px;margin:10px 0 4px}#status{font-size:12px;min-height:40px;margin:0;color:#53634d}.input-hint{font-size:12px;text-align:center;margin:8px 0 0;color:#596556}@media(max-width:360px){body{padding:12px}button,select{padding:8px}header{font-size:11px}}
`.trim();
const digest = (content) =>
  createHash('sha256').update(content).digest('base64');
let documentsPromise;

function documentFor(id, script) {
  const clock = id === 'clock';
  const mode = clock
    ? '<option value="movement">移動量で進む</option><option value="realtime">連続時間で進む</option>'
    : '<option value="generated">反応あり</option><option value="rigid">反応を固定</option>';
  const preset = clock
    ? '<label>再生中の停止<select id="preset"><option value="short">1秒</option><option value="long">3秒</option></select></label>'
    : '';
  const directionButtons = (
    clock ? ['up', 'left', 'down', 'right'] : ['left', 'right']
  )
    .map((direction) => {
      const labels = {
        up: ['↑', '上'],
        left: ['←', '左'],
        down: ['↓', '下'],
        right: ['→', '右'],
      };
      return `<button type="button" data-direction="${direction}" aria-label="${labels[direction][1]}へ（押し続ける）">${labels[direction][0]}</button>`;
    })
    .join('');
  const policy = `default-src 'none'; script-src 'sha256-${digest(script)}'; style-src 'sha256-${digest(css)}'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>${clock ? '動いた分だけ、時間に' : '動きから、傾きと遅れ'} — ローカル試作</title><style>${css}</style></head><body data-experiment="${id}" data-running="false" data-frame-count="0"><header><span>シドの試作（AI）</span><span>${clock ? 'action-clock' : 'motion-reaction'}</span></header><div class="settings"><label>${clock ? '時計' : '表示'}<select id="mode">${mode}</select></label>${preset}</div><canvas width="700" height="${clock ? '410' : '290'}" tabindex="0" role="img" aria-label="${clock ? '移動する円、壁と往復する障害の盤面。方向キーまたは下の方向ボタンで操作。' : '左右に動く図形と荷物。左右キーまたは下の方向ボタンで操作。'}"></canvas><p id="stats"></p><p id="status" role="status"></p><div class="actions"><button type="button" id="replay">同じ入力を再生</button><button type="button" id="pause">続ける</button><button type="button" id="step">再生を1コマ</button><button type="button" id="reset">初期位置へ</button></div><div class="directions ${clock ? 'clock' : ''}" role="group" aria-label="方向を押し続けて動く">${directionButtons}</div><p class="input-hint">${clock ? '矢印 / WASD' : '← → / A D'}・方向ボタンは長押し・Escで停止</p><pre id="experiment-state" hidden></pre><script>${script}</script></body></html>`;
}

/** Build isolated, offline srcdoc documents; called only by the local experiment route. */
export async function experimentDocuments() {
  documentsPromise ??= (async () => {
    const result = await build({
      configFile: false,
      envFile: false,
      root: resolve(process.cwd(), 'src/experiments'),
      publicDir: false,
      logLevel: 'silent',
      mode: 'production',
      build: {
        write: false,
        sourcemap: false,
        minify: true,
        lib: {
          entry: resolve(process.cwd(), 'src/experiments/runtime.mjs'),
          name: 'IsolatedExperiment',
          formats: ['iife'],
        },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(
      (item) => item.output,
    );
    if (
      outputs.length !== 1 ||
      outputs[0].type !== 'chunk' ||
      outputs[0].imports.length ||
      outputs[0].dynamicImports.length
    )
      throw new Error('Experiment runtime must be one self-contained script.');
    const script = outputs[0].code.trim();
    if (/<\/script/i.test(script) || /sourceMappingURL/.test(script))
      throw new Error('Experiment runtime has an unsafe inline boundary.');
    return Object.freeze({
      motion: documentFor('motion', script),
      clock: documentFor('clock', script),
    });
  })();
  return documentsPromise;
}
