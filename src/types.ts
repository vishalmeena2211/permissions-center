/**
 * Names understood by `navigator.permissions.query()` in at least one shipping browser.
 *
 * The union is a convenience for autocomplete only — any string is accepted, because the
 * set of powerful features is still growing and every lookup is guarded anyway.
 */
export type PermissionName =
  | 'accelerometer'
  | 'ambient-light-sensor'
  | 'background-fetch'
  | 'background-sync'
  | 'bluetooth'
  | 'camera'
  | 'clipboard-read'
  | 'clipboard-write'
  | 'display-capture'
  | 'geolocation'
  | 'gyroscope'
  | 'idle-detection'
  | 'local-fonts'
  | 'magnetometer'
  | 'microphone'
  | 'midi'
  | 'nfc'
  | 'notifications'
  | 'payment-handler'
  | 'periodic-background-sync'
  | 'persistent-storage'
  | 'push'
  | 'screen-wake-lock'
  | 'speaker-selection'
  | 'storage-access'
  | 'system-wake-lock'
  | 'window-management'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/**
 * The state of a single permission.
 *
 * - `granted` — the site may use the feature now.
 * - `denied` — blocked. The browser will not prompt again; the user has to change a setting.
 * - `prompt` — undecided. Calling {@link request} will show the browser's own prompt.
 * - `unsupported` — this browser does not know the name, or has no Permissions API at all.
 */
export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** Result of {@link query} — one permission and what the browser currently thinks of it. */
export interface PermissionInfo {
  /** The permission name that was queried, echoed back. */
  name: PermissionName;
  /** Current state, or `'unsupported'` when the browser does not recognise the name. */
  state: PermissionState;
  /** `false` when the name (or the Permissions API itself) is not recognised. */
  supported: boolean;
}

/**
 * Result of {@link request}.
 *
 * - `granted` — the user allowed it.
 * - `denied` — the user blocked it, or it was already blocked. Show {@link showHelp}.
 * - `dismissed` — the prompt was closed without a decision; you may ask again later.
 * - `unsupported` — no way to request this feature in this browser.
 * - `error` — the feature exists but failed (no camera attached, hardware busy, timeout…).
 */
export type PermissionOutcome = 'granted' | 'denied' | 'dismissed' | 'unsupported' | 'error';

/** Browser families the instruction matrix has entries for. */
export type BrowserName =
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'safari'
  | 'samsung'
  | 'opera'
  | 'brave'
  | 'unknown';

/** Operating systems the instruction matrix distinguishes. */
export type OSName = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown';

/** Result of {@link detectBrowser}. */
export interface BrowserInfo {
  /** Browser family. `unknown` when nothing matched — instructions still fall back sanely. */
  browser: BrowserName;
  /** Operating system. Chrome OS is reported as `linux`; iPadOS is reported as `ios`. */
  os: OSName;
  /** `true` for phones and tablets. Best effort: some Android tablets report `false`. */
  mobile: boolean;
  /** Major version number of the browser, or `null` when it could not be read. */
  version: number | null;
}

/**
 * Everything {@link detectBrowserFrom} needs. Pass a literal object to unit-test detection,
 * or let {@link detectBrowser} read it from `navigator`.
 */
export interface BrowserEnv {
  /** `navigator.userAgent`. */
  ua?: string | undefined;
  /** `navigator.userAgentData`, when the browser exposes it. Preferred over the UA string. */
  uaData?:
    | {
        brands?: ReadonlyArray<{ brand: string; version: string }> | undefined;
        platform?: string | undefined;
        mobile?: boolean | undefined;
      }
    | undefined;
  /** `navigator.maxTouchPoints`. Above 1 on a Mac-reporting UA means iPadOS. */
  maxTouchPoints?: number | undefined;
  /** `navigator.vendor`. `"Apple Computer, Inc."` in Safari. */
  vendor?: string | undefined;
  /** `true` when `navigator.brave` exists — the only reliable way to spot Brave. */
  brave?: boolean | undefined;
}

/** Human instructions for turning a blocked permission back on. */
export interface Instructions {
  /** The permission these instructions are for. */
  name: PermissionName;
  /** Browser family the steps were written for. */
  browser: BrowserName;
  /** Operating system the steps were written for. */
  os: OSName;
  /** Short heading, e.g. `"Allow camera in Chrome"`. */
  title: string;
  /** Ordered steps, already worded for this permission. Never empty. */
  steps: string[];
  /**
   * A settings URL such as `chrome://settings/content/camera`, or `null` when the browser
   * has no addressable settings page. Present it as copyable text — see {@link Instructions.note}.
   */
  settingsPath: string | null;
  /** Caveats worth showing under the steps. */
  note?: string;
}

/** Overrides for {@link instructions}. Handy for tests and for support screenshots. */
export interface InstructionsOptions {
  /** Pretend to be this browser instead of the detected one. */
  browser?: BrowserName | undefined;
  /** Pretend to be this OS instead of the detected one. */
  os?: OSName | undefined;
}

/** Options for {@link request}. */
export interface RequestOptions {
  /**
   * Constraints handed to `getUserMedia` for `camera` and `microphone`.
   * Defaults to `{ video: true }` / `{ audio: true }`. The resulting tracks are always
   * stopped immediately, so the capture indicator does not stay on.
   */
  media?: MediaStreamConstraints | undefined;
  /** Options handed to `geolocation.getCurrentPosition`. Defaults to a 10s timeout. */
  geolocation?: PositionOptions | undefined;
  /** Open the help sheet automatically when the outcome is `denied`. Default `false`. */
  helpOnDenied?: boolean | undefined;
  /** Options forwarded to {@link showHelp} when `helpOnDenied` fires. */
  help?: HelpOptions | undefined;
}

/** Options for {@link showHelp}. */
export interface HelpOptions {
  /** Accent colour for the header rule and buttons. Default `'#2563eb'`. */
  accent?: string | undefined;
  /** Corner radius of the sheet. Default `'14px'`. */
  radius?: string | undefined;
  /** Colour scheme. `'auto'` follows `prefers-color-scheme`. Default `'auto'`. */
  theme?: 'light' | 'dark' | 'auto' | undefined;
  /** Replace the generated heading. */
  title?: string | undefined;
  /** Replace the generated steps entirely. */
  steps?: string[] | undefined;
  /** Allow closing with Escape, the close button and the backdrop. Default `true`. */
  dismissible?: boolean | undefined;
  /** `z-index` of the host element. Default `2147483000`. */
  zIndex?: number | undefined;
  /** Render instructions for this browser instead of the detected one. */
  browser?: BrowserName | undefined;
  /** Render instructions for this OS instead of the detected one. */
  os?: OSName | undefined;
}
