# pending review の API 手順

SKILL.md の「C. Review」の pending review を、ファイル単位のコメントや後からの追加・更新に広げる手順。

## 要点

- REST の `POST /pulls/{N}/reviews`（`event` 省略で PENDING）は行コメント（`line` / `start_line`）だけを受け付ける。`subject_type: file` を含めると 422
- ファイル単位のコメントを pending に入れるには GraphQL `addPullRequestReviewThread` に `subjectType: FILE` を渡す。同じ mutation で行コメントの追加もできる
- pending review は 1 PR につき 1 ユーザー 1 個。存在中に REST の `POST /pulls/{N}/comments` を叩くと「one pending review per pull request」で 422 になる
- pending のコメントは GraphQL `updatePullRequestReviewComment` で本文更新、`deletePullRequestReviewComment` で削除できる。本人が UI で編集した分もそのまま残る
- 行コメントは作成時の commit に紐づく。本人が commit を積んでファイルが変わったら、そのファイルの行コメントは削除して付け直す（更新では位置を動かせない）

## 1. 行コメントで pending review を作る

```bash
REPO=owner/repo; PR=123
SHA=$(gh pr view $PR --json headRefOid -q .headRefOid)
cat > review.json <<JSON
{"commit_id":"$SHA","comments":[
  {"path":"src/a.ts","line":42,"side":"RIGHT","body":"📌 ..."},
  {"path":"src/b.ts","start_line":10,"start_side":"RIGHT","line":15,"side":"RIGHT","body":"📌 ..."}
]}
JSON
gh api repos/$REPO/pulls/$PR/reviews --method POST --input review.json -q '"\(.id) \(.state)"'
# → 5309451731 PENDING
```

行コメントが 0 件でファイルコメントだけ付けたいときは、`comments` を空配列にして pending review を先に作る。

## 2. ファイル単位のスレッドを pending に足す

review の node_id を取り、GraphQL で追加する。

```bash
NID=$(gh api repos/$REPO/pulls/$PR/reviews/$REVIEW_ID -q .node_id)
gh api graphql \
  -f query='mutation($rid:ID!,$path:String!,$body:String!){
    addPullRequestReviewThread(input:{pullRequestReviewId:$rid, path:$path, body:$body, subjectType:FILE}){ thread { id } } }' \
  -f rid="$NID" -f path="src/a.ts" -f body="なぜこのファイルが変わったか"
```

行コメントを後から足すときは `line` / `startLine`（`Int`）と `side:RIGHT` / `startSide:RIGHT` を渡す。`gh api graphql` で整数は `-F`、文字列は `-f`。

## 3. 一覧・更新・削除

```bash
# 一覧（id, path, line, body）
gh api graphql -f query='{ node(id:"'$NID'"){ ... on PullRequestReview {
  state comments(first:100){ totalCount nodes { id path line startLine body } } } } }'

# 更新
gh api graphql -f query='mutation($id:ID!,$body:String!){
  updatePullRequestReviewComment(input:{pullRequestReviewCommentId:$id, body:$body}){ pullRequestReviewComment { id } } }' \
  -f id="$COMMENT_NODE_ID" -f body="..."

# 削除
gh api graphql -f query='mutation($id:ID!){ deletePullRequestReviewComment(input:{id:$id}){ clientMutationId } }' -f id="$COMMENT_NODE_ID"
```

`line` が null で返るコメントはファイル単位か、diff が変わって outdated になったもの。

## 4. 自分のコメントと本人のコメントを区別する

pending review は本人も UI で編集・追記する。一括更新の前に一覧を dump し、自分が書いた本文（先頭の 📌 や既知の文面）に一致するものだけを対象にする。一致しないものは触らず、報告に「触っていない」と書く。

## 5. 日本語見出しのアンカーを検証する

GitHub のアンカーは「小文字化 → 記号を削除（`.` `（` `）` `：` `、` など）→ 空白を `-`」。例：`### 1-4. エッジケース: 管理顧客が…` → `#1-4-エッジケース-管理顧客が…`。

生成したアンカーは描画結果と突合する。

```bash
P=$(python3 -c "import urllib.parse;print(urllib.parse.quote('docs/path/日本語.md'))")
gh api -H "Accept: application/vnd.github.html" "repos/$REPO/contents/$P?ref=$BRANCH" \
  | grep -o 'id="user-content-[^"]*"' \
  | python3 -c "import sys,urllib.parse;[print(urllib.parse.unquote(l.strip())) for l in sys.stdin]"
```

`user-content-` の後ろがアンカー。リンク先のファイルがブランチに無い（git 管理から外された等）と 404 になるので、その場合は文中説明に置き換える。

## 6. PR 本文の mermaid とリンクを検証する

```bash
gh api -H "Accept: application/vnd.github.html+json" repos/$REPO/issues/$PR -q .body_html \
  | grep -o '<pre lang="mermaid"[^>]*>\|href="https://github.com/[^"]*"' | sort | uniq -c
```

`<pre lang="mermaid">` が出れば mermaid ブロックとして認識されている（描画はクライアント側）。

## 7. `scripts/pending_review.py`

上記 1〜4 を 1 本にしたもの。`--help` を参照。

```bash
# JSON から pending review を作る（行コメント → REST、ファイルコメント → GraphQL）
python3 <skill>/scripts/pending_review.py create --pr 123 --json comments.json
# 現在の pending review を JSON で出す（本人の編集分も含む）
python3 <skill>/scripts/pending_review.py dump --pr 123 > current.json
# 更新・削除・追加をまとめて適用
python3 <skill>/scripts/pending_review.py apply --pr 123 --json edits.json
```

`comments.json` の形式：

```json
{"comments": [
  {"path": "src/a.ts", "subject_type": "file", "body": "..."},
  {"path": "src/b.ts", "line": 42, "body": "📌 ..."},
  {"path": "src/c.ts", "start_line": 10, "line": 15, "body": "📌 ..."}
]}
```

`edits.json` の形式：

```json
{"update": [{"id": "PRRC_...", "body": "..."}],
 "delete": ["PRRC_..."],
 "add": [{"path": "src/d.ts", "line": 7, "body": "..."}]}
```
