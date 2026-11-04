# TailorScan

A free, private resume vs. job description scanner. Paste a resume and a posting, and get a match score, missing keywords ranked by priority (required, core, preferred), and nine resume best-practice checks.

Everything runs in the browser. No server, no accounts, no uploads.

## What is in here

| Path | What it is |
| --- | --- |
| `src/assets/engine.js` | The scoring engine (browser and Node). Skill matching, JD section weighting, title, years, degree, and hygiene checks. |
| `src/assets/app.js` | UI: file parsing (pdf.js and mammoth, lazy-loaded from cdnjs), rendering, copy-report. |
| `data/skills.json` | About 240 skills, tools, and certifications with aliases. Prefix an alias with `=` to make it case-sensitive (used for ambiguous names like `=Go`, `=R`, `=Excel`). |
| `data/roles.json` | Role keyword guides. Each entry becomes an SEO page at `/keywords/<slug>/`. |
| `data/site.json` | Name, URLs, product link, price, analytics. |
| `scripts/build.py` | Static site generator (standard library only). Output goes to `dist/`. |
| `tests/engine.test.js` | Engine tests. |

## Run locally

```bash
node tests/engine.test.js
```

```bash
python3 scripts/build.py
```

```bash
cd dist && python3 -m http.server 8000
```

## Deploy

Pushing to `main` runs the tests, builds the site, and deploys to GitHub Pages (`.github/workflows/deploy.yml`). In the repo, set **Settings > Pages > Source** to **GitHub Actions**.

## Configure

Edit `data/site.json`:

- `kit_url`: your Gumroad (or Lemon Squeezy) product link. Until it is set, buy buttons show "Launching soon".
- `custom_domain`: for example `tailorscan.com`. The build writes a `CNAME` file and switches canonical URLs.
- `goatcounter_code`: free, cookieless analytics from goatcounter.com. Leave it empty to disable.
- `support_email`: shown on the privacy page.

## Add a role page

Append an object to `data/roles.json` with `slug`, `title`, `blurb`, `hard`, `tools`, `soft`, `certs`, `bullets`, and `mistakes`, then rebuild. The sitemap updates automatically.
