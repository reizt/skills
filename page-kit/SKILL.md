---
name: page-kit
description: Combine standard Web Search with the local Page Kit API to research the web and fetch selected HTML page bodies as clean Markdown. Use when Codex needs current web research, article or documentation text, or better extraction from URLs found through search. Search discovers and ranks sources; Page Kit retrieves the full text of selected pages.
---

# Page Kit Web Fetch

Use standard Web Search first to discover current, relevant sources. Use Page Kit only for selected HTML URLs whose full body is needed for reading, comparison, or citation support.

## Workflow

1. Search with the standard Web Search tool and inspect result snippets.
2. Prefer primary and authoritative sources.
3. Fetch only the most relevant URLs with the `page-kit` MCP tool. If the MCP tool is unavailable, use `scripts/fetch_page.py`.
4. Use `render=auto` by default. Use `never` for known static pages and `always` only when a JavaScript-rendered page requires it.
5. Cross-check important or time-sensitive claims across sources and cite the original page URLs, not the local API.

Run:

```sh
python3 scripts/fetch_page.py 'https://example.com' auto
python3 scripts/fetch_page.py 'https://example.com' always --force
```

The fallback script calls `https://page-kit.reiju.me` by default and reads the Bearer token from `PAGE_KIT_API_KEY`. Set `PAGE_KIT_URL` only when using another deployment.

If Page Kit is unavailable, report that briefly and continue with standard Web Search or the standard page-opening tool. Do not start, install, or modify the Page Kit service unless the user asks.

Page Kit handles only HTML pages. Use the appropriate PDF or document tool for other content types. Never use it to bypass access controls, login walls, CAPTCHAs, or blocked private-network destinations.
