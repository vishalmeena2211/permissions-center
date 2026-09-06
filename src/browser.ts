import type { BrowserEnv, BrowserInfo, BrowserName, OSName } from './types.js';

function major(source: string, re: RegExp): number | null {
  const m = re.exec(source);
  if (!m || !m[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function brandVersion(
  brands: ReadonlyArray<{ brand: string; version: string }>,
  needle: string,
): number | null {
  for (const b of brands) {
    if (b.brand.toLowerCase().includes(needle)) {
      const n = Number.parseInt(b.version, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function detectOS(ua: string, platform: string, maxTouchPoints: number): OSName {
  if (platform) {
    if (platform.includes('win')) return 'windows';
    if (platform.includes('android')) return 'android';
    if (platform.includes('ios') || platform.includes('iphone') || platform.includes('ipad')) {
      return 'ios';
    }
    if (platform.includes('mac')) return maxTouchPoints > 1 ? 'ios' : 'macos';
    if (platform.includes('linux') || platform.includes('chrome os') || platform.includes('cros')) {
      return 'linux';
    }
  }
  if (/iphone|ipod|ipad/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/windows|win32|win64/.test(ua)) return 'windows';
  // iPadOS ships a desktop user-agent string; touch points are the documented tell.
  if (/mac os x|macintosh/.test(ua)) return maxTouchPoints > 1 ? 'ios' : 'macos';
  if (/cros|x11|linux/.test(ua)) return 'linux';
  return 'unknown';
}

/**
 * Pure browser/OS detection over an injected environment. `detectBrowser()` is a thin
 * wrapper that fills this in from `navigator`.
 *
 * Matching order matters and is deliberate: Brave, Edge, Samsung Internet and Opera all
 * ship Chrome's user-agent string, and Chrome ships Safari's, so the derivatives are
 * checked before the browsers they impersonate.
 *
 * @param env userAgent, userAgentData, maxTouchPoints, vendor and a Brave flag.
 * @returns The detected `{ browser, os, mobile, version }`.
 */
export function detectBrowserFrom(env: BrowserEnv = {}): BrowserInfo {
  const ua = (env.ua ?? '').toLowerCase();
  const vendor = (env.vendor ?? '').toLowerCase();
  const brands = env.uaData?.brands ?? [];
  const platform = (env.uaData?.platform ?? '').toLowerCase();
  const maxTouchPoints = env.maxTouchPoints ?? 0;

  const hasBrand = (needle: string): boolean =>
    brands.some((b) => b.brand.toLowerCase().includes(needle));

  const os = detectOS(ua, platform, maxTouchPoints);

  let browser: BrowserName = 'unknown';
  let version: number | null = null;

  if (env.brave === true || hasBrand('brave')) {
    browser = 'brave';
    version = major(ua, /(?:chrome|crios)\/(\d+)/) ?? brandVersion(brands, 'chromium');
  } else if (hasBrand('microsoft edge') || /edg(?:e|a|ios)?\//.test(ua)) {
    browser = 'edge';
    version = major(ua, /edg(?:e|a|ios)?\/(\d+)/) ?? brandVersion(brands, 'microsoft edge');
  } else if (hasBrand('samsung') || /samsungbrowser\//.test(ua)) {
    browser = 'samsung';
    version = major(ua, /samsungbrowser\/(\d+)/) ?? brandVersion(brands, 'samsung');
  } else if (hasBrand('opera') || /opr\/|opios\/|\bopera\b/.test(ua)) {
    browser = 'opera';
    version =
      major(ua, /(?:opr|opios)\/(\d+)/) ??
      major(ua, /opera[ /](\d+)/) ??
      brandVersion(brands, 'opera');
  } else if (/firefox\/|fxios\//.test(ua)) {
    browser = 'firefox';
    version = major(ua, /(?:firefox|fxios)\/(\d+)/);
  } else if (hasBrand('chromium') || hasBrand('google chrome') || /chrome\/|crios\//.test(ua)) {
    browser = 'chrome';
    version =
      major(ua, /(?:chrome|crios)\/(\d+)/) ??
      brandVersion(brands, 'google chrome') ??
      brandVersion(brands, 'chromium');
  } else if (/safari\//.test(ua) || vendor.includes('apple')) {
    browser = 'safari';
    version = major(ua, /version\/(\d+)/);
  }

  const mobile =
    env.uaData?.mobile ??
    (os === 'ios' || os === 'android' || /mobi|iemobile|tablet|silk/.test(ua));

  return { browser, os, mobile, version };
}

/**
 * Detect the current browser and operating system.
 *
 * Prefers `navigator.userAgentData` where it exists and falls back to the user-agent string.
 * Safe to call on the server: it returns `{ browser: 'unknown', os: 'unknown', mobile: false,
 * version: null }`.
 *
 * @returns The detected {@link BrowserInfo}.
 */
export function detectBrowser(): BrowserInfo {
  if (typeof navigator === 'undefined') {
    return { browser: 'unknown', os: 'unknown', mobile: false, version: null };
  }
  const nav = navigator as Navigator & {
    userAgentData?: {
      brands?: ReadonlyArray<{ brand: string; version: string }>;
      platform?: string;
      mobile?: boolean;
    };
    brave?: unknown;
  };
  // Privacy extensions and hardened runtimes can make these accessors throw. Detection is
  // a best-effort hint, never a hard dependency, so a failure degrades to `unknown`
  // instead of taking `instructions()` and `showHelp()` down with it.
  let env: BrowserEnv;
  try {
    env = {
      ua: typeof nav.userAgent === 'string' ? nav.userAgent : '',
      uaData: nav.userAgentData,
      maxTouchPoints: typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0,
      vendor: typeof nav.vendor === 'string' ? nav.vendor : '',
      brave: nav.brave !== undefined && nav.brave !== null,
    };
  } catch {
    env = {};
  }
  return detectBrowserFrom(env);
}
