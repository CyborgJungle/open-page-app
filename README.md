# Open Page

An installable, minimal web app: paste a URL, click Open, and see the available page with its original static layout, styles, and images.

Live app: https://open-page-eta.vercel.app

The backend fetches public HTML anonymously. The viewer removes website scripts and static subscription dialogs, keeps available article content, and isolates the snapshot in a sandboxed frame. If a live request is blocked, automatic mode tries a publicly available Wayback snapshot, then Archive.today. Short captures containing subscription notices also trigger a lookup. An archive is selected only when it contains more text without a detected subscription notice. Historical copies display the archive date. Archive.today snapshots must declare the exact requested source URL in their archive metadata; challenges, unexpected archive hosts, and unrelated snapshots are rejected.

Archive.today's documented `/newest/` endpoint is tried before its snapshot listing. When hosted capture is blocked, the browser can fetch the public snapshot directly from archive.ph using its permitted CORS access, without sending cookies. The requested source and snapshot metadata must match, and responses are limited to 2 MB and 20 seconds. All captured HTML goes through the same script removal and sandboxed viewer, keeping the app domain and toolbar in place. Frozen archive layouts are centered on desktop and reflow their article and images on narrow screens. Empty advertising placeholders, including Dutch labels, are removed while substantive media stays. The app never navigates the visitor to an archive service or opens a fallback tab. If no readable capture is available, a single short message is shown inside the existing interface. The app does not automate challenges or create archive captures.

This cannot universally obtain full subscriber-only content that a publisher's server withholds. Archived copies may be unavailable, older, or incomplete. Dynamic pages that depend on JavaScript can render incompletely. Captured pages retain external styles, fonts, images, and media references, so they require internet access. Visitors see no bulk controls, collection, or explanatory sections.

## Development

Requires Node.js 24 or newer. The hosted Worker has no runtime dependencies. Development checks use `linkedom`; install them with `npm install`.

- `node dev-server.mjs` starts the local preview at http://localhost:4173.
- Edit `work-ui.html` and `work-backend.js`, then run `node scripts/assemble.mjs`.
- `npm test` checks fetch behavior, presentation cleanup, subscription metadata, short excerpts, and access challenges. A local WIRED HTML fixture, when present, is also checked without being distributed in source.
- `bash scripts/build.sh` and `node scripts/validate-artifact.mjs` build and validate the Worker.

The backend checks public DNS addresses and redirect targets, respects live robots.txt rules, limits response bodies to 2 MB, and uses separate 20-second live and 35-second archive time budgets, so a failed live request does not consume the archive fallback budget. The combined archive search reserves at most 8 seconds for Wayback and gives the remaining time to Archive.today. No archive-capture submissions are made. Source URLs, capture timestamps, archive timestamps, and response hashes are returned by the capture API. Response hashes cover received bytes after HTTP content decoding and before text character decoding.

The production entrypoint is `worker/index.js`. Site identity is in `.openai/hosting.json`.

## Vercel deployment

The private `CyborgJungle/open-page` repository is connected to the `open-page` project in the `cyborgjungle` Vercel team. Pushing to `main` automatically deploys the production app.

Import the repository into Vercel with the Other framework preset. `vercel.json` selects the build command and routes capture requests through `api/index.mjs`, using the same backend as the Worker deployment. The website, icon assets, and service worker are generated in `public/` with matching security headers. No environment variables are required. The function has a 60-second duration to accommodate live capture followed by archive fallback. `npm run build:vercel` prepares this deployment; `npm test` verifies the route adapter, static output, headers, and request body forwarding.

Empty advertising wrappers are collapsed using stable semantic classes and ad attributes, without matching ordinary words such as address or deleting substantive article media. Incomplete-page detection uses Article/NewsArticle schema metadata, declared article length, article-body text, and access-challenge markers. Metadata is a signal, not proof of completeness or a grant of access.

## Install and iPhone support

Open the public site in Safari, use Share → Add to Home Screen, and tap Add. An Install button also explains this action. The supplied custom icon is bundled at 180px for iPhone, 192px and 512px for web app manifests, and 32px for the browser tab. The manifest launches in standalone mode.

The layout targets 320px and larger screens with 44px touch controls, a 16px URL input to avoid focus zoom, safe-area padding, and viewport sizing that does not require modern dynamic viewport units. JavaScript avoids optional chaining in the client, and spacing has fallbacks for Safari without flex-gap support. Actual old-iPhone hardware and OS versions have not been tested in this environment.

The app shell is available offline after a successful first visit. Loading a new webpage and loading external images/styles still require internet access. Capture API responses are never cached by the service worker. There is no save or download action. The toolbar reduces to a compact source strip when scrolling down and returns on upward scrolling; tapping the strip also restores it.

A nonce-authorized, app-owned scroll bridge runs in the sandboxed viewer. Publisher scripts and handlers remain removed; the frame does not receive same-origin privileges. The parent accepts scroll messages only from its current frame and matching per-load channel.
