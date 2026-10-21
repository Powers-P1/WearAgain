# YouCam fixtures

`cloth_tryon_task.synthetic.json` records the response **shape** observed by the team's
2026-10-21 probe. Identifiers, filenames and signed URLs are placeholders. It contains
no API key, raw API payload, private photograph or reusable result link.

The observed example names the V2 task path `/s2s/v2.0/task/cloth`. The PR3 client uses
the separately probed `/s2s/v2.0/task/cloth-v4` with `garment_category: upper_body` and
the same response shape. Tests deliberately assert that difference rather than edit
the historical fixture to claim a different observation.

`tests/youcam-client.test.mjs` clones these response shapes, replaces placeholders
with synthetic IDs and an approved-host URL, then uses an injected fetch queue. The
image response is a locally generated, valid single-colour PNG; it is test transport
data, **not** a saved YouCam try-on or a product-demo result. No test calls a network
service or consumes API units.

## Documented transport hosts

Perfect Corp's [AI Clothes integration guide](https://docs.perfectcorp.com/reference/ai_clothes/section/overview),
read 2026-10-21, identifies `https://yce-api-01.makeupar.com` as the API server and
shows signed uploads/results at `yce-us.s3-accelerate.amazonaws.com`. The client uses
that exact asset hostname by default; any additional observed provider host requires
trusted configuration. It never sends the Bearer credential to an asset host and
does not follow redirects.

The guide currently shows generic `/s2s/v2.0/file`; the client uses `/file/cloth` as
explicitly requested and verified by the team's live probe in `docs/YOUCAM_NOTES.md`.

## Accounting evidence

- A successful image costs 2 units, as observed by the team.
- Task-creation HTTP 400 with `error_code: InvalidParameters`, and terminal
  `task_status: error` with `error_decode_image`, are the probe-backed free cases.
- Other error codes, HTTP failures, unexpected schemas and deadlines carry no
  automatic refund assertion. Their reservation stays pending for reconciliation.
- Download failure does not reverse a successful task's charge.

Do not replace these fixtures with personal photographs, credentials or live signed
URLs. Demo output assets must be separately recorded and labelled by their actual
origin.
