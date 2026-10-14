import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, weightOf, vendorForUrl, runCli, RULES } from '../src/index.js';

const ids = (r) => [...new Set(r.findings.map((f) => f.rule))].sort();
const io = () => { const o = { s: '', e: '' }; return { o, io: { stdout: { write: (x) => { o.s += x; } }, stderr: { write: (x) => { o.e += x; } } } }; };
const site = (head, body = '') => { const d = mkdtempSync(join(tmpdir(), 'tp-')); writeFileSync(join(d, 'index.html'), `<!doctype html><html><head><title>t</title>${head}</head><body><p>x</p>${body}</body></html>`); return d; };
const cli = { name: 'thirdparty-pulse', version: '1.0.0', configKey: 'thirdpartyPulse', rules: RULES, tagline: 't', usage: 'u', help: '', options: {}, run: async ({ dir, config }) => check(dir, {}, config) };

test('good fixture is clean at info', () => assert.deepEqual(ids(check('test/fixtures/good')), []));
test('bad fixture', () => assert.deepEqual(ids(check('test/fixtures/bad')), ['tp-budget-bytes', 'tp-budget-main-thread', 'tp-duplicate-script', 'tp-heavy-vendor', 'tp-no-preconnect', 'tp-preconnect-unused', 'tp-sync-script', 'tp-unknown-weight']));
test('vendor lookup and weights', () => {
  assert.equal(vendorForUrl('https://www.googletagmanager.com/gtag/js?id=G-1').id, 'google-tag-manager');
  assert.equal(weightOf({ url: 'https://cdn.x.net/a.js', host: 'cdn.x.net' }).known, false);
  assert.equal(weightOf({ url: 'https://cdn.x.net/a.js', host: 'cdn.x.net' }, { weights: { 'cdn.x.net': 12 } }).kb, 12);
  assert.equal(weightOf({ url: 'https://cdn.x.net/a.js', host: 'cdn.x.net' }, { weights: { 'cdn.x.net/*': 7 } }).kb, 7);
});
test('budget: request count', () => {
  const imgs = Array.from({ length: 4 }, (_, i) => `<img src="https://img${i}.cdn-x.net/a.png" alt="">`).join('');
  assert.deepEqual(ids(check(site('', imgs), {}, { maxRequests: 3 })), ['tp-budget-requests']);
  assert.deepEqual(ids(check(site('', imgs))), []);
});
test('budget: per-vendor and CLI overrides', () => {
  const d = site('', '<script async src="https://connect.facebook.net/en_US/fbevents.js"></script>');
  assert.deepEqual(ids(check(d, {}, { vendorBudgets: { 'meta-pixel': 50 } })), ['tp-vendor-budget']);
  assert.deepEqual(ids(check(d, { maxKb: 40 })), ['tp-budget-bytes']);
  assert.deepEqual(ids(check(d, { maxMainThreadMs: 100 })), ['tp-budget-main-thread']);
});
test('sync script in body is medium, in head is high', () => {
  const b = check(site('', '<script src="https://plausible.io/js/script.js"></script>')).findings.find((f) => f.rule === 'tp-sync-script');
  assert.equal(b.severity, 'medium');
  const h = check(site('<link rel="preconnect" href="https://plausible.io"><script src="https://plausible.io/js/script.js"></script>')).findings;
  assert.equal(h.find((f) => f.rule === 'tp-sync-script').severity, 'high'); assert.ok(!h.some((f) => f.rule === 'tp-no-preconnect'));
});
test('inline loader plus script tag counts once; first-party ignored', () => {
  const d = site('<script>(function(w,d){w.fbq=1})(window,document)</script><script async src="https://connect.facebook.net/en_US/fbevents.js"></script><script src="https://example.com/a.js"></script><link rel="canonical" href="https://example.com/">');
  const r = check(d); assert.deepEqual(r.info.vendors.map((v) => v.id), ['meta-pixel']); assert.ok(!ids(r).includes('tp-duplicate-script'));
});
test('JSON info lists vendor totals', () => { const r = check('test/fixtures/bad'); assert.ok(r.info.maxPageKb > 150); assert.equal(r.info.vendors[0].id, 'intercom'); });
test('allowlist with expiry', () => {
  const cfg = { allowlist: [{ rule: 'tp-heavy-vendor', reason: 'chat is required', expires: '2099-01-01' }] };
  assert.ok(!ids(check('test/fixtures/bad', {}, cfg)).includes('tp-heavy-vendor'));
  const old = { allowlist: [{ rule: 'tp-heavy-vendor', reason: 'x', expires: '2020-01-01' }] };
  assert.ok(ids(check('test/fixtures/bad', {}, old)).includes('allowlist-expired'));
});
test('bad budget is a usage error', () => assert.throws(() => check('test/fixtures/good', { maxKb: -1 }), /non-negative/));
test('CLI exit codes and formats', async () => {
  let t = io(); assert.equal(await runCli(cli, ['test/fixtures/good', '--fail-on', 'info'], t.io), 0);
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/bad', '-f', 'sarif'], t.io), 1); assert.equal(JSON.parse(t.o.s).version, '2.1.0');
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/bad', '-f', 'json', '--fail-on', 'none'], t.io), 0); assert.ok(JSON.parse(t.o.s).findings.length);
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/bad', '-f', 'markdown'], t.io), 1); assert.match(t.o.s, /tp-sync-script/);
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/none'], t.io), 2);
});
