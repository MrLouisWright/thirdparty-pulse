# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Per-page third-party script weight (estimated KB), request count and estimated main-thread time, with budgets (`maxKb`, `maxRequests`, `maxMainThreadMs`) and per-vendor budgets (`vendorBudgets`).
- Built-in table of ~45 common vendors with typical script weights; `weights` config for real transfer sizes and unknown hosts.
- Loading checks: synchronous third-party scripts, duplicate includes, heavy vendors that have facades, missing and unused preconnects.
- Per-vendor totals in the JSON report.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
