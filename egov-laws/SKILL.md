---
name: egov-laws
description: Search, retrieve, and cite Japanese statutes using e-Gov Law Search and the e-Gov Law API Version 2. Use when Codex needs to look up Japanese laws, find a law by title or number, search law text by keyword, fetch current or historical articles/provisions, inspect revision history, download law text files, or provide citations/URLs from https://laws.e-gov.go.jp/.
---

# e-Gov Laws

Use e-Gov Law API Version 2 first. Use the website UI only when the API cannot answer the task or the user explicitly asks for browser operation.

## Workflow

1. Identify the request type:
   - Law title/number lookup: use `/api/2/laws`.
   - Full-text keyword search: use `/api/2/keyword`.
   - Current or as-of law text: use `/api/2/law_data/{id_or_num_or_revision_id}`.
   - Revision history: use `/api/2/law_revisions/{law_id_or_num}`.
   - File download: use `/api/2/law_file/{file_type}/{id_or_num_or_revision_id}`.
2. Prefer JSON for analysis. Use XML when exact legal XML structure matters.
3. Pin time-sensitive answers with `asof=YYYY-MM-DD` when the user asks about a specific date. If no date is given, say the result is the current e-Gov data.
4. Return the law title, law number, law ID or law revision ID, enforcement/amendment date when relevant, and a source URL.
5. For legal conclusions, distinguish the quoted/retrieved text from your interpretation. Do not present as legal advice.

## Quick Commands

Use the helper when a shell is available:

```bash
python3 /Users/r/.codex/skills/egov-laws/scripts/egov_laws.py laws --title '個人情報の保護に関する法律' --limit 3
python3 /Users/r/.codex/skills/egov-laws/scripts/egov_laws.py keyword '個人情報' --limit 5 --sentences-limit 2
python3 /Users/r/.codex/skills/egov-laws/scripts/egov_laws.py data 415AC0000000057 --elm 'MainProvision-Article[1]' --light
python3 /Users/r/.codex/skills/egov-laws/scripts/egov_laws.py revisions 415AC0000000057 --limit 5
```

Read `references/api-v2.md` for endpoint details, parameters, citation URL patterns, and keyword syntax.

## Search Guidance

- Start with `laws --title` for a named law. e-Gov supports partial matches and abbreviations in `law_title`.
- Use `keyword` when the user asks where a phrase appears in law text.
- Keep `limit` small first; paginate with `offset` only when needed.
- Use `law_type=Act` etc. to narrow noisy searches.
- Use `asof` for historical lookup. When fetching a specific `law_revision_id`, `asof` is ignored by the API.

## Related Official Notices

- 化粧品の効能の範囲の改正について（平成23年7月21日薬食発0721第1号）:
  https://www.mhlw.go.jp/web/t_doc?dataId=00tb7518&dataType=1&pageNo=
  - Use when answering questions about cosmetic advertising claims, including the permitted scope of cosmetic efficacy expressions such as skin protection and prevention of dryness.

## Output

Keep answers compact:

```text
法令: 個人情報の保護に関する法律
法令番号: 平成十五年法律第五十七号
法令ID: 415AC0000000057
時点: 現行e-Govデータ / asof=YYYY-MM-DD
該当箇所: 第X条...
出典: https://laws.e-gov.go.jp/law/415AC0000000057
```

When quoting, quote only the necessary clause or sentence, then summarize.
