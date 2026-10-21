import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const usage = "使い方: node serve.mjs steps.json [--port N --token UUID]";
const [file, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i += 2) opts[rest[i]] = rest[i + 1];
const badArgs =
	!file ||
	rest.length % 2 !== 0 ||
	Object.keys(opts).some((key) => !["--port", "--token"].includes(key)) ||
	(opts["--port"] !== undefined && !/^[1-9]\d{3,4}$/.test(opts["--port"])) ||
	(opts["--token"] !== undefined && !/^[0-9a-f-]{36}$/.test(opts["--token"]));
if (badArgs) {
	console.error(usage);
	process.exit(1);
}

const data = JSON.parse(await readFile(file, "utf8"));
const text = (value) => typeof value === "string" && value.trim() !== "";
const line = (value) =>
	value === undefined || (Number.isInteger(value) && value >= 1);
const validRef = (ref) =>
	ref === undefined ||
	(ref &&
		typeof ref.path === "string" &&
		isAbsolute(ref.path) &&
		line(ref.start) &&
		line(ref.end) &&
		(ref.end === undefined ||
			(ref.start !== undefined && ref.start <= ref.end)));
const valid =
	data &&
	text(data.title) &&
	Array.isArray(data.steps) &&
	data.steps.length > 0 &&
	data.steps.every(
		(step) =>
			text(step?.text) &&
			(step.detail === undefined || text(step.detail)) &&
			validRef(step.ref),
	) &&
	(data.summary === undefined || text(data.summary));
if (!valid) {
	console.error(
		'steps.json の形式: {"title":"…","steps":[{"text":"…","detail":"…(任意)","ref":{"path":"/絶対パス","start":1,"end":9}(任意)}],"summary":"…(任意)"}',
	);
	process.exit(1);
}
// 書き間違えたパスは、読み手がボタンを押す前に気づけるよう起動時に落とす。
for (const { ref } of data.steps) {
	if (ref === undefined) continue;
	const info = await stat(ref.path).catch(() => null);
	if (!info?.isFile()) {
		console.error("ref のファイルが見つかりません: " + ref.path);
		process.exit(1);
	}
}

const safeJSON = (value) =>
	JSON.stringify(value)
		.replace(/</g, "\\u003c")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>expseq</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
<style>
:root { --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; --card: #fff; --line: #e7e5e4; --ok: #15803d; --ng: #b45309; --dispute: #be123c; --accent: #2563eb; --mark: #fef3c7; }
@media (prefers-color-scheme: dark) { :root { --bg: #1c1917; --fg: #f5f5f4; --muted: #a8a29e; --card: #292524; --line: #44403c; --ok: #4ade80; --ng: #fbbf24; --dispute: #fb7185; --accent: #60a5fa; --mark: #3f3412; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.7 system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 20px; margin: 0 0 16px; }
ol { padding: 0; list-style: none; counter-reset: s; display: grid; gap: 12px; }
li { counter-increment: s; background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--line); border-radius: 8px; padding: 12px 14px; }
li[data-s="ok"] { border-left-color: var(--ok); }
li[data-s="ng"] { border-left-color: var(--ng); }
li[data-s="dispute"] { border-left-color: var(--dispute); }
.text { margin: 0; white-space: pre-wrap; }
.text::before { content: counter(s) ". "; font-weight: 700; }
.detail { margin: 8px 0 0; padding: 8px 10px; border-radius: 6px; background: var(--bg); white-space: pre-wrap; font-size: 14px; }
.row { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; margin-top: 8px; }
.row label { cursor: pointer; }
.actions { display: flex; gap: 6px; margin-left: auto; }
li.active { outline: 2px solid var(--accent); }
textarea { box-sizing: border-box; width: 100%; min-height: 2.6em; margin-top: 6px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: inherit; font: inherit; resize: vertical; }
button { padding: 4px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: inherit; font: inherit; cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; padding: 8px 20px; }
button:disabled { opacity: .5; cursor: default; }
code { font-size: .92em; padding: 0 4px; border-radius: 4px; background: var(--line); }
.summary { margin: 16px 0; padding: 10px 14px; border-radius: 8px; border: 1px dashed var(--line); }
#status { color: var(--muted); margin-left: 12px; }
#pane { position: fixed; display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); inset: auto 0 0 0; height: 55vh; }
#pane[hidden] { display: none; }
body.with-pane { padding-bottom: 55vh; }
@media (min-width: 1100px) {
  #pane { inset: 0 0 0 auto; width: 50vw; height: auto; }
  body.with-pane { padding: 0 50vw 0 0; }
}
#pane header { display: flex; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--line); font-size: 13px; }
#pane-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
#pane-body { flex: 1; overflow: auto; }
/* 行番号と範囲の帯を本文と揃えるため、行の高さを固定して折り返さない。 */
.code { position: relative; display: flex; min-width: max-content; font: 13px/20px ui-monospace, Menlo, monospace; }
.code pre { position: relative; margin: 0; padding: 8px 12px; }
.code .gutter { color: var(--muted); text-align: right; user-select: none; border-right: 1px solid var(--line); }
.code .src code, .code .src code.hljs { padding: 0; background: transparent; font: inherit; }
/* 帯は pre より前に置き、pre を relative にして文字の下に敷く。 */
.md { padding: 8px 20px 24px; font-size: 14px; }
.md > .blk, .md li { padding-left: 8px; margin-left: -8px; }
.md pre { overflow: auto; padding: 8px; border-radius: 6px; background: var(--bg); }
.md pre code { padding: 0; background: transparent; }
.md table { border-collapse: collapse; }
.md th, .md td { border: 1px solid var(--line); padding: 2px 8px; }
.md img { max-width: 100%; }
.md .hit { background: var(--mark); box-shadow: inset 3px 0 var(--accent); }
.code .mark { position: absolute; left: 0; right: 0; background: var(--mark); }
</style>
</head>
<body>
<main><h1 id="title"></h1><ol id="steps"></ol><p class="summary" id="summary" hidden></p>
<p><button class="primary" id="send">セッションに送信</button><span id="status" role="status"></span></p></main>
<aside id="pane" hidden><header><span id="pane-title"></span><button class="free" id="pane-mode" type="button" hidden></button><button class="free" id="pane-close" type="button">閉じる</button></header><div id="pane-body"></div></aside>
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
// 該当箇所の表示は送信中も使えるよう、free の付いたボタンは止めない。
const setBusy = busy => document.querySelectorAll('button:not(.free)').forEach(b => { b.disabled = busy; });
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
const pane = document.getElementById('pane');
const paneBody = document.getElementById('pane-body');
const LINE_HEIGHT = 20;
const PAD_TOP = 8;
const languageOf = path => ({ md: 'markdown', ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', json: 'json' })[path.split('.').pop().toLowerCase()];
const closePane = () => {
  pane.hidden = true;
  document.body.classList.remove('with-pane');
  document.querySelector('li.active')?.classList.remove('active');
};
const paneMode = document.getElementById('pane-mode');
// 表示中の ref と本文。ソースとプレビューの切り替えでファイルを読み直さないために持つ。
let shown = null;
const rangeOf = ref => ({ start: ref.start, end: ref.end ?? ref.start });
const overlaps = (from, to, range) => range.start !== undefined && from <= range.end && to >= range.start;
// 字句解析の raw を順につなぐと元の文書になるので、改行の数で次のブロックの開始行が決まる。
const newlines = text => text.split('\\n').length - 1;
const spanOf = (from, raw) => ({ to: from + newlines(raw.replace(/\\n+$/, '')), next: from + newlines(raw) });
const scrollPaneTo = node => {
  paneBody.scrollTop = node ? node.getBoundingClientRect().top - paneBody.getBoundingClientRect().top + paneBody.scrollTop - 3 * LINE_HEIGHT : 0;
};
const renderSource = (ref, source) => {
  const { start, end } = rangeOf(ref);
  const lines = source.split('\\n');
  const code = el('code');
  const language = languageOf(ref.path);
  // highlight.js を読めないとき（オフラインなど）と対象外の拡張子は、色なしで出す。
  if (language && window.hljs?.getLanguage(language)) code.innerHTML = hljs.highlight(source, { language, ignoreIllegals: true }).value;
  else code.textContent = source;
  const box = el('div', { className: 'code' });
  const top = start ? PAD_TOP + (start - 1) * LINE_HEIGHT : 0;
  if (start) {
    box.append(el('div', { className: 'mark', style: 'top:' + top + 'px;height:' + (end - start + 1) * LINE_HEIGHT + 'px' }));
  }
  const src = el('pre', { className: 'src' });
  src.append(code);
  box.append(el('pre', { className: 'gutter', textContent: lines.map((_, n) => n + 1).join('\\n') }), src);
  paneBody.replaceChildren(box);
  paneBody.scrollTop = start ? top - 3 * LINE_HEIGHT : 0;
};
// marked の字句解析が持つ各ブロックの元の文字列から行範囲を数え、指定範囲と重なるブロックに印を付ける。
// 精度はブロック単位で、リストだけは項目単位まで分ける。
const renderPreview = (ref, source) => {
  const range = rangeOf(ref);
  const tokens = marked.lexer(source);
  const toHtml = token => DOMPurify.sanitize(marked.parser(Object.assign([token], { links: tokens.links })));
  const box = el('div', { className: 'md' });
  let line = 1;
  for (const token of tokens) {
    const from = line;
    const { to, next } = spanOf(from, token.raw);
    line = next;
    if (token.type === 'space') continue;
    const block = el('div', { className: 'blk', innerHTML: toHtml(token) });
    if (token.type === 'list') {
      const items = block.querySelectorAll(':scope > ul > li, :scope > ol > li');
      let itemLine = from;
      token.items.forEach((item, k) => {
        const span = spanOf(itemLine, item.raw);
        if (overlaps(itemLine, span.to, range)) items[k]?.classList.add('hit');
        itemLine = span.next;
      });
    } else if (overlaps(from, to, range)) {
      block.classList.add('hit');
    }
    box.append(block);
  }
  box.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  if (window.hljs) box.querySelectorAll('pre code').forEach(code => hljs.highlightElement(code));
  paneBody.replaceChildren(box);
  scrollPaneTo(box.querySelector('.hit'));
};
// プレビューは marked と DOMPurify の両方を読めたときだけ出す。無害化できないまま HTML を入れない。
const canPreview = ref => languageOf(ref.path) === 'markdown' && window.marked !== undefined && window.DOMPurify !== undefined;
const renderShown = () => {
  const { ref, source, preview } = shown;
  paneMode.hidden = !canPreview(ref);
  paneMode.textContent = preview ? 'ソース表示' : 'プレビュー';
  if (preview) renderPreview(ref, source);
  else renderSource(ref, source);
};
paneMode.onclick = () => { shown.preview = !shown.preview; renderShown(); };
const showRef = async (i, ref) => {
  document.querySelector('li.active')?.classList.remove('active');
  document.getElementById('s' + (i + 1)).classList.add('active');
  const { start, end } = rangeOf(ref);
  // 長いパスは先頭側を省略したいので枠は右から左にし、中身は bdi で左から右に戻して記号の並びを崩さない。
  document.getElementById('pane-title').replaceChildren(el('bdi', { dir: 'ltr', textContent: ref.path + (start ? ':' + start + (end !== start ? '-' + end : '') : '') }));
  document.getElementById('pane-title').title = ref.path;
  pane.hidden = false;
  document.body.classList.add('with-pane');
  paneMode.hidden = true;
  let source;
  try {
    const res = await fetch('file/' + (i + 1), { cache: 'no-store' });
    if (!res.ok) throw new Error();
    source = await res.text();
  } catch { paneBody.textContent = 'ファイルを読めませんでした。サーバーが止まっている可能性があります。'; return; }
  shown = { ref, source, preview: canPreview(ref) };
  renderShown();
};
document.getElementById('pane-close').onclick = closePane;
const hint = { '': '自由入力（任意）', ok: '自分の理解を書くと確認してもらえる（任意）', dispute: 'どこに異論があるか・その理由（任意）', ng: 'どこがわからないか・質問（任意）' };

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
  for (const [value, label] of [['ok', '理解した'], ['dispute', '異論がある'], ['ng', 'わからない']]) {
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
    status.textContent = 'ステップ' + (i + 1) + 'について書いています…';
    // 選択と自由入力も一緒に送り、理解の確認や質問への答えを説明欄で受け取れるようにする。
    try { await post('explain', { step: i + 1, ...state[i] }); } catch { status.textContent = sendError; setBusy(false); return; }
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
  const actions = el('span', { className: 'actions' });
  if (step.ref) {
    const refButton = el('button', { type: 'button', className: 'free', textContent: '該当箇所を表示' });
    refButton.onclick = () => showRef(i, step.ref);
    actions.append(refButton);
  }
  actions.append(explain);
  row.append(actions);
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
const token = opts["--token"] ?? randomUUID();
const base = "/" + token + "/";
const label = {
	ok: "理解した",
	dispute: "異論がある",
	ng: "わからない",
	"": "未回答",
};
const validAnswer = (a) => a && a.s in label && typeof a.note === "string";
const answerLine = (n, a) =>
	`${n} ${label[a.s]}${a.note.trim() === "" ? "" : "：" + a.note.trim()}`;
const server = createServer((req, res) => {
	if (req.method === "GET" && req.url === base) {
		res.writeHead(200, {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		});
		return res.end(html);
	}
	if (req.method === "GET" && req.url === base + "data") {
		res.writeHead(200, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
		});
		return res.end(JSON.stringify(data));
	}
	const fileMatch =
		req.method === "GET" && req.url.startsWith(base + "file/")
			? req.url.slice(base.length + 5).match(/^[1-9]\d*$/)
			: null;
	const refPath = fileMatch && data.steps[Number(fileMatch[0]) - 1]?.ref?.path;
	// 読むのは steps.json の ref に書かれたファイルだけ。ページから任意のパスは渡させない。
	if (refPath) {
		return readFile(refPath, "utf8").then(
			(source) => {
				res.writeHead(200, {
					"content-type": "text/plain; charset=utf-8",
					"cache-control": "no-store",
				});
				res.end(source);
			},
			() => res.writeHead(404).end(),
		);
	}
	const route =
		req.method === "POST" && req.url.startsWith(base)
			? req.url.slice(base.length)
			: null;
	if (route !== "answers" && route !== "explain")
		return res.writeHead(404).end();
	let body = "";
	req.setEncoding("utf8");
	req.on("data", (chunk) => {
		body += chunk;
		if (body.length > 1e6) req.destroy();
	});
	req.on("end", () => {
		let input;
		try {
			input = JSON.parse(body);
		} catch {}
		let output;
		if (
			route === "explain" &&
			Number.isInteger(input?.step) &&
			input.step >= 1 &&
			input.step <= data.steps.length &&
			validAnswer(input)
		) {
			output = `--- 説明依頼 ---\n${answerLine(input.step, input)}\n再開オプション：--port ${server.address().port} --token ${token}`;
		}
		const answersOk =
			Array.isArray(input) &&
			input.length === data.steps.length &&
			input.every(validAnswer);
		if (route === "answers" && answersOk) {
			// 入力のない「理解した」は件数だけにして、セッションへ渡す量を抑える。
			const silent = input.flatMap((a, i) =>
				a.s === "ok" && a.note.trim() === "" ? [i + 1] : [],
			);
			const lines = input.flatMap((a, i) =>
				silent.includes(i + 1) ? [] : [answerLine(i + 1, a)],
			);
			output = [
				"--- 回答 ---",
				`理解した（入力なし）：${silent.length === 0 ? "なし" : silent.join(", ")}`,
				...lines,
			].join("\n");
		}
		if (output === undefined) return res.writeHead(400).end();
		res.end("ok", () => {
			console.log(output);
			server.close();
			server.closeAllConnections();
		});
	});
});
server.on("error", (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
server.on("listening", () =>
	console.log("回答待ち: http://127.0.0.1:" + server.address().port + base),
);
server.listen(Number(opts["--port"] ?? 0), "127.0.0.1");
