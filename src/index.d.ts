import type { Report, Rule } from './core.js';
export * from './core.js';
export interface Vendor { id: string; name: string; company: string; category: string; domains: string[]; kb: number }
export interface ThirdPartyOptions { baseUrl?: string; include?: string[]; exclude?: string[]; cleanUrls?: boolean; maxKb?: number; maxRequests?: number; maxMainThreadMs?: number; toolVersion?: string; now?: Date }
export declare const RULES: Record<string, Rule>;
export declare const DEFAULTS: { maxKb: number; maxRequests: number; maxMainThreadMs: number; msPerKb: number; unknownKb: number; heavyKb: number };
export declare const VENDORS: Vendor[];
export declare function vendorForUrl(url: string): Vendor | null;
export declare function weightOf(res: { url?: string | null; host: string; vendor?: Vendor | null }, config?: Record<string, unknown>): { kb: number; known: boolean };
export declare function check(dir: string, opts?: ThirdPartyOptions, config?: Record<string, unknown>, configFile?: string): Report;
