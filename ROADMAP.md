# Roadmap

## SEO (next up — unblocked once `wc2026calendar.info` resolves)

The static prerendered HTML is already crawler-friendly; these are the
missing layers, roughly in impact order:

- [x] **Set `site` in `astro.config.mjs`** to `https://wc2026calendar.info`
      — prerequisite for canonicals, sitemap, and absolute OG URLs.
- [x] **Open Graph + Twitter cards** in `Layout.astro` (`og:title`,
      `og:description`, `og:url`, `og:image`, `twitter:card`). Add a static
      share image (1200×630) in the MATCHDAY26 brand style — dark pitch
      background, host-country bars, wordmark.
- [x] **Canonical URLs** per page (`<link rel="canonical">` from `site` +
      `Astro.url.pathname`).
- [x] **Sitemap + robots.txt** — `@astrojs/sitemap` integration (needs `site`),
      plus a `public/robots.txt` pointing at the sitemap and allowing all.
- [x] **Structured data** — `SportsEvent` JSON-LD baked at build time: 104
      events with teams, kickoff (`startDate`), and stadium (`location` with
      city/country). This is what qualifies match info for rich results.
      Use an `ItemList` on the index; consider `BreadcrumbList` on subpages.
- [x] **Per-page meta descriptions** — distinct copy for `/bracket`,
      `/standings`, `/stats` (currently all reuse the homepage default).
- [ ] **Consider: per-match and per-team pages** (`/match/42`, `/team/GER`)
      — deep-linkable URLs are the biggest remaining SEO lever (one indexable
      page per match/team instead of one big page), and they'd double as
      share targets for the OG cards. Larger task: routing + drawer reuse.

## Infrastructure

- [ ] Verify `wc2026calendar.info` end-to-end once DNS propagates: custom
      domain on the Worker, Always Use HTTPS, ICS feed UIDs now derive from
      the new hostname (existing calendar subscriptions to the workers.dev
      URL keep working but won't merge with new-domain UIDs).
- [ ] Redirect `www.wc2026calendar.info` → apex (Cloudflare redirect rule
      or second custom domain).

## Feature backlog (unprioritized)

- [ ] Light-theme polish pass (tokens exist; needs a visual sweep).
- [ ] Web Push kickoff reminders via service worker (works with tabs closed —
      the in-page Notification API reminder ships already; this was scoped
      out of v1 deliberately).
- [ ] Knockout-round "simulated moments" style bracket preview (design
      prototype had a what-if explorer).
- [ ] Cross-check card data against a second source if ESPN gaps appear
      (TheSportsDB proved incomplete: 1 of 3 reds in the opener).
- [ ] Player photo coverage keeps growing via the daily Action (Wikipedia
      rate limits cap each run); spot-check name-mismatch players
      (~190 without kit numbers) and add aliases for the worst offenders.
