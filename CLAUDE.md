# Working on this repo

Below Deck Tracker — a small web app that maps the real yachts behind the Bravo TV
"Below Deck" franchise, live, using AIS ship-tracking data. Read [`README.md`](README.md)
for the architecture and [`content/README.md`](content/README.md) for how the yacht data
is edited.

Maintained by one developer (James). Optimise for **staying easy to change**, not for
cleverness — same philosophy as the jessica-jade site this was bootstrapped alongside.

## Verifying changes: drive the browser

**There is no automated test suite.** Verify visually with the `claude-in-chrome` browser
tools (or Playwright directly if that skill isn't available) — a change that only
typechecks has not been verified.

The routine:

1. Start the server: `PORT=3999 npx tsx src/server.ts &` (spare port, doesn't fight
   whatever's already running).
2. `curl` the routes for status codes first — cheap: `/ /healthz /api/state
   /api/positions` plus a deliberate 404.
3. Screenshot at **1440×900 desktop and 400×860 mobile**. Mobile is the primary use case
   for a "check where the boat is right now" app.
4. Exercise the filters: toggle a show chip off, toggle a yacht checkbox off, confirm both
   the map markers and the yacht list below react. On mobile, open/close the filters
   drawer.
5. If you have an `AISSTREAM_API_KEY`, actually connect once after changing anything in
   `src/lib/ais-client.ts` — the message shapes are easy to get subtly wrong and there's
   no way to unit-test against the real feed.

**Known sandbox gotcha:** this dev sandbox's network egress proxy blocks the map tile
domain (`server.arcgisonline.com`), so screenshots taken here show a plain navy map with
no tiles — that's the proxy, not a bug. It works in a normal browser. Don't "fix" this by
changing the tile URL without checking it's actually broken for the user first.

## Conventions

- **Content is data.** `content/yachts.json` and `content/shows.json` are what the app
  shows — never hardcode a yacht into a template or route.
- **No database.** Positions live in an in-memory `Map` (`src/lib/position-store.ts`) that
  refills itself from the AIS feed within a few minutes of a restart. That's an accepted
  tradeoff for staying stateless — don't "fix" it by adding persistence unless the
  requirements actually change.
- **No client framework, no build step beyond `tsc`.** Plain `src/public/app.js`, vanilla
  DOM. Keep it that way unless there's a real reason.
- Leaflet is **self-hosted** in `src/public/vendor/leaflet/` (copied from the npm
  package), not loaded from a CDN — this sandbox's egress proxy blocks common CDN
  domains, and self-hosting avoids depending on one at runtime in production too. If
  Leaflet needs upgrading, redo the copy (see the git history of that directory for the
  exact `npm pack` command) rather than switching to a `<script src="https://...">` tag.
- A yacht's `mmsi` in `content/yachts.json` is the only thing that makes tracking work
  for it. Never guess one — a wrong MMSI silently tracks a different vessel. Leave it
  `null` if unknown.

## Before finishing

- `npm run typecheck` must pass.
- Screenshot desktop **and** mobile for anything visual.
- If you touched `src/lib/ais-client.ts`, re-read the aisstream.io message shapes in
  `README.md` — it's easy to swap `Latitude`/`latitude` (message vs. metadata casing) and
  have it silently do the wrong thing.
