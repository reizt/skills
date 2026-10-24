#!/usr/bin/env python3
"""pending review にコメントをまとめて付ける。

gh CLI の認証ユーザーで動く。REST が受け付けない「ファイル単位」のコメントは GraphQL で足す。

  create --pr N --json comments.json   行コメントで pending review を作り、ファイルコメントを GraphQL で追加
  dump   --pr N                        pending review のコメントを JSON で出力（id / path / line / startLine / body）
  apply  --pr N --json edits.json      update / delete / add をまとめて適用
  delete-review --pr N                 pending review ごと削除（本人の編集分も消える）

comments.json: {"comments": [{"path", "subject_type": "file" | (省略), "line", "start_line", "body"}]}
edits.json:    {"update": [{"id", "body"}], "delete": ["id"], "add": [同上の要素]}
"""

import argparse
import json
import subprocess
import sys


def sh(args, input_text=None):
    r = subprocess.run(args, capture_output=True, text=True, input=input_text)
    if r.returncode != 0:
        sys.exit(f"command failed: {' '.join(args)}\n{r.stdout}{r.stderr}")
    return r.stdout


def gql(query, **vars):
    args = ["gh", "api", "graphql", "-f", f"query={query}"]
    for k, v in vars.items():
        args += (["-F", f"{k}={v}"] if isinstance(v, int) else ["-f", f"{k}={v}"])
    return json.loads(sh(args))


def repo_and_head(pr):
    repo = sh(["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).strip()
    sha = sh(["gh", "pr", "view", str(pr), "--json", "headRefOid", "-q", ".headRefOid"]).strip()
    return repo, sha


def find_pending_review(repo, pr):
    reviews = json.loads(sh(["gh", "api", f"repos/{repo}/pulls/{pr}/reviews", "--paginate"]))
    me = sh(["gh", "api", "user", "-q", ".login"]).strip()
    pending = [r for r in reviews if r["state"] == "PENDING" and r["user"]["login"] == me]
    return pending[0] if pending else None


def add_thread(review_node_id, c):
    if c.get("subject_type") == "file":
        q = ("mutation($rid:ID!,$path:String!,$body:String!){ addPullRequestReviewThread("
             "input:{pullRequestReviewId:$rid, path:$path, body:$body, subjectType:FILE}){ thread { id } } }")
        return gql(q, rid=review_node_id, path=c["path"], body=c["body"])
    if "start_line" in c:
        q = ("mutation($rid:ID!,$path:String!,$body:String!,$line:Int!,$start:Int!){ addPullRequestReviewThread("
             "input:{pullRequestReviewId:$rid, path:$path, body:$body, line:$line, startLine:$start, "
             "side:RIGHT, startSide:RIGHT}){ thread { id } } }")
        return gql(q, rid=review_node_id, path=c["path"], body=c["body"], line=int(c["line"]), start=int(c["start_line"]))
    q = ("mutation($rid:ID!,$path:String!,$body:String!,$line:Int!){ addPullRequestReviewThread("
         "input:{pullRequestReviewId:$rid, path:$path, body:$body, line:$line, side:RIGHT}){ thread { id } } }")
    return gql(q, rid=review_node_id, path=c["path"], body=c["body"], line=int(c["line"]))


def cmd_create(a):
    repo, sha = repo_and_head(a.pr)
    if find_pending_review(repo, a.pr) is not None:
        sys.exit("pending review が既にあります。apply で足すか delete-review で消してください。")
    comments = json.load(open(a.json))["comments"]
    lines = [c for c in comments if c.get("subject_type") != "file"]
    files = [c for c in comments if c.get("subject_type") == "file"]
    rest_comments = []
    for c in lines:
        d = {"path": c["path"], "line": int(c["line"]), "side": "RIGHT", "body": c["body"]}
        if "start_line" in c:
            d.update({"start_line": int(c["start_line"]), "start_side": "RIGHT"})
        rest_comments.append(d)
    payload = json.dumps({"commit_id": sha, "comments": rest_comments}, ensure_ascii=False)
    review = json.loads(sh(["gh", "api", f"repos/{repo}/pulls/{a.pr}/reviews", "--method", "POST", "--input", "-"], payload))
    node_id = review["node_id"]
    for c in files:
        add_thread(node_id, c)
    print(json.dumps({"review_id": review["id"], "node_id": node_id, "state": review["state"],
                      "line_comments": len(lines), "file_comments": len(files)}, ensure_ascii=False))


def cmd_dump(a):
    repo, _ = repo_and_head(a.pr)
    review = find_pending_review(repo, a.pr)
    if review is None:
        sys.exit("pending review がありません。")
    q = ('{ node(id:"%s"){ ... on PullRequestReview { state comments(first:100){ totalCount '
         'nodes { id path line startLine body } } } } }' % review["node_id"])
    node = gql(q)["data"]["node"]
    print(json.dumps({"review_node_id": review["node_id"], "state": node["state"],
                      "comments": node["comments"]["nodes"]}, ensure_ascii=False, indent=1))


def cmd_apply(a):
    repo, _ = repo_and_head(a.pr)
    review = find_pending_review(repo, a.pr)
    if review is None:
        sys.exit("pending review がありません。create を先に実行してください。")
    edits = json.load(open(a.json))
    for e in edits.get("update", []):
        gql("mutation($id:ID!,$body:String!){ updatePullRequestReviewComment("
            "input:{pullRequestReviewCommentId:$id, body:$body}){ pullRequestReviewComment { id } } }",
            id=e["id"], body=e["body"])
    for cid in edits.get("delete", []):
        gql("mutation($id:ID!){ deletePullRequestReviewComment(input:{id:$id}){ clientMutationId } }", id=cid)
    for c in edits.get("add", []):
        add_thread(review["node_id"], c)
    print(json.dumps({"updated": len(edits.get("update", [])), "deleted": len(edits.get("delete", [])),
                      "added": len(edits.get("add", []))}))


def cmd_delete_review(a):
    repo, _ = repo_and_head(a.pr)
    review = find_pending_review(repo, a.pr)
    if review is None:
        sys.exit("pending review がありません。")
    sh(["gh", "api", f"repos/{repo}/pulls/{a.pr}/reviews/{review['id']}", "--method", "DELETE"])
    print("deleted", review["id"])


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name, fn, needs_json in [("create", cmd_create, True), ("dump", cmd_dump, False),
                                 ("apply", cmd_apply, True), ("delete-review", cmd_delete_review, False)]:
        s = sub.add_parser(name)
        s.add_argument("--pr", type=int, required=True)
        if needs_json:
            s.add_argument("--json", required=True)
        s.set_defaults(fn=fn)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
