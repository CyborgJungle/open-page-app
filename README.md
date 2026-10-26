# Open Page

An installable web app: paste a URL, press Open, and read the page with its original layout, styles and images, without the site's scripts and pop-ups.

**Live:** [open-page-eta.vercel.app](https://open-page-eta.vercel.app) · **Stack:** JavaScript, Vercel Functions

## What it does

- Opens a public web page with its static layout and images, with the site's scripts and subscription dialogs removed.
- Falls back to an archived copy (Wayback Machine or Archive.today) when the live page can't be read, and shows the archive date.
- Installs on the iPhone home screen (Safari → Share → Add to Home Screen) and starts in standalone mode. The app shell works offline after the first visit.
- Targets screens from 320px wide, with 44px touch controls and a 16px input to avoid focus zoom.

## How it's built

A single Vercel Function fetches and cleans pages; the client is plain JavaScript with no framework and no runtime dependencies.

### How a page is opened

1. **Live first.** The backend fetches the public HTML anonymously. The viewer removes the site's scripts and static subscription dialogs, keeps the article content, and shows the result in a sandboxed frame.
2. **Archive fallback.** If the live page can't be read, a hosted archive search (Wayback Machine, then Archive.today) and a direct browser fetch from Archive.today run at the same time. The first readable result wins and the other attempt is cancelled.
3. **Only better copies.** An archive is used only if it has more text and no detected subscription notice. Old copies show their archive date. Archive.today snapshots must declare the exact requested URL; challenge pages, unexpected hosts and unrelated snapshots are rejected.
4. **One deadline.** The whole operation has a single 25-second limit instead of stacking retries. If nothing readable is found, one short message appears inside the existing interface.

The app never sends the visitor to an archive site, never automates challenges and never creates archive captures.

### Safety choices

- Public DNS addresses and redirect targets are checked before anything is fetched.
- Live `robots.txt` rules are respected.
- Responses are limited to 2 MB on the server (8 MB and 20 seconds for the browser-side archive fetch).
- Disconnecting cancels the upstream requests.
- The viewer frame has no same-origin privileges. A nonce-authorized scroll bridge is the only script inside it.
- The capture API returns the source URL, timestamps and a hash of the received bytes, so a result can be traced.

## Run it locally

Requires Node.js 24 or newer. The tests use `linkedom`.

```sh
npm install
npm run dev      # local preview at http://localhost:4173
npm test         # fetch behavior, cleanup, subscription metadata, scrolling, Vercel adapter
npm run build    # prepare the Vercel website and capture function
```

Edit `work-ui.html` and `work-backend.js`; the build assembles them into the worker in `worker/index.js`.

## Deploy on Vercel

Import the repository into Vercel with the **Other** framework preset. `vercel.json` sets the build command and routes capture requests through `api/index.mjs`. No environment variables are needed. The function allows up to 60 seconds, while the capture handler enforces its own shorter budget.

## Limits

- It can't get subscriber-only content that a publisher's server withholds.
- Archived copies may be missing, older or incomplete.
- Pages that depend on JavaScript can render incompletely.
- Captured pages still load their fonts, images and styles from the original sites, so they need internet access.

## About

A personal project by [CyborgJungle](https://github.com/CyborgJungle), built with [Claude Code](https://claude.com/claude-code) and hosted on [Vercel](https://vercel.com). It is shared as part of my portfolio: feel free to copy it and make it your own.

## License

MIT, see [LICENSE](LICENSE).
