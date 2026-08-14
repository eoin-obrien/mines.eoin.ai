# Deploying to Cloudflare Pages

The site is a static build; hosting is Cloudflare Pages on the free tier
(unlimited bandwidth, global edge, per-PR previews, automatic TLS). No server,
no backend — the daily challenge is computed identically on every client from
the UTC date seed.

Everything below is one-time setup that needs an account, so it is written down
rather than automated.

## 1. Push the repository

```bash
gh repo create eoin/mines.eoin.ai --private --source . --remote origin --push
```

## 2. Create the Pages project

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → connect the
repository, then:

| Setting                | Value              |
| ---------------------- | ------------------ |
| Production branch      | `main`             |
| Framework preset       | None               |
| Build command          | `pnpm build`       |
| Build output directory | `apps/site/dist`   |
| Root directory         | `/` (repo root)    |

Environment variables (Production **and** Preview):

| Name              | Value |
| ----------------- | ----- |
| `NODE_VERSION`    | `24`  |
| `PNPM_VERSION`    | `11`  |

The build runs from the repo root so pnpm can resolve the workspace: `pnpm build`
builds `@eoin/minesweeper-core` first (topological order) and then the site,
which is what makes the production bundle exercise the published `dist` entry
rather than the `development` source condition.

Preview deployments are on by default for every branch and PR; keep them.

## 3. Custom domain

Add `minesweeper.eoin.ai` as a custom domain on the Pages project. If `eoin.ai`
already uses Cloudflare nameservers the `CNAME` and certificate are provisioned
automatically; otherwise add a `CNAME` from `minesweeper` to the project's
`*.pages.dev` hostname.

## 4. Headers

`apps/site/public/_headers` ships with the build: hashed assets get a one-year
immutable cache, the HTML entry point does not, plus the usual
`nosniff`/`X-Frame-Options`/`Referrer-Policy` set. Edit that file, not the
dashboard, so the config lives with the code.

## Notes

- Cloudflare now steers new projects toward "Workers with Static Assets". It has
  parity for a static SPA; either is fine here, and the build settings above are
  unchanged if you migrate.
- A PWA service worker arrives at M7. Until then nothing is cached beyond the
  `_headers` rules, so a deploy is visible immediately.
