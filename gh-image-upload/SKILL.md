---
name: gh-image-upload
description: "ローカルの画像を GitHub の user-attachments へアップロードし、PR・issue・Markdown に貼れる URL を発行する。「このスクショを PR に貼って」「最新のスクショをアップして」「動作確認の証跡を PR に載せて」「画像の URL 出して」と言われたら必ず使う。ユーザーのスクリーンショットは ~/Desktop に保存されるため、「最新のスクショ」「さっき撮ったやつ」と言われたら ~/Desktop の更新時刻順で特定する。PR やレビュー用ドキュメントへ画像を貼る文脈では、URL 発行を明示的に頼まれていなくても起動してよい。"
allowed-tools: "Read, Bash"
---

# GitHub 画像アップロード

ローカルの画像ファイルを GitHub の `user-attachments` へアップロードし、`https://github.com/user-attachments/assets/<uuid>` 形式の URL を発行する。PR 本文・PR コメント・issue・リポジトリ内の Markdown のどこにでも貼れる。

## スクリーンショットの場所

macOS のスクリーンショットは `~/Desktop` に保存される。ファイル名は `スクリーンショット 2026-09-24 18.27.36.png` の形式。

「最新のスクショ」「さっきの画像」「最新2枚」と言われたら、更新時刻の降順で特定する。

```bash
ls -lt ~/Desktop/ | head -5
```

名前に空白と日本語が入るのでクォートを忘れないこと。枚数の指定がなければ何枚を指しているか確認する。連続して撮った複数枚を1つの証跡として扱う場面が多いので、直近の複数枚が同じ作業のものである可能性を考える。

## 手順

### 1. 画像の中身を必ず見る

アップロードは外部へコンテンツを出す操作なので、**何を送るか分からないまま実行しない**。Read ツールで開いて内容を確認する。

これは形式的な確認ではない。確認する目的は2つある。

**意図した画像かの確認。** 連続で撮ったスクショは時刻が近く、取り違えやすい。「応募完了画面」のつもりが直前のエラー画面だった、といった取り違えは中身を見ないと気づけない。

**個人情報の検出。** 氏名・メールアドレス・電話番号・住所・生年月日が写り込んでいたら、貼る前にユーザーへ伝える。検証環境のデータがマスクされているかは環境によって異なり、同じ画面でもマスクされている場合とされていない場合がある。写っていた場合は、伏せてから撮り直すか、その部分を黒塗りするかをユーザーに選んでもらう。

見つけたときは黙って進めず、「Slack 通知に電話番号が写っています。実番号ですか」のように具体的に指摘する。

### 2. 意味のあるファイル名に変える

アップロード時のファイル名がそのまま GitHub 側の添付名になる。`スクリーンショット 2026-09-24 18.27.36.png` のままだと後から何の画像か分からないので、内容が分かる名前を付けてから送る。

作業用ディレクトリへコピーしてリネームする。scratchpad が指定されていればそこを使う。

```bash
cp ~/Desktop/"スクリーンショット 2026-09-24 18.27.36.png" "$SP/qa01-case2-slack.png"
```

### 3. アップロードする

`ghimgupl` は `~/.zshrc` に定義された関数。非対話シェルでは読み込まれないので `source` してから呼ぶ。

```bash
zsh -c 'source ~/.zshrc >/dev/null 2>&1; ghimgupl <file> <owner/repo>'
```

第2引数を省略すると cwd の git リポジトリから推定する。リポジトリ外から実行するときは明示する。複数枚まとめて送るときはループで回す。

```bash
zsh -c 'source ~/.zshrc >/dev/null 2>&1; for f in a.png b.png; do ghimgupl "$f" medley-inc/job-medley; done'
```

成功すると URL だけが1行で返る。

### 4. 貼り付け用のタグを組み立てる

`<img>` タグで幅を指定すると、原寸が大きい画像も読みやすく収まる。`width` は実寸に近い値にする。

```bash
sips -g pixelWidth ~/Desktop/"スクリーンショット 2026-09-24 18.27.36.png"
```

```html
<img width="1239" alt="qa01 ケース2 応募完了画面" src="https://github.com/user-attachments/assets/84ac410b-20eb-43c0-80c9-f3c41b9e8fb4" />
```

`alt` は「どのケースの何の画面か」が分かる日本語にする。画像が表示されない環境や、後からファイルを探すときの手がかりになる。

Markdown 記法 `![alt](url)` でも表示されるが、幅を制御できないので `<img>` を推奨する。

## ghimgupl が使えないとき

別マシンや関数が壊れている場合は、同じことを直接実行できる。リポジトリ配下から実行する。

```bash
REPO=medley-inc/job-medley
RID=$(gh api "repos/$REPO" --jq .id)
TOKEN=$(gh auth token)
NAME=$(printf '%s' "$(basename "$FILE")" | jq -sRr @uri)
curl -s "https://uploads.github.com/user-attachments/assets?name=$NAME&content_type=image/png&repository_id=$RID" \
  -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" --data-binary "@$FILE"
```

`content_type` は拡張子に合わせる（`image/png` / `image/jpeg` / `image/gif` / `image/webp`）。

## つまずきやすい点

**`gh repo view` が失敗する。** リポジトリ外で第2引数を省略したときに起きる。`owner/repo` を明示するか、リポジトリ配下へ移動する。

**403 / SAML エラー。** トークンの SSO 認可が切れている。エラーメッセージ中の SSO URL をユーザーに開いてもらう。`gh auth status` で認証状態を確認できる。

**ファイル名の空白で壊れる。** `ghimgupl` 側は URL エンコードしているが、シェルでパスを渡す時点のクォートは呼び出し側の責任。日本語ファイル名は必ずクォートする。

## 発行済み URL の性質

一度発行した URL は貼り直しても同じものが使える。同じ画像を PR とドキュメントの両方に載せるなら、アップロードは1回でよい。

削除の手段は用意されていないので、**送ってしまった画像は取り消せない前提**で扱う。だから手順1の確認が効いてくる。
