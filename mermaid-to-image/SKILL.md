---
name: mermaid-to-image
description: Mermaid 記法の図（flowchart / sequenceDiagram / erDiagram / gantt など）を PNG 画像に変換する。「mermaidを画像にして」「この図をPNGで」「Slackに貼れる画像にして」「Confluenceに貼りたいから画像化して」「この md の図を書き出して」と言われたら必ず使う。Claude が会話中に書いた mermaid をその場で描画して見た目を確かめたいとき、mermaid が表示されない場所（Slack・Confluence・Google Docs・スライド）へ図を持っていくとき、PR や Issue に図を画像で貼るときも、画像化を明示的に頼まれていなくても使ってよい。
---

# Mermaid → 画像

`@mermaid-js/mermaid-cli`（`mmdc`）を `npx` 経由で使う。グローバルインストールは不要で、初回だけパッケージ取得に数秒かかる。

## 基本コマンド

```bash
npx -y @mermaid-js/mermaid-cli -i <input> -o <output.png> -s 2
```

- `-s 2`: 2 倍解像度。既定の 1 倍だと Retina 画面や Slack のプレビューでぼやけるため
- 背景は既定で白。`-b transparent` は頼まれない限り使わない（ダークモードの Slack/GitHub で黒線が背景に溶けるため）
- ダークモードにしてと言われたら `-t dark -b '#1e1e1e'` を足す。`-b` を省くと背景が白のままになり、明るい線と文字が見えなくなる
- SVG が欲しいと言われたら拡張子を `.svg` にするだけでよい

## 入力の扱い

| 入力 | やること |
|---|---|
| 会話中の mermaid コード | コードをそのまま `.mmd` に書き出して渡す（```` ```mermaid ```` のフェンスは外す） |
| `.mmd` ファイル | そのまま `-i` に渡す |
| `.md` ファイル | そのまま `-i` に渡す。中の mermaid ブロックごとに `<output>-1.png`, `<output>-2.png` … が出る |

## 出力先

- ユーザーが指定したらそこ
- 元ファイルがあるならその隣（`docs/flow.md` → `docs/flow-1.png`）
- 会話中のコードだけなら scratchpad（なければ `/tmp`）。ファイル名は図の内容がわかる名前にする（`diagram.png` ではなく `auth-flow.png`）

## 生成後に必ず目で見る

生成した PNG を Read ツールで開いて確認する。mmdc は構文が通れば描画を終えるが、それは「読める図」を保証しない。見るポイント:

- ラベルの切れ・重なり、日本語の文字化け
- 日本語ラベルの末尾 1〜2 文字だけが次の行に落ちる（「〜をSlackへ」の「へ」だけ改行など）→ 折り返し幅を広げて描き直す。`echo '{"flowchart":{"wrappingWidth":400}}' > cfg.json` を作り `-c cfg.json` を足す
- 横に長すぎて縮小表示で潰れる（`LR` で 8 ノード超など）→ `TD` に変えるか、ユーザーに提案する
- 意図した分岐・矢印の向きになっているか

問題があれば直して再生成する。図の意味を変える修正（ノードの削除・統合など）はユーザーに確認してから。

## 構文エラーのとき

mmdc は `Parse error on line N` を出して止まる。よくある原因:

- ラベル内の `()` `[]` `{}` `"` `:` → ラベルを `"..."` で囲む（例: `A["関数 foo()"]`）
- `end` という単語のノード ID（flowchart で予約語）→ `End` や `end_` にする
- sequenceDiagram のメッセージ中の `;` や `#`

エラー行を読んで直し、再実行する。

## 生成後の渡し方

- ファイルパスをユーザーに伝える。`SendUserFile` ツールが使えるならそれで画像を見せる
- PR / Issue に貼る用途なら `gh-image-upload` スキルに引き継いで URL を発行する。ただし GitHub の Markdown は mermaid をそのまま描画するので、PR 本文なら画像化せず ```` ```mermaid ```` ブロックのままでよい場合が多い。画像にする理由（Slack にも流す、描画崩れを避けたい等）がなければそれを一言伝える
