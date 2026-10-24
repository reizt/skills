---
name: pr-comments
description: GitHub PR のコメント CRUD を `gh api` ベースで行うときの作法集。 PR には「conversation コメント (issue 系)」「review コメント (file/line に紐付く)」「review (review コメントを束ねる)」の 3 種があり、それぞれエンドポイントが違う。 PR にコメントを投稿/編集/削除/一覧したい、特定の file または line にコメントしたい、レビューを残したい、複数 review コメントを一括削除したい、下書き (pending review) として作って後から自分で Finish your review したい、`gh pr comment` / `gh pr review` の使い分けで迷っているときに使う。
---

# PR コメント CRUD

GitHub PR のコメントは **3 系統**ある。混同するとエンドポイントを間違える。

| 種類 | どこに付く | エンドポイント |
|---|---|---|
| **conversation コメント** | PR 全体のスレッド (Files changed タブではない) | `/repos/{O}/{R}/issues/{N}/comments` ※ "issues" |
| **review コメント** | 特定 file または file:line | `/repos/{O}/{R}/pulls/{N}/comments` |
| **review** | review コメントを束ねた 1 個のレビュー (Approve / Request changes / Comment) | `/repos/{O}/{R}/pulls/{N}/reviews` |

`gh pr comment` は conversation コメント専用。`gh pr review` は review 投稿用だが file 単位 (subject_type=file) を受け付けない。**file 単位や柔軟な操作は `gh api` を直接叩く** のが確実。

## 既定: pending review (下書き) で作る

**このスキルでコメントを作るときの既定は「pending review」**。本人が GitHub UI で内容を手直しし、「Finish your review」で一括投稿する運用を前提とする。

- コメントを作れと言われたら、明示がない限り **C の pending review** で作る (`event` を省略)。投稿はしない。
- 作成後は「Files changed タブで編集 → Finish your review で投稿してください」と伝える。
- **即時投稿してよいのは、ユーザーが明示的に投稿/公開/submit を許可したときだけ。** 「レビューして」「指摘出して」は投稿許可ではない。
- conversation コメント (A) と単発の review コメント (B) には下書き状態がない。**作った瞬間に公開される**ので、投稿許可がない限り使わない。

## 共通の前準備

```bash
# repo の owner/name (current dir の git remote から)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# PR 番号 (現ブランチに紐付くもの)
PR=$(gh pr view --json number -q .number)

# review コメント投稿に必要な commit SHA (PR 先端)
SHA=$(gh pr view "$PR" --json headRefOid -q .headRefOid)
```

以下のレシピは `$REPO` `$PR` `$SHA` が解決されている前提で書く。

---

## A. Conversation コメント (PR 全体スレッド)

### List
```bash
gh api "repos/$REPO/issues/$PR/comments" --paginate
# ID と body だけ:
gh api "repos/$REPO/issues/$PR/comments" --paginate -q '.[] | "\(.id)\t\(.user.login)\t\(.body[:60])"'
```
あるいは `gh pr view "$PR" --comments` でも閲覧可。

### Create
```bash
gh api "repos/$REPO/issues/$PR/comments" --method POST -f body="$BODY" -q .id
# 単発なら gh pr comment "$PR" -b "$BODY" でも同じ
```

### Update
```bash
gh api "repos/$REPO/issues/comments/$COMMENT_ID" --method PATCH -f body="$NEW_BODY"
```
※ パスに **PR 番号は入らない**。`issues/comments/{id}` 直叩き。

### Delete
```bash
gh api "repos/$REPO/issues/comments/$COMMENT_ID" --method DELETE
```

---

## B. Review コメント (file / file:line に紐付く)

### List
```bash
gh api "repos/$REPO/pulls/$PR/comments" --paginate \
  -q '.[] | "\(.id)\t\(.path)\t\(.line // "file")\t\(.body[:60])"'
```

### Create — file 単位 (行を指定しない)
```bash
gh api "repos/$REPO/pulls/$PR/comments" --method POST \
  -f commit_id="$SHA" \
  -f path="$PATH_REL" \
  -f subject_type=file \
  -f body="$BODY" \
  -q .id
```
`subject_type=file` を付けると `line` 不要で **ファイル単位**コメントになる (公式 API ドキュメント未記載だが GitHub UI と挙動は一致)。

### Create — 行単位 (1 行)
```bash
gh api "repos/$REPO/pulls/$PR/comments" --method POST \
  -f commit_id="$SHA" \
  -f path="$PATH_REL" \
  -F line="$LINE" \
  -f side=RIGHT \
  -f body="$BODY" \
  -q .id
```
- `side=RIGHT` は変更後の行 (LEFT は変更前)。新規追加コードへのコメントは RIGHT。
- `-F` は数値、`-f` は文字列 (gh の流儀)。

### Create — 複数行 (range)
```bash
gh api "repos/$REPO/pulls/$PR/comments" --method POST \
  -f commit_id="$SHA" \
  -f path="$PATH_REL" \
  -F start_line="$START" -f start_side=RIGHT \
  -F line="$END" -f side=RIGHT \
  -f body="$BODY"
```

### Reply — 既存 review コメントに返信
```bash
gh api "repos/$REPO/pulls/$PR/comments" --method POST \
  -F in_reply_to="$PARENT_COMMENT_ID" \
  -f body="$BODY"
```

### Update
```bash
gh api "repos/$REPO/pulls/comments/$COMMENT_ID" --method PATCH -f body="$NEW_BODY"
```

### Delete (単発)
```bash
gh api "repos/$REPO/pulls/comments/$COMMENT_ID" --method DELETE
```

### Delete (一括) — まず ID 列挙 → ループ
```bash
IDS=$(gh api "repos/$REPO/pulls/$PR/comments" --paginate -q '.[].id')
for id in $IDS; do
  gh api "repos/$REPO/pulls/comments/$id" --method DELETE -i 2>&1 | head -1
done
```

---

## C. Review (review コメント束 + 全体ステータス)

### Create — pending review (既定)
`event` を省略すると **PENDING** になり、GitHub UI に「Finish your review」が出る。投稿者本人にしか見えない。JSON ファイル経由が確実。

```bash
cat > /tmp/review.json <<JSON
{
  "commit_id": "$SHA",
  "comments": [
    {"path": "api/foo.rb", "subject_type": "file", "body": "この file 全体への所見"},
    {"path": "web/bar.tsx", "line": 42, "side": "RIGHT", "body": "L42 への指摘"},
    {"path": "web/bar.tsx", "start_line": 50, "start_side": "RIGHT", "line": 60, "side": "RIGHT", "body": "L50-60 への指摘"}
  ]
}
JSON
gh api "repos/$REPO/pulls/$PR/reviews" --method POST --input /tmp/review.json -q '.id, .state'
```

`state` が `PENDING` なら成功。`body` (全体所見) は pending では保持されないことがあるので、submit 時に渡すか各コメントに書く。

- **pending review は 1 PR につき 1 ユーザー 1 個まで。** REST では後から足せないが、GraphQL `addPullRequestReviewThread` (`pullRequestReviewId` に review の node_id) なら行単位・ファイル単位 (`subjectType: FILE`) とも pending に追加できる。更新は `updatePullRequestReviewComment`、削除は `deletePullRequestReviewComment`。手順は `references/pending-review.md`、まとめて作る・一覧・更新・削除するスクリプトは `scripts/pending_review.py`。
- REST の reviews API は `subject_type: file` を受け付けない (422)。ファイル単位を pending に入れたいときは上の GraphQL を使う。
- `gh` の認証ユーザー = ブラウザで見ているユーザーでないと下書きが見えない。

### Submit (投稿許可が出たときのみ)
```bash
gh api "repos/$REPO/pulls/$PR/reviews/$REVIEW_ID/events" --method POST \
  -f event=COMMENT -f body="$BODY"
```
`event` は `COMMENT` / `APPROVE` / `REQUEST_CHANGES`。

新規に直接投稿する場合は C の JSON に `"event": "COMMENT"` と `"body"` を足す。**ユーザーの明示的な許可があるときだけ。**

### Delete a pending review
```bash
gh api "repos/$REPO/pulls/$PR/reviews/$REVIEW_ID" --method DELETE
```

---

## 落とし穴

- `commit_id` は **PR の HEAD SHA** を使う。古い SHA を渡すと outdated として表示される (見落としやすい)。
- review コメントの **更新/削除 URL は `pulls/comments/{id}`** で `pulls/{N}/comments/{id}` ではない。conversation コメントも同じく `issues/comments/{id}`。
- `-f` は文字列、`-F` は number/bool/null/JSON リテラル扱い。`line=42` を `-f` で渡すと "42" 文字列になり API が 422 を返すことがある。
- 多数の review コメントを連投する場合は **review (C) として 1 リクエストにまとめる**ほうが UI 的にも 1 レビューにまとまり、後で一括削除しやすい。
- bulk delete 前に必ず ID リストを目視確認 (他人のコメントは消せない・消すべきでない)。`-q '.[] | select(.user.login == "自分") | .id'` で自分の分だけに絞るのが安全。
- 投稿済みレビューは取り消せない (pending の DELETE と違い、submit 後は各コメントを個別削除するしかない)。迷ったら pending のままにする。
