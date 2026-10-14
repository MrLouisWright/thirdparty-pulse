#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, SITE_OPTIONS, SITE_HELP } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const num = (v) => (v == null ? undefined : Number(v));
mainCli({
  name: 'thirdparty-pulse', version: pkg.version, configKey: 'thirdpartyPulse', rules: RULES,
  tagline: 'third-party script weight and load-cost report with budgets',
  usage: 'Usage: thirdparty-pulse [site-dir] [options]',
  help: `${SITE_HELP}Budgets
      --max-kb <n>             Third-party script KB per page (default 150)
      --max-requests <n>       Third-party requests per page (default 10)
      --max-main-thread <ms>   Estimated third-party main-thread ms per page (default 250)
`,
  options: { ...SITE_OPTIONS, 'max-kb': { type: 'string' }, 'max-requests': { type: 'string' }, 'max-main-thread': { type: 'string' } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { cli: o, maxKb: num(o['max-kb']), maxRequests: num(o['max-requests']), maxMainThreadMs: num(o['max-main-thread']), toolVersion: pkg.version }, config, configFile),
});
