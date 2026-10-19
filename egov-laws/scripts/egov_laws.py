#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.parse
import urllib.request

BASE_URL = "https://laws.e-gov.go.jp/api/2"


def request_json(path, params):
    query = urllib.parse.urlencode(
        {k: v for k, v in params.items() if v is not None},
        doseq=True,
    )
    url = f"{BASE_URL}{path}"
    if query:
        url = f"{url}?{query}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as res:
        body = res.read().decode("utf-8")
    try:
        return url, json.loads(body)
    except json.JSONDecodeError:
        return url, body


def print_json(url, data):
    print(f"# {url}")
    print(json.dumps(data, ensure_ascii=False, indent=2))


def add_common(parser):
    parser.add_argument("--asof", help="YYYY-MM-DD")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--offset", type=int)
    parser.add_argument("--law-type", action="append", dest="law_type")


def laws(args):
    params = {
        "law_title": args.title,
        "law_num": args.num,
        "law_id": args.id,
        "law_type": args.law_type,
        "asof": args.asof,
        "limit": args.limit,
        "offset": args.offset,
        "order": args.order,
        "response_format": "json",
    }
    print_json(*request_json("/laws", params))


def keyword(args):
    params = {
        "keyword": args.keyword,
        "law_num": args.num,
        "law_type": args.law_type,
        "asof": args.asof,
        "limit": args.limit,
        "offset": args.offset,
        "sentences_limit": args.sentences_limit,
        "sentence_text_size": args.sentence_text_size,
        "highlight_tag": args.highlight_tag,
        "response_format": "json",
    }
    print_json(*request_json("/keyword", params))


def data(args):
    params = {
        "asof": args.asof,
        "elm": args.elm,
        "law_full_text_format": args.format,
        "json_format": "light" if args.light else args.json_format,
        "omit_amendment_suppl_provision": args.omit_amendment_suppl_provision,
        "response_format": "json",
    }
    path_id = urllib.parse.quote(args.id_or_num_or_revision_id, safe="")
    print_json(*request_json(f"/law_data/{path_id}", params))


def revisions(args):
    params = {
        "law_title": args.title,
        "updated_from": args.updated_from,
        "updated_to": args.updated_to,
        "current_revision_status": args.current_revision_status,
        "response_format": "json",
    }
    url, payload = request_json(
        f"/law_revisions/{urllib.parse.quote(args.id_or_num, safe='')}",
        params,
    )
    if args.limit and isinstance(payload, dict) and isinstance(payload.get("revisions"), list):
        payload["revisions"] = payload["revisions"][: args.limit]
    print_json(url, payload)


def main():
    parser = argparse.ArgumentParser(description="Query e-Gov Law API v2.")
    sub = parser.add_subparsers(required=True)

    p = sub.add_parser("laws", help="Search law metadata")
    add_common(p)
    p.add_argument("--title")
    p.add_argument("--num")
    p.add_argument("--id")
    p.add_argument("--order")
    p.set_defaults(func=laws)

    p = sub.add_parser("keyword", help="Search law text by keyword")
    add_common(p)
    p.add_argument("keyword")
    p.add_argument("--num")
    p.add_argument("--sentences-limit", type=int)
    p.add_argument("--sentence-text-size", type=int)
    p.add_argument("--highlight-tag")
    p.set_defaults(func=keyword)

    p = sub.add_parser("data", help="Fetch law text")
    p.add_argument("id_or_num_or_revision_id")
    p.add_argument("--asof")
    p.add_argument("--elm")
    p.add_argument("--format", choices=["json", "xml"], default="json")
    p.add_argument("--json-format", choices=["full", "light"], default="full")
    p.add_argument("--light", action="store_true")
    p.add_argument("--omit-amendment-suppl-provision", action="store_true")
    p.set_defaults(func=data)

    p = sub.add_parser("revisions", help="Fetch revision history")
    p.add_argument("id_or_num")
    p.add_argument("--title")
    p.add_argument("--updated-from")
    p.add_argument("--updated-to")
    p.add_argument("--current-revision-status", action="append")
    p.add_argument("--limit", type=int)
    p.set_defaults(func=revisions)

    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as exc:
        print(f"egov_laws.py: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
