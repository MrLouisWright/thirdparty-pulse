// thirdparty-pulse: third-party script weight and load-cost report for a built static site.
// Per page and per vendor: requests, estimated bytes and estimated main-thread time, checked against budgets,
// plus loading mistakes (synchronous third-party scripts, duplicates, missing/unused preconnects).
// Performance only: this is not a privacy or consent inventory. Zero dependencies. Louis Wright, MIT.
import { runBeacon, finder, globToRe, contentPages } from './site.js';
import { buildReport, UsageError } from './core.js';
import { thirdPartyResources, hostOf } from './vendors.js';

export * from './core.js';
export { loadSite, parseHtml, SITE_OPTIONS, SITE_HELP } from './site.js';
export { VENDORS, vendorForUrl } from './vendors.js';

export const RULES = {
  'tp-budget-bytes': { severity: 'high', title: 'Third-party script weight on a page exceeds the byte budget' },
  'tp-vendor-budget': { severity: 'high', title: 'A single vendor exceeds its configured byte budget' },
  'tp-sync-script': { severity: 'high', title: 'Third-party script loads synchronously (no async/defer) and blocks parsing' },
  'tp-budget-main-thread': { severity: 'medium', title: 'Estimated third-party main-thread time on a page exceeds the budget' },
  'tp-budget-requests': { severity: 'medium', title: 'Number of third-party requests on a page exceeds the budget' },
  'tp-duplicate-script': { severity: 'medium', title: 'The same third-party script or vendor loader is included more than once on a page' },
  'tp-heavy-vendor': { severity: 'low', title: 'Heavy vendor script (100 KB+) where a lighter alternative or facade usually exists' },
  'tp-no-preconnect': { severity: 'low', title: 'Early third-party origin has no preconnect / dns-prefetch hint' },
  'tp-preconnect-unused': { severity: 'low', title: 'preconnect to a third-party origin that the page never uses' },
  'tp-unknown-weight': { severity: 'info', title: 'Unrecognised third-party script; a default weight was assumed (set weights in config)' },
};
export const DEFAULTS = { maxKb: 150, maxRequests: 10, maxMainThreadMs: 250, msPerKb: 2.5, unknownKb: 30, heavyKb: 100 };
const HEAVY_TIP = { youtube: 'Use a click-to-load facade (lite-youtube-embed).', 'google-maps': 'Use a static map image that loads the interactive map on click.', intercom: 'Load the chat widget on first interaction.', zendesk: 'Load the chat widget on first interaction.', drift: 'Load the chat widget on first interaction.', hubspot: 'Load forms/chat on interaction.', disqus: 'Load comments when scrolled into view.', 'google-tag-manager': 'Audit tags in the container; remove unused ones.' };

/** Estimated weight (KB, compressed) of a third-party resource: config.weights (host or URL glob) > vendor table > unknownKb. */
export function weightOf(res, config = {}) {
  for (const [k, kb] of Object.entries(config.weights || {})) { const re = globToRe(k); if ((res.url && re.test(res.url.replace(/^https?:\/\//, '').replace(/^\/\//, ''))) || re.test(res.host) || (res.vendor && res.vendor.id === k)) return { kb: Number(kb), known: true }; }
  if (res.vendor) return { kb: res.vendor.kb, known: true };
  return { kb: config.unknownKb ?? DEFAULTS.unknownKb, known: false };
}

function analyze(site, opts, config) {
  const { findings, add } = finder(RULES);
  const c = { ...DEFAULTS, ...config };
  const siteHost = site.origin ? hostOf(site.origin) : null;
  const totals = new Map(); let pagesWithTp = 0; let maxPage = 0;
  const pages = contentPages(site);
  for (const pg of pages) {
    const doc = pg.doc; const res = thirdPartyResources(doc, siteHost);
    const scripts = res.filter((r) => r.kind === 'script' || r.kind === 'inline');
    const requests = res.filter((r) => r.kind !== 'hint' && r.kind !== 'inline');
    if (!scripts.length && !requests.length) continue; pagesWithTp++;
    let kb = 0; const vendorKb = new Map(); const seen = new Map();
    for (const s of scripts) {
      const key = s.url ? s.url.replace(/^https?:/, '') : `inline:${s.vendor.id}`;
      // An inline loader for a vendor whose script tag is also present counts once.
      if (s.inline && scripts.some((o) => !o.inline && o.vendor?.id === s.vendor.id)) continue;
      if (seen.has(key)) { add('tp-duplicate-script', pg.path, `${s.url || s.vendor.name + ' loader'} is included ${seen.get(key) + 1} times on ${pg.path}`, 'Include each third-party script once (check layouts, partials and tag manager tags).', { file: pg.file, line: s.line }); seen.set(key, seen.get(key) + 1); continue; }
      seen.set(key, 1);
      const w = weightOf(s, c); kb += w.kb; const vid = s.vendor?.id || s.host;
      vendorKb.set(vid, (vendorKb.get(vid) || 0) + w.kb);
      const t = totals.get(vid) || { vendor: s.vendor?.name || s.host, category: s.vendor?.category || 'unknown', kb: w.kb, pages: 0, requests: 0 }; t.pages++; t.requests++; totals.set(vid, t);
      if (!w.known && s.url) add('tp-unknown-weight', s.host, `${s.host} script on ${pg.path} is not in the vendor table; assumed ${w.kb} KB`, `Add "weights": { "${s.host}": <KB> } to the config with the real transfer size.`, { file: pg.file, line: s.line });
      if (s.kind === 'script') {
        const a = s.el.attrs;
        if (a.async === undefined && a.defer === undefined && !/module/i.test(a.type || '')) add('tp-sync-script', s.url, `Synchronous third-party script ${s.url} on ${pg.path}${s.el.inHead ? ' in <head>' : ''}`, 'Add async (independent scripts) or defer (order-dependent), or load it after the page is interactive.', { file: pg.file, line: s.line, severity: s.el.inHead ? undefined : 'medium' });
      }
      if (s.vendor && s.vendor.kb >= c.heavyKb) add('tp-heavy-vendor', s.vendor.id, `${s.vendor.name} (~${s.vendor.kb} KB) on ${pg.path}`, HEAVY_TIP[s.vendor.id] || 'Load it on interaction or after the load event, or use a lighter alternative.', { file: pg.file, line: s.line });
    }
    for (const r of requests) if (r.kind !== 'script') { const vid = r.vendor?.id || r.host; const t = totals.get(vid) || { vendor: r.vendor?.name || r.host, category: r.vendor?.category || 'unknown', kb: 0, pages: 0, requests: 0 }; t.requests++; totals.set(vid, t); }
    const ms = Math.round(kb * c.msPerKb); maxPage = Math.max(maxPage, kb);
    if (kb > c.maxKb) add('tp-budget-bytes', pg.path, `${pg.path} loads ~${Math.round(kb)} KB of third-party script (budget ${c.maxKb} KB): ${[...vendorKb].sort((a, b) => b[1] - a[1]).map(([v, k]) => `${v} ${Math.round(k)} KB`).join(', ')}`, 'Remove, defer or replace the heaviest vendors, or raise maxKb deliberately.', { file: pg.file });
    if (ms > c.maxMainThreadMs) add('tp-budget-main-thread', pg.path, `${pg.path}: estimated ~${ms} ms of third-party main-thread work (budget ${c.maxMainThreadMs} ms)`, 'Delay non-essential vendors until after load or user interaction; measure with a lab trace to confirm.', { file: pg.file });
    if (requests.length > c.maxRequests) add('tp-budget-requests', pg.path, `${pg.path} makes ${requests.length} third-party requests (budget ${c.maxRequests})`, 'Consolidate vendors or self-host static assets (fonts, libraries).', { file: pg.file });
    for (const [vid, k] of vendorKb) { const b = (c.vendorBudgets || {})[vid]; if (b != null && k > b) add('tp-vendor-budget', vid, `${vid} uses ~${Math.round(k)} KB on ${pg.path} (budget ${b} KB)`, 'Trim this vendor\'s configuration or raise its budget.', { file: pg.file }); }
    // preconnect hints
    const hints = doc.all.filter((e) => e.tag === 'link' && /preconnect|dns-prefetch/i.test(e.attrs.rel || '') && e.attrs.href);
    const hinted = new Set(hints.map((e) => hostOf(e.attrs.href)));
    const used = new Set(res.filter((r) => r.kind !== 'hint').map((r) => r.host));
    for (const h of hints) { const host = hostOf(h.attrs.href); if (/preconnect/i.test(h.attrs.rel) && host && !used.has(host) && !(siteHost && host === siteHost)) add('tp-preconnect-unused', host, `preconnect to ${host} on ${pg.path}, but nothing on the page loads from it`, 'Remove unused preconnects: each opens a connection that competes with critical requests.', { file: pg.file, line: h.line }); }
    const early = new Set(scripts.filter((s) => s.kind === 'script' && s.el.inHead && s.el.attrs.defer === undefined).map((s) => s.host));
    for (const host of early) if (!hinted.has(host)) add('tp-no-preconnect', host, `${host} is requested from <head> on ${pg.path} without a preconnect`, `Add <link rel="preconnect" href="https://${host}" crossorigin> early in <head>.`, { file: pg.file });
  }
  const vendors = [...totals.entries()].map(([id, t]) => ({ id, ...t })).sort((a, b) => b.kb - a.kb);
  return { findings, info: { pagesWithThirdParty: pagesWithTp, maxPageKb: Math.round(maxPage), vendors }, summary: `${pages.length} page(s), ${pagesWithTp} with third-party content, ${vendors.length} vendor(s)/origin(s), heaviest page ~${Math.round(maxPage)} KB of third-party script` };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'thirdparty-pulse', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '📦', defaultFile: 'index.html' };
  const cfg = { ...config }; for (const [k, o] of [['maxKb', 'maxKb'], ['maxRequests', 'maxRequests'], ['maxMainThreadMs', 'maxMainThreadMs']]) if (opts[o] != null) cfg[k] = opts[o];
  for (const k of ['maxKb', 'maxRequests', 'maxMainThreadMs', 'msPerKb', 'unknownKb']) if (cfg[k] != null && !(Number(cfg[k]) >= 0)) throw new UsageError(`${k} must be a non-negative number`);
  return runBeacon(tool, dir, { ...opts, UsageError }, cfg, configFile, analyze, buildReport);
}
