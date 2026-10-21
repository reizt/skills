import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const usage = '使い方: node serve.mjs steps.json [--port N --token UUID]';
const [file, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i += 2) opts[rest[i]] = rest[i + 1];
const badArgs = !file || rest.length % 2 !== 0
  || Object.keys(opts).some(key => !['--port', '--token'].includes(key))
  || (opts['--port'] !== undefined && !/^[1-9]\d{3,4}$/.test(opts['--port']))
  || (opts['--token'] !== undefined && !/^[0-9a-f-]{36}$/.test(opts['--token']));
if (badArgs) { console.error(usage); process.exit(1); }

const data = JSON.parse(await readFile(file, 'utf8'));
const text = value => typeof value === 'string' && value.trim() !== '';
const valid = data && text(data.title) && Array.isArray(data.steps) && data.steps.length > 0
  && data.steps.every(step => text(step?.text) && (step.detail === undefined || text(step.detail)))
  && (data.summary === undefined || text(data.summary));
if (!valid) {
  console.error('steps.json の形式: {"title":"…","steps":[{"text":"…","detail":"…(任意)"}],"summary":"…(任意)"}');
  process.exit(1);
}

const safeJSON = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>expseq</title>
<style>
:root { --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; --card: #fff; --line: #e7e5e4; --ok: #15803d; --ng: #b45309; --accent: #2563eb; }
@media (prefers-color-scheme: dark) { :root { --bg: #1c1917; --fg: #f5f5f4; --muted: #a8a29e; --card: #292524; --line: #44403c; --ok: #4ade80; --ng: #fbbf24; --accent: #60a5fa; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.7 system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 20px; margin: 0 0 16px; }
ol { padding: 0; list-style: none; counter-reset: s; display: grid; gap: 12px; }
li { counter-increment: s; background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--line); border-radius: 8px; padding: 12px 14px; }
li[data-s="ok"] { border-left-color: var(--ok); }
li[data-s="ng"] { border-left-color: var(--ng); }
.text { margin: 0; white-space: pre-wrap; }
.text::before { content: counter(s) ". "; font-weight: 700; }
.detail { margin: 8px 0 0; padding: 8px 10px; border-radius: 6px; background: var(--bg); white-space: pre-wrap; font-size: 14px; }
.row { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; margin-top: 8px; }
.row label { cursor: pointer; }
.row button { margin-left: auto; }
textarea { box-sizing: border-box; width: 100%; min-height: 2.6em; margin-top: 6px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: inherit; font: inherit; resize: vertical; }
button { padding: 4px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: inherit; font: inherit; cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; padding: 8px 20px; }
button:disabled { opacity: .5; cursor: default; }
code { font-size: .92em; padding: 0 4px; border-radius: 4px; background: var(--line); }
.summary { margin: 16px 0; padding: 10px 14px; border-radius: 8px; border: 1px dashed var(--line); }
#status { color: var(--muted); margin-left: 12px; }
</style>
</head>
<body>
<main><h1 id="title"></h1><ol id="steps"></ol><p class="summary" id="summary" hidden></p>
<p><button class="primary" id="send">セッションに送信</button><span id="status" role="status"></span></p></main>
<script type="application/json" id="data">${safeJSON(data)}</script>
<script>
const data = JSON.parse(document.getElementById('data').textContent);
const key = 'expseq:' + location.pathname;
let saved = [];
try { saved = JSON.parse(localStorage.getItem(key)) ?? []; } catch {}
const state = data.steps.map((_, i) => ({ s: saved[i]?.s ?? '', note: saved[i]?.note ?? '' }));
const persist = () => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} };
const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
// バッククォートで囲んだ部分だけ code にする。HTMLとしては解釈しない。
const rich = (node, text) => { text.split('\`').forEach((part, i) => node.append(i % 2 ? el('code', { textContent: part }) : part)); return node; };
const status = document.getElementById('status');
const setBusy = busy => document.querySelectorAll('button').forEach(b => { b.disabled = busy; });
const sendError = '送れませんでした。サーバーが止まっている可能性があります。';
const post = (path, body) => fetch(path, { method: 'POST', body: JSON.stringify(body) }).then(res => { if (!res.ok) throw new Error(); });
const details = [];
const showDetail = (i, text) => {
  const { node, button } = details[i];
  node.replaceChildren();
  if (text) rich(node, text);
  node.hidden = !text;
  button.textContent = text ? 'もっと説明' : '説明';
};
const hint = { '': '自由入力（任意）', ok: '自分の理解を書くと確認してもらえる（任意）', ng: 'どこがわからないか・質問（任意）' };

document.title = data.title;
document.getElementById('title').textContent = data.title;
if (data.summary) Object.assign(document.getElementById('summary'), { hidden: false }).append(rich(el('span'), 'まとめ：' + data.summary));
data.steps.forEach((step, i) => {
  const li = el('li', { id: 's' + (i + 1) });
  li.dataset.s = state[i].s;
  li.append(rich(el('p', { className: 'text' }), step.text));
  const detail = el('p', { className: 'detail' });
  li.append(detail);
  const note = el('textarea', { value: state[i].note, placeholder: hint[state[i].s] });
  note.oninput = () => { state[i].note = note.value; persist(); };
  const row = el('div', { className: 'row' });
  for (const [value, label] of [['ok', '理解した'], ['ng', 'わからない']]) {
    const radio = el('input', { type: 'radio', name: 'r' + i, value, checked: state[i].s === value });
    radio.onchange = () => { state[i].s = value; li.dataset.s = value; note.placeholder = hint[value]; persist(); };
    const choice = el('label');
    choice.append(radio, ' ' + label);
    row.append(choice);
  }
  const explain = el('button', { type: 'button' });
  details[i] = { node: detail, button: explain };
  showDetail(i, step.detail);
  explain.onclick = async () => {
    setBusy(true);
    status.textContent = 'ステップ' + (i + 1) + 'の説明を書いています…';
    try { await post('explain', { step: i + 1 }); } catch { status.textContent = sendError; setBusy(false); return; }
    // サーバーが説明を書き足して再起動したら、説明欄だけ差し替える。入力中の内容とスクロール位置は動かさない。
    const timer = setInterval(async () => {
      try {
        const res = await fetch('data', { cache: 'no-store' });
        if (!res.ok) return;
        const next = await res.json();
        clearInterval(timer);
        next.steps.forEach((s, j) => showDetail(j, s.detail));
        setBusy(false);
        status.textContent = 'ステップ' + (i + 1) + 'に説明を追加しました。';
      } catch {}
    }, 1500);
  };
  row.append(explain);
  li.append(row, note);
  document.getElementById('steps').append(li);
});
document.getElementById('send').onclick = async () => {
  setBusy(true);
  try { await post('answers', state); status.textContent = '送信しました。このタブは閉じて大丈夫です。'; }
  catch { status.textContent = sendError; setBusy(false); }
};
</script>
</body>
</html>
`;

// ほかのWebページからの送り込みを防ぐため、受け口をURL内の秘密のパスに置く。
// 説明依頼後の再起動では同じポートとパスを引き継ぎ、開いているページが新しい説明を取りに来られるようにする。
const token = opts['--token'] ?? randomUUID();
const base = '/' + token + '/';
const label = { ok: '理解した', ng: 'わからない', '': '未回答' };
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === base) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(html);
  }
  if (req.method === 'GET' && req.url === base + 'data') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(data));
  }
  const route = req.method === 'POST' && req.url.startsWith(base) ? req.url.slice(base.length) : null;
  if (route !== 'answers' && route !== 'explain') return res.writeHead(404).end();
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => {
    let input;
    try { input = JSON.parse(body); } catch {}
    let output;
    if (route === 'explain' && Number.isInteger(input?.step) && input.step >= 1 && input.step <= data.steps.length) {
      output = `--- 説明依頼 ---\nステップ${input.step}\n再開オプション：--port ${server.address().port} --token ${token}`;
    }
    const answersOk = Array.isArray(input) && input.length === data.steps.length
      && input.every(a => a && a.s in label && typeof a.note === 'string');
    if (route === 'answers' && answersOk) {
      // 入力のない「理解した」は件数だけにして、セッションへ渡す量を抑える。
      const silent = input.flatMap((a, i) => (a.s === 'ok' && a.note.trim() === '' ? [i + 1] : []));
      const lines = input.flatMap((a, i) => (silent.includes(i + 1) ? [] : [`${i + 1} ${label[a.s]}${a.note.trim() === '' ? '' : '：' + a.note.trim()}`]));
      output = ['--- 回答 ---', `理解した（入力なし）：${silent.length === 0 ? 'なし' : silent.join(', ')}`, ...lines].join('\n');
    }
    if (output === undefined) return res.writeHead(400).end();
    res.end('ok', () => { console.log(output); server.close(); server.closeAllConnections(); });
  });
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('listening', () => console.log('回答待ち: http://127.0.0.1:' + server.address().port + base));
server.listen(Number(opts['--port'] ?? 0), '127.0.0.1');
