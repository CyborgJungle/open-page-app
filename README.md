# Folio — research web archive

Folio is a private web app for capturing readable text from public webpages and available Wayback snapshots. Paste one URL or a list of up to 500 URLs. A batch runs two requests concurrently and saves successful captures in the browser's IndexedDB.

## Features

- Single-page reading preview and research notes.
- Bulk URL queues, cancellation, per-URL outcomes, and downloadable batch reports.
- Live capture, explicit Wayback lookup, and automatic archive fallback.
- Original/resolved URLs, capture timestamps, archive timestamps, exact decoded-response-body byte hashes, and sanitized snapshot hashes.
- Sanitized HTML, plain text, and JSON export; JSON collection import/export.
- Browser-local persistence, search, and sorting.

## Capture behavior and limits

Folio does not log into publishers or obtain content withheld by a subscription server. It extracts text delivered in public HTML, including text hidden by page presentation. A short page containing a subscription notice is flagged for completeness review. Automatic mode tries a publicly available Wayback copy on live request failure or a detected short subscription notice. An archived copy can be older, incomplete, or unavailable; live fallback is not a guarantee of full article access.

These are readable text snapshots, not full-page screenshots, WARC records, or complete website mirrors. Remote scripts do not execute; images, page styling, interactive features, and dynamically loaded content are not captured. The raw HTML response is transient and is not stored in the collection. `responseSha256` hashes response bytes after HTTP content decoding and before text character decoding; `snapshotSha256` hashes the UTF-8 sanitized reader markup. Neither hash attests publisher authenticity. Export a collection backup regularly; clearing browser storage deletes local captures. Keep the tab open while a batch is running. The 500 URL batch size is a browser prototype limit, not a claim of production-scale background crawling.

Live capture respects robots.txt, checks public DNS results and redirect targets, bounds responses to 2 MB, and uses anonymous requests with no visitor cookies or authorization headers. Wayback content is fetched through Internet Archive's availability API and identity replay endpoint. Fetches time out after 45 seconds per server request.

## Development

Requires Node.js 24 or newer. There are no dependencies.

Run `node dev-server.mjs` and visit http://localhost:4173. Edit `work-ui.html` and `work-backend.js`, then run `node scripts/assemble.mjs` to regenerate the Worker. Run `node scripts/test-capture.mjs` to validate backend behavior and client syntax. Run `bash scripts/build.sh` and `node scripts/validate-artifact.mjs` to package the Worker in `dist/`.

The hosted app uses a Cloudflare Worker-compatible entrypoint at `worker/index.js`. Site identity and optional storage bindings are declared in `.openai/hosting.json`. No durable server database is configured; collections remain browser-local.
