import { detectBrowser } from './browser.js';
import type {
  BrowserName,
  Instructions,
  InstructionsOptions,
  OSName,
  PermissionName,
} from './types.js';

/**
 * Friendly labels and settings-page slugs per permission.
 *
 * `label` is what a user sees in the browser's own UI — Chrome calls `geolocation`
 * "Location", so telling someone to look for "geolocation" sends them hunting.
 * `slug` is the Chromium `settings/content/<slug>` page, when one exists.
 */
const PERMISSIONS: Record<string, { label: string; slug: string | null }> = {
  camera: { label: 'camera', slug: 'camera' },
  microphone: { label: 'microphone', slug: 'microphone' },
  geolocation: { label: 'location', slug: 'location' },
  notifications: { label: 'notifications', slug: 'notifications' },
  'clipboard-read': { label: 'clipboard', slug: 'clipboard' },
  'clipboard-write': { label: 'clipboard', slug: 'clipboard' },
  midi: { label: 'MIDI device', slug: 'midiDevices' },
  'persistent-storage': { label: 'persistent storage', slug: null },
  'screen-wake-lock': { label: 'screen wake lock', slug: null },
  'display-capture': { label: 'screen sharing', slug: null },
  bluetooth: { label: 'Bluetooth', slug: 'bluetoothDevices' },
  nfc: { label: 'NFC', slug: 'nfcDevices' },
  'idle-detection': { label: 'idle detection', slug: 'idleDetection' },
  'window-management': { label: 'window placement', slug: 'windowManagement' },
  'local-fonts': { label: 'local fonts', slug: 'localFonts' },
  'storage-access': { label: 'storage access', slug: 'cookies' },
  push: { label: 'push messages', slug: 'notifications' },
  'background-sync': { label: 'background sync', slug: 'backgroundSync' },
  'payment-handler': { label: 'payment handler', slug: 'paymentHandler' },
};

/**
 * Turn a permission name into wording a user will recognise in the browser's own menus.
 *
 * @param name Permission name, known or not.
 * @returns A lowercase noun phrase, e.g. `'location'` for `geolocation`.
 */
export function permissionLabel(name: PermissionName): string {
  const known = PERMISSIONS[name];
  if (known) return known.label;
  return String(name).replace(/-/g, ' ');
}

interface GuideEntry {
  /** May contain `{permission}`. */
  title: string;
  /** Each step may contain `{permission}`. */
  steps: string[];
  /** May contain `{slug}`; `null` when the browser exposes no addressable settings page. */
  settingsPath: string | null;
  note?: string;
}

const CHROMIUM_STEPS = [
  'Click the icon at the left of the address bar (the sliders/tune icon, or the lock icon on older versions).',
  'Choose "Site settings".',
  'Find {permission} in the list and set it to "Allow".',
  'Reload this page.',
];

const CHROMIUM_MOBILE_STEPS = [
  'Tap the icon at the left of the address bar.',
  'Tap "Permissions".',
  'Set {permission} to "Allow". If it is not listed, tap "Site settings".',
  'Reload this page.',
];

/**
 * Layer 1: one entry per browser family, written for the desktop build.
 *
 * Contributions welcome — see the "Why the instructions are hardcoded" section of the README.
 */
const BROWSER_GUIDES: Record<BrowserName, GuideEntry> = {
  chrome: {
    title: 'Allow {permission} in Chrome',
    steps: CHROMIUM_STEPS,
    settingsPath: 'chrome://settings/content/{slug}',
  },
  edge: {
    title: 'Allow {permission} in Edge',
    steps: [
      'Click the icon at the left of the address bar (the lock or sliders icon).',
      'Choose "Permissions for this site".',
      'Find {permission} and set it to "Allow".',
      'Reload this page.',
    ],
    settingsPath: 'edge://settings/content/{slug}',
  },
  firefox: {
    title: 'Allow {permission} in Firefox',
    steps: [
      'Click the icon at the left of the address bar.',
      'Find the blocked {permission} entry and click the × (or "Blocked Temporarily") to clear it.',
      'Reload this page and answer the prompt with "Allow".',
      'Still blocked? Open Settings → Privacy & Security → Permissions, click "Settings…" next to {permission}, and remove this site from the list.',
    ],
    settingsPath: 'about:preferences#privacy',
    note: 'Firefox remembers a block for the session unless you cleared "Remember this decision"; clearing the entry above resets it.',
  },
  safari: {
    title: 'Allow {permission} in Safari',
    steps: [
      'With this page open, choose Safari → Settings for This Website… from the menu bar.',
      'Set {permission} to "Allow".',
      'Reload this page.',
      'For every site at once: Safari → Settings → Websites → {permission}.',
    ],
    settingsPath: null,
    note: 'Safari has no settings URL a page can point at, so these steps go through the menu bar.',
  },
  samsung: {
    title: 'Allow {permission} in Samsung Internet',
    steps: [
      'Tap the icon at the left of the address bar.',
      'Tap "Permissions" and set {permission} to "Allow".',
      'If it is not listed: menu (☰) → Settings → Sites and downloads → Site permissions → {permission}.',
      'Reload this page.',
    ],
    settingsPath: null,
  },
  opera: {
    title: 'Allow {permission} in Opera',
    steps: [
      'Click the icon at the left of the address bar (the lock or sliders icon).',
      'Choose "Site settings".',
      'Find {permission} and set it to "Allow".',
      'Reload this page.',
    ],
    settingsPath: 'opera://settings/content/{slug}',
  },
  brave: {
    title: 'Allow {permission} in Brave',
    steps: [
      'Click the icon at the left of the address bar (the sliders/tune icon, or the lock icon).',
      'Choose "Site settings".',
      'Find {permission} and set it to "Allow".',
      'Reload this page.',
    ],
    settingsPath: 'brave://settings/content/{slug}',
    note: 'If it still fails, click the Brave Shields (lion) icon and lower shields for this site — Shields can block a feature even after the permission itself says "Allow".',
  },
  unknown: {
    title: 'Allow {permission} for this site',
    steps: [
      'Open your browser\'s site settings for this page — usually the icon at the left of the address bar.',
      'Find {permission} in the list of permissions.',
      'Set it to "Allow" (or remove the "Block" entry for this site).',
      'Reload this page.',
    ],
    settingsPath: null,
  },
};

/**
 * Layer 2: overrides keyed by `<browser>:<os>`. Only the fields that differ are listed;
 * everything else falls through to {@link BROWSER_GUIDES}.
 */
const OS_OVERRIDES: Record<string, Partial<GuideEntry>> = {
  'chrome:android': {
    steps: CHROMIUM_MOBILE_STEPS,
    settingsPath: 'chrome://settings/content',
    note: 'The all-sites list lives under Chrome ⋮ → Settings → Site settings.',
  },
  'chrome:ios': {
    title: 'Allow {permission} in Chrome for iOS',
    steps: [
      'Open the iOS Settings app.',
      'Scroll down to Chrome.',
      'Turn on {permission}.',
      'Return here and reload the page.',
    ],
    settingsPath: null,
    note: 'On iOS every browser runs on WebKit, and these permissions are granted to the app itself in the iOS Settings app — not per website.',
  },
  'edge:android': {
    steps: CHROMIUM_MOBILE_STEPS,
    settingsPath: 'edge://settings/content',
  },
  'edge:ios': {
    title: 'Allow {permission} in Edge for iOS',
    steps: [
      'Open the iOS Settings app.',
      'Scroll down to Edge.',
      'Turn on {permission}.',
      'Return here and reload the page.',
    ],
    settingsPath: null,
    note: 'On iOS these permissions belong to the browser app, not to the website.',
  },
  'opera:android': {
    steps: CHROMIUM_MOBILE_STEPS,
    settingsPath: null,
  },
  'brave:android': {
    steps: CHROMIUM_MOBILE_STEPS,
    settingsPath: 'brave://settings/content',
    note: 'Also check the Brave Shields (lion) icon for this site — Shields can block a feature the permission allows.',
  },
  'firefox:android': {
    title: 'Allow {permission} in Firefox for Android',
    steps: [
      'Tap the icon at the left of the address bar and clear the blocked {permission} entry, if one is shown.',
      'Otherwise tap ⋮ → Settings → Site permissions → {permission}.',
      'Set it to "Ask to allow" (or remove this site from the exceptions list).',
      'Reload this page and answer the prompt with "Allow".',
    ],
    settingsPath: null,
  },
  'firefox:ios': {
    title: 'Allow {permission} in Firefox for iOS',
    steps: [
      'Open the iOS Settings app.',
      'Scroll down to Firefox.',
      'Turn on {permission}.',
      'Return here and reload the page.',
    ],
    settingsPath: null,
    note: 'On iOS these permissions belong to the browser app, not to the website.',
  },
  'safari:ios': {
    title: 'Allow {permission} in Safari on iOS',
    steps: [
      'Tap the "aA" (or puzzle-piece) icon at the left of the address bar.',
      'Tap "Website Settings".',
      'Set {permission} to "Allow", then tap Done.',
      'Reload this page.',
    ],
    settingsPath: null,
    note: 'Several permissions on iOS are controlled from the Settings app rather than from Safari — if the option is missing here, open Settings → Safari.',
  },
  'safari:macos': {
    settingsPath: null,
    note: 'macOS has a second gate: System Settings → Privacy & Security must also allow Safari to use the feature.',
  },
  'samsung:android': {
    settingsPath: null,
  },
  'unknown:ios': {
    title: 'Allow {permission} on iOS',
    steps: [
      'Open the iOS Settings app.',
      'Find your browser in the list (or open Settings → Safari).',
      'Turn on {permission}.',
      'Return here and reload the page.',
    ],
    settingsPath: null,
    note: 'On iOS most permissions are granted to the browser app in the Settings app, not per website.',
  },
  'unknown:android': {
    steps: [
      'Tap the icon at the left of the address bar.',
      'Open the site permissions list.',
      'Set {permission} to "Allow".',
      'Reload this page.',
    ],
  },
};

/**
 * Layer 3: overrides keyed by `<browser>:<os>:<permission>` for the handful of cases where
 * one permission genuinely lives somewhere else than the rest.
 */
const PERMISSION_OVERRIDES: Record<string, Partial<GuideEntry>> = {
  'safari:ios:geolocation': {
    title: 'Allow location in Safari on iOS',
    steps: [
      'Open the iOS Settings app.',
      'Go to Privacy & Security → Location Services and make sure it is on.',
      'Go to Settings → Apps → Safari → Location and choose "Ask" or "Allow".',
      'Return to Safari and reload this page.',
    ],
    settingsPath: null,
    note: 'Safari on iOS has no per-site location switch in the "aA" menu — location is granted to Safari itself in the Settings app.',
  },
  'safari:macos:geolocation': {
    steps: [
      'With this page open, choose Safari → Settings for This Website… from the menu bar.',
      'Set Location to "Allow".',
      'Open System Settings → Privacy & Security → Location Services and make sure Safari is enabled.',
      'Reload this page.',
    ],
    note: 'macOS blocks location twice: once for the site and once for Safari itself.',
  },
  'safari:macos:notifications': {
    steps: [
      'Choose Safari → Settings → Websites → Notifications from the menu bar.',
      'Find this site and set it to "Allow".',
      'Open System Settings → Notifications → Safari and allow notifications there too.',
      'Reload this page.',
    ],
    note: 'Web push on macOS also needs Safari itself to be allowed to post notifications.',
  },
  'safari:ios:notifications': {
    title: 'Allow notifications in Safari on iOS',
    steps: [
      'Add this site to your Home Screen first — iOS only offers web push to installed web apps.',
      'Open the app from the Home Screen and trigger the notification prompt again.',
      'If you already declined: Settings → Notifications → find the web app → Allow Notifications.',
    ],
    settingsPath: null,
    note: 'Safari on iOS only supports web push for sites added to the Home Screen (iOS 16.4+).',
  },
  'chrome:macos:notifications': {
    note: 'macOS can silence notifications system-wide: check System Settings → Notifications → Chrome, and turn off Focus/Do Not Disturb.',
  },
  'chrome:windows:notifications': {
    note: 'Windows can silence notifications system-wide: check Settings → System → Notifications, and turn off Focus assist.',
  },
};

function fill(text: string, label: string): string {
  return text.replace(/\{permission\}/g, label);
}

/**
 * Get browser-specific, permission-specific instructions for un-blocking a permission.
 *
 * The matrix is resolved in three layers — browser, then `browser:os`, then
 * `browser:os:permission` — so a single odd case (iOS location, say) can override the
 * general steps without duplicating them.
 *
 * @param name Permission to explain, e.g. `'camera'`.
 * @param options Force a `browser` / `os` instead of detecting them.
 * @returns Title, ordered steps, an optional settings path and an optional note.
 */
export function instructions(
  name: PermissionName,
  options: InstructionsOptions = {},
): Instructions {
  const detected = detectBrowser();
  const browser: BrowserName = options.browser ?? detected.browser;
  const os: OSName = options.os ?? detected.os;
  const label = permissionLabel(name);

  const base = BROWSER_GUIDES[browser] ?? BROWSER_GUIDES.unknown;
  const osLayer = OS_OVERRIDES[`${browser}:${os}`] ?? {};
  const permLayer = PERMISSION_OVERRIDES[`${browser}:${os}:${name}`] ?? {};

  const title = permLayer.title ?? osLayer.title ?? base.title;
  const steps = permLayer.steps ?? osLayer.steps ?? base.steps;
  const rawNote = permLayer.note ?? osLayer.note ?? base.note;
  const rawPath =
    permLayer.settingsPath !== undefined
      ? permLayer.settingsPath
      : osLayer.settingsPath !== undefined
        ? osLayer.settingsPath
        : base.settingsPath;

  const slug = PERMISSIONS[name]?.slug ?? null;
  let settingsPath = rawPath;
  if (settingsPath !== null && settingsPath.includes('{slug}')) {
    // No dedicated page for this feature — fall back to the content-settings index.
    settingsPath = slug
      ? settingsPath.replace('{slug}', slug)
      : settingsPath.replace('/{slug}', '');
  }

  const notes: string[] = [];
  if (rawNote) notes.push(fill(rawNote, label));
  if (settingsPath !== null && !/^https?:/.test(settingsPath)) {
    const scheme = settingsPath.slice(0, settingsPath.indexOf(':') + 1);
    notes.push(
      `Browsers block a page from navigating to ${scheme} addresses, so copy "${settingsPath}" and paste it into the address bar yourself.`,
    );
  }

  const result: Instructions = {
    name,
    browser,
    os,
    title: fill(title, label),
    steps: steps.map((s) => fill(s, label)),
    settingsPath,
  };
  if (notes.length > 0) result.note = notes.join(' ');
  return result;
}
