# thirdparty-pulse

> How much does each third-party script cost your pages? Estimated bytes, requests and main-thread time per page and per vendor, checked against budgets.

Tag managers, chat widgets, pixels and embeds are usually the heaviest JavaScript on a static site, and nobody owns their weight. `thirdparty-pulse` reads your built HTML, finds every third-party script, inline vendor loader, iframe and asset, estimates its transfer size and main-thread cost from a table of common vendors (or the sizes you configure), and fails CI when a page goes over budget. It also catches the loading mistakes that make third parties expensive: synchronous scripts in `<head>`, the same script included twice, and missing or unused preconnects.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. Works on any static build output (Astro, Next.js `output: 'export'`, Eleventy, Hugo, Jekyll, Docusaurus, VitePress, plain HTML) and runs offline: point it at the folder your build writes. By Louis Wright.

## Features

- **Budgets per page:** third-party script KB (`maxKb`, default 150), requests (`maxRequests`, default 10) and estimated main-thread time (`maxMainThreadMs`, default 250 ms, at `msPerKb` 2.5 ms per compressed KB).
- **Budgets per vendor:** `vendorBudgets` caps a single vendor (e.g. `{"google-tag-manager": 80}`).
- **Weights:** a built-in table of ~45 vendors (analytics, tag managers, chat, video, maps, payments, CDNs) with typical compressed sizes; override or add hosts with `weights` (host, URL glob or vendor id). Unknown hosts get `unknownKb` (30) and an info finding.
- **Loading:** synchronous third-party scripts (high in `<head>`, medium in `<body>`), duplicate includes, heavy vendors that have a facade (YouTube, Maps, chat), early origins without `preconnect`, and preconnects that nothing uses.
- **Report:** the JSON report lists every vendor/origin with its weight, requests and the number of pages it is on.

### Scope

Performance cost only. This is not a privacy, cookie or consent inventory and makes no judgement about what vendors do with data. Weights are estimates from typical transfer sizes; the tool reads files and does not load the site, so confirm big numbers with a lab trace (Lighthouse, WebPageTest).

## Rules

| Rule | Default severity | What it means |
|---|---|---|
| `tp-budget-bytes` | high | Third-party script weight on a page exceeds the byte budget |
| `tp-vendor-budget` | high | A single vendor exceeds its configured byte budget |
| `tp-sync-script` | high | Third-party script loads synchronously (no async/defer) and blocks parsing |
| `tp-budget-main-thread` | medium | Estimated third-party main-thread time on a page exceeds the budget |
| `tp-budget-requests` | medium | Number of third-party requests on a page exceeds the budget |
| `tp-duplicate-script` | medium | The same third-party script or vendor loader is included more than once on a page |
| `tp-heavy-vendor` | low | Heavy vendor script (100 KB+) where a lighter alternative or facade usually exists |
| `tp-no-preconnect` | low | Early third-party origin has no preconnect / dns-prefetch hint |
| `tp-preconnect-unused` | low | preconnect to a third-party origin that the page never uses |
| `tp-unknown-weight` | info | Unrecognised third-party script; a default weight was assumed (set weights in config) |
| `allowlist-expired` | medium | An allowlist entry is past its `expires` date |
| `allowlist-unused` | info | An allowlist entry matched nothing |

## Install and run

```bash
npx thirdparty-pulse dist
npx thirdparty-pulse _site --max-kb 100 --max-requests 6
npx thirdparty-pulse public -f json > third-party.json
```

Pages are mapped to URLs the way static hosts serve them: `index.html` → `/`, `blog/index.html` → `/blog/`, `about.html` → `/about.html` (or `/about` with `--clean-urls`). Pass `--base-url` with your public URL, or let it be inferred from canonical / `og:url` tags. Meta-refresh redirect stubs and `404.html` are skipped. `X-Robots-Tag` and `Link` headers are read from Netlify/Cloudflare `_headers` and `vercel.json`.

### Sample output

```text
thirdparty-pulse — https://example.com
1 page(s), 1 with third-party content, 6 vendor(s)/origin(s), heaviest page ~465 KB of third-party script

HIGH     index.html / loads ~465 KB of third-party script (budget 150 KB): intercom 200 KB, google-tag-manager 90 KB, meta-pixel 75 KB, hotjar 70 KB, cdn.example-widgets.net 30 KB [tp-budget-bytes]
HIGH     index.html:5 Synchronous third-party script https://www.googletagmanager.com/gtm.js?id=GTM-ABC123 on / in <head> [tp-sync-script]
MEDIUM   index.html /: estimated ~1163 ms of third-party main-thread work (budget 250 ms) [tp-budget-main-thread]
MEDIUM   index.html:11 https://static.hotjar.com/c/hotjar-1.js is included 2 times on / [tp-duplicate-script]
LOW      index.html www.googletagmanager.com is requested from <head> on / without a preconnect [tp-no-preconnect]
LOW      index.html connect.facebook.net is requested from <head> on / without a preconnect [tp-no-preconnect]
LOW      index.html static.hotjar.com is requested from <head> on / without a preconnect [tp-no-preconnect]
LOW      index.html widget.intercom.io is requested from <head> on / without a preconnect [tp-no-preconnect]
LOW      index.html cdn.example-widgets.net is requested from <head> on / without a preconnect [tp-no-preconnect]
LOW      index.html:4 preconnect to fonts.unused-cdn.example on /, but nothing on the page loads from it [tp-preconnect-unused]
LOW      index.html:8 Intercom (~200 KB) on / [tp-heavy-vendor]
INFO     index.html:9 cdn.example-widgets.net script on / is not in the vendor table; assumed 30 KB [tp-unknown-weight]

2 high, 2 medium, 7 low, 1 info
✔ Passing (fail-on: none).
```

## Options

```text
thirdparty-pulse 1.0.0 — third-party script weight and load-cost report with budgets

Usage: thirdparty-pulse [site-dir] [options]

Site
      --base-url <url>        Public URL of the site, e.g. https://example.com (default: inferred from canonical/og:url)
      --include <globs>       Only check these pages (file or URL path globs, comma-separated)
      --exclude <globs>       Skip these pages
      --clean-urls            Pages are served without .html (about.html -> /about)
Budgets
      --max-kb <n>             Third-party script KB per page (default 150)
      --max-requests <n>       Third-party requests per page (default 10)
      --max-main-thread <ms>   Estimated third-party main-thread ms per page (default 250)

Common
  -c, --config <file>     JSON config (default: .thirdparty-pulse.json or "thirdpartyPulse" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.thirdparty-pulse.json` (or a `"thirdpartyPulse"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": {
    "tp-budget-bytes": "low"
  },
  "allowlist": [
    {
      "rule": "tp-heavy-vendor",
      "subject": "intercom",
      "reason": "Support chat is a product requirement; facade planned",
      "expires": "2027-03-31"
    }
  ],
  "maxKb": 120,
  "maxMainThreadMs": 200,
  "vendorBudgets": {
    "google-tag-manager": 80
  },
  "weights": {
    "cdn.example-widgets.net": 45
  }
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

Config can also set `baseUrl`, `include`, `exclude` and `cleanUrls`. The config file is looked up in the site directory first, then in the current directory, so `.thirdparty-pulse.json` can live at your repository root. Other keys: `maxKb`, `maxRequests`, `maxMainThreadMs`, `msPerKb`, `unknownKb`, `vendorBudgets` (vendor id or host → KB) and `weights` (host, URL glob or vendor id → KB).

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  thirdparty-pulse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - run: npm ci && npm run build   # produce the static site first
      - uses: MrLouisWright/thirdparty-pulse@v1
        with:
          path: dist
          fail-on: high
          sarif: thirdparty-pulse.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: thirdparty-pulse.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Built site directory (e.g. dist, public, _site) | `.` |
| `base-url` | Public URL of the site, e.g. https://example.com | |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, weightOf, vendorForUrl } from "thirdparty-pulse";
const report = check("dist", { maxKb: 120 });
report.info.vendors; // [{ id, vendor, category, kb, pages, requests }]
vendorForUrl("https://www.googletagmanager.com/gtm.js").kb; // 90
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
