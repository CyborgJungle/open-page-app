# Open Page

A minimal webpage viewer: paste a URL, click Open, and see the available page with its original static layout, styles, and images. Download saves an HTML snapshot. The site is private.

The backend fetches public HTML anonymously. The viewer removes website scripts and static subscription dialogs, keeps available article content, and isolates the snapshot in a sandboxed frame. If a live request is blocked, automatic mode tries a publicly available Wayback snapshot. Short captures containing subscription notices also trigger a lookup. An archive is selected only when it contains more text without a detected subscription notice. Historical copies display the original archive date.

This cannot universally obtain full subscriber-only content that a publisher's server withholds. Archived copies may be unavailable, older, or incomplete. Dynamic pages that depend on JavaScript can render incompletely. Downloaded HTML retains external styles, fonts, images, and media references, so it is not a self-contained offline archive. Visitors see no bulk controls, collection, or explanatory sections.

## Development

Requires Node.js 24 or newer. No dependencies are required.

- `node dev-server.mjs` starts the local preview at http://localhost:4173.
- Edit `work-ui.html` and `work-backend.js`, then run `node scripts/assemble.mjs`.
- `node scripts/test-capture.mjs` validates backend behavior and client syntax.
- `bash scripts/build.sh` and `node scripts/validate-artifact.mjs` build and validate the Worker.

The backend checks public DNS addresses and redirect targets, respects live robots.txt rules, limits response bodies to 2 MB, and times out after 45 seconds. Source URLs, capture timestamps, archive timestamps, and response hashes are embedded in downloaded HTML. Response hashes cover received bytes after HTTP content decoding and before text character decoding.

The production entrypoint is `worker/index.js`. Site identity is in `.openai/hosting.json`.
