#!/usr/bin/env python3
import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch one HTML page through Page Kit")
    parser.add_argument("url")
    parser.add_argument("render", nargs="?", choices=("auto", "never", "always"), default="auto")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    endpoint = os.environ.get("PAGE_KIT_URL", "https://page-kit.reiju.me").rstrip("/") + "/fetch"
    api_key = os.environ.get("PAGE_KIT_API_KEY")
    if not api_key:
        print("PAGE_KIT_API_KEY is not set", file=sys.stderr)
        return 1
    payload = json.dumps({"url": args.url, "render": args.render, "force": args.force}).encode()
    request = urllib.request.Request(endpoint, data=payload, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "PageKitSkill/1.0",
    })
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.load(response)
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"Page Kit request failed: {error}", file=sys.stderr)
        return 1

    if not result.get("success"):
        error = result.get("error", {})
        print(f"Page Kit error [{error.get('code', 'UNKNOWN')}]: {error.get('message', 'unknown error')}", file=sys.stderr)
        return 1

    data = result["data"]
    print(f"Source: {data['finalUrl']}")
    print(f"Title: {data['title']}")
    print(f"Fetched: {data['metadata']['fetchedAt']} (cached={str(data['metadata']['cached']).lower()}, rendered={str(data['metadata']['rendered']).lower()})")
    print("\n" + data["markdown"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
