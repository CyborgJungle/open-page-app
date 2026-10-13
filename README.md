# Open Page

A minimal webpage viewer: paste a URL, click Open, and see the available page with its original static layout, styles, and images. Download saves an HTML snapshot. The site is private.

The backend fetches public HTML anonymously. The viewer removes website scripts and static subscription dialogs, keeps available article content, and isolates the snapshot in a sandboxed frame. If a live request is blocked, automatic mode tries a publicly available Wayback snapshot. Short captures containing subscription notices also trigger a lookup. An archive is selected only when it contains more text without a detected subscription notice. Historical copies display the original archive date.

This cannot universally obtain full subscriber-only content that a publisher's server withholds. Archived copies may be unavailable, older, or incomplete. Dynamic pages that depend on JavaScript can render incompletely. Downloaded HTML retains external styles, fonts, images, and media references, so it is not a self-contained offline archive. Visitors see no bulk controls, collection, or explanatory sections.

## Development

Requires Node.js 24 or newer. The hosted Worker has no runtime dependencies. Development checks use `linkedom`; install them with `npm install`.

- `node dev-server.mjs` starts the local preview at http://localhost:4173.
- Edit `work-ui.html` and `work-backend.js`, then run `node scripts/assemble.mjs`.
- `npm test` checks fetch behavior, presentation cleanup, subscription metadata, short excerpts, and access challenges. A local WIRED HTML fixture, when present, is also checked without being distributed in source.
- `bash scripts/build.sh` and `node scripts/validate-artifact.mjs` build and validate the Worker.

The backend checks public DNS addresses and redirect targets, respects live robots.txt rules, limits response bodies to 2 MB, and uses separate 20-second live and 35-second archive time budgets, so a failed live request does not consume the archive fallback budget. Source URLs, capture timestamps, archive timestamps, and response hashes are embedded in downloaded HTML. Response hashes cover received bytes after HTTP content decoding and before text character decoding.

The production entrypoint is `worker/index.js`. Site identity is in `.openai/hosting.json`.

Empty advertising wrappers are collapsed using stable semantic classes and ad attributes, without matching ordinary words such as address or deleting substantive article media. Incomplete-page detection uses Article/NewsArticle schema metadata, declared article length, article-body text, and access-challenge markers. Metadata is a signal, not proof of completeness or a grant of access.
