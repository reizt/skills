# e-Gov Law API Version 2 Notes

Base URL: `https://laws.e-gov.go.jp/api/2`

Official docs:
- Redoc: `https://laws.e-gov.go.jp/api/2/redoc/`
- Swagger UI: `https://laws.e-gov.go.jp/api/2/swagger-ui`
- OpenAPI YAML: `https://laws.e-gov.go.jp/api/2/swagger-ui/lawapi-v2.yaml`
- Law XML docs: `https://laws.e-gov.go.jp/docs/`

## Endpoints

### Law list

`GET /laws`

Use for law title, law number, law type, promulgation date, category, and as-of lookup.

Common parameters:
- `law_title`: law name or abbreviation, partial match.
- `law_num`: law number, partial match.
- `law_id`: law ID, partial match.
- `law_type`: comma-separated values: `Constitution`, `Act`, `CabinetOrder`, `ImperialOrder`, `MinisterialOrdinance`, `Rule`, `Misc`.
- `asof`: `YYYY-MM-DD`; returns the latest revision at that point in `revision_info`.
- `limit`, `offset`, `order`.
- `response_format=json`.

Example:

```bash
curl -sS 'https://laws.e-gov.go.jp/api/2/laws?law_title=個人情報の保護に関する法律&limit=3&response_format=json'
```

### Keyword search

`GET /keyword`

Use for full-text search in `law_full_text`. Required parameter: `keyword`.

Useful parameters:
- `asof`: `YYYY-MM-DD`.
- `law_type`, `law_num`, `category_cd`.
- `limit`: maximum total positions in `sentences`; upper limit is 1000.
- `sentences_limit`: cap displayed sentences per item.
- `sentence_text_size`: context length.
- `highlight_tag`: default `span`.
- `response_format=json`.

Keyword syntax:
- Wildcards: `*` means zero or more chars; `?` means one char. Example: `第*条`.
- AND/OR/NOT expressions are supported. Do not combine wildcard search with AND/OR/NOT.

### Law data

`GET /law_data/{law_id_or_num_or_revision_id}`

Use for law text. The path value must exactly match a law ID, law number, or law revision ID.

Useful parameters:
- `asof`: ignored when the path value is a revision ID.
- `elm`: fetch a specific element, such as `MainProvision-Article[1]` or `MainProvision-Article[13]`.
- `law_full_text_format=json|xml`.
- `json_format=light|full`; use `light` for easier parsing, `full` for structural fidelity.
- `omit_amendment_suppl_provision=true` to reduce noise.
- `response_format=json`.

### Revision history

`GET /law_revisions/{law_id_or_num}`

Use for amendment history. Path value must exactly match law ID or law number.

Useful parameters:
- `law_title`, `amendment_date_from`, `amendment_date_to`.
- `updated_from`, `updated_to`.
- `current_revision_status`: `CurrentEnforced`, `UnEnforced`, `PreviousEnforced`, `Repeal`.
- `response_format=json`.

### Files

`GET /law_file/{file_type}/{law_id_or_num_or_revision_id}`

`file_type`: `xml`, `json`, `html`, `rtf`, `docx`.

### Attachments

`GET /attachment/{law_revision_id}?src=...`

Use `attached_files_info.attached_files[].src` from `law_data`. Omitting `src` downloads a zip.

## Citation URLs

Use these human-readable source URLs in final answers:

- Law page: `https://laws.e-gov.go.jp/law/{law_id}`
- API law list: `https://laws.e-gov.go.jp/api/2/laws?...`
- API law data: `https://laws.e-gov.go.jp/api/2/law_data/{id}`
- API keyword: `https://laws.e-gov.go.jp/api/2/keyword?...`

Prefer the law page for human readers and include API URLs when exact query parameters matter.

## Response fields

Common objects:

- `law_info`: stable law metadata such as `law_id`, `law_num`, `promulgation_date`.
- `revision_info`: revision-dependent metadata such as `law_title`, `law_revision_id`, `amendment_enforcement_date`, `current_revision_status`.
- `current_revision_info`: current latest revision metadata, independent of `asof`.

Revision status:

- New enactment: `amendment_type == "1"` and `mission == "New"`.
- Partial amendment: `mission == "Partial"`.
- Amended law: `amendment_type == "3"` and `mission == "New"`.
- Repeal/expiry: `amendment_type == "8"` or `repeal_status` is `Repeal`, `Expire`, or `LossOfEffectiveness`.
