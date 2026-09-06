import { detectBrowser, detectBrowserFrom } from './browser.js';
import { instructions, permissionLabel } from './instructions.js';
import { closeHelp, showHelp } from './sheet.js';
import type {
  PermissionInfo,
  PermissionName,
  PermissionOutcome,
  PermissionState,
  RequestOptions,
} from './types.js';

export type {
  BrowserEnv,
  BrowserInfo,
  BrowserName,
  HelpOptions,
  Instructions,
  InstructionsOptions,
  OSName,
  PermissionInfo,
  PermissionName,
  PermissionOutcome,
  PermissionState,
  RequestOptions,
} from './types.js';

export { detectBrowser, detectBrowserFrom } from './browser.js';
export { instructions, permissionLabel } from './instructions.js';
export { closeHelp, showHelp } from './sheet.js';

/**
 * The permissions {@link queryAll} looks at when you do not pass a list. Chosen because
 * every one of them is queryable in at least one shipping browser.
 */
export const COMMON_PERMISSIONS: readonly PermissionName[] = [
  'camera',
  'microphone',
  'geolocation',
  'notifications',
  'clipboard-read',
  'clipboard-write',
  'persistent-storage',
  'midi',
  'screen-wake-lock',
];

function unsupported(name: PermissionName): PermissionInfo {
  return { name, state: 'unsupported', supported: false };
}

/**
 * Whether this environment has a usable `navigator.permissions.query`.
 *
 * `false` on the server, in older Safari, and anywhere the API was removed. Every other
 * function in this package still works when this is `false` — they just report
 * `'unsupported'` instead of guessing.
 *
 * @returns `true` when permissions can be queried.
 */
export function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.permissions?.query === 'function'
  );
}

/**
 * Read the current state of one permission.
 *
 * `navigator.permissions.query()` throws a `TypeError` for names the browser does not
 * know — Firefox has no `camera`, Safari has almost nothing — so the call is individually
 * guarded and an unknown name resolves to `{ state: 'unsupported', supported: false }`.
 * This never rejects.
 *
 * @param name Permission to read, e.g. `'camera'`.
 * @returns The permission's {@link PermissionInfo}.
 */
export async function query(name: PermissionName): Promise<PermissionInfo> {
  if (!isSupported()) return unsupported(name);
  try {
    const status = await navigator.permissions.query({
      name,
    } as unknown as PermissionDescriptor);
    return { name, state: status.state as PermissionState, supported: true };
  } catch {
    // TypeError for an unknown name, or a SecurityError in a restricted context.
    return unsupported(name);
  }
}

/**
 * Read several permissions at once.
 *
 * Each name is queried independently, so one unknown name cannot fail the batch — the
 * returned promise never rejects.
 *
 * @param names Permissions to read. Defaults to {@link COMMON_PERMISSIONS}.
 * @returns A record keyed by permission name.
 */
export async function queryAll(
  names: readonly PermissionName[] = COMMON_PERMISSIONS,
): Promise<Record<string, PermissionInfo>> {
  const results = await Promise.all(names.map((name) => query(name)));
  const out: Record<string, PermissionInfo> = {};
  names.forEach((name, i) => {
    const info = results[i];
    if (info) out[String(name)] = info;
  });
  return out;
}

/**
 * Watch one permission and get called whenever it changes — including when the user
 * changes it in browser settings in another tab.
 *
 * The listener is called once with the current value as soon as it is known, then on every
 * `change` event of the underlying `PermissionStatus`. Unknown names get one
 * `'unsupported'` call and nothing more.
 *
 * @param name Permission to watch.
 * @param listener Called with the latest {@link PermissionInfo}.
 * @returns An unsubscribe function. Calling it removes the `change` listener.
 */
export function observe(
  name: PermissionName,
  listener: (info: PermissionInfo) => void,
): () => void {
  if (!isSupported()) {
    listener(unsupported(name));
    return () => {};
  }

  let disposed = false;
  let detach: (() => void) | null = null;

  let pending: Promise<PermissionStatus>;
  try {
    pending = navigator.permissions.query({ name } as unknown as PermissionDescriptor);
  } catch {
    listener(unsupported(name));
    return () => {};
  }

  pending.then(
    (status) => {
      if (disposed) return;
      const emit = (): void => {
        listener({ name, state: status.state as PermissionState, supported: true });
      };
      emit();
      const handler = (): void => emit();
      if (typeof status.addEventListener === 'function') {
        status.addEventListener('change', handler);
        detach = () => status.removeEventListener('change', handler);
      } else {
        const previous = status.onchange;
        status.onchange = handler;
        detach = () => {
          status.onchange = previous;
        };
      }
    },
    () => {
      if (!disposed) listener(unsupported(name));
    },
  );

  return () => {
    if (disposed) return;
    disposed = true;
    if (detach) {
      detach();
      detach = null;
    }
  };
}

interface NavigatorExtras {
  wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
  storage?: { persist?(): Promise<boolean> };
  requestMIDIAccess?(options?: { sysex?: boolean }): Promise<unknown>;
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // A track can already be ended; nothing to do.
    }
  }
}

function mapError(error: unknown): PermissionOutcome {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'denied';
    case 'AbortError':
      return 'dismissed';
    case 'NotFoundError':
    case 'NotReadableError':
    case 'OverconstrainedError':
      return 'error';
    default:
      return 'error';
  }
}

async function requestMedia(
  kind: 'video' | 'audio',
  options: RequestOptions,
): Promise<PermissionOutcome> {
  const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!media || typeof media.getUserMedia !== 'function') return 'unsupported';
  const constraints: MediaStreamConstraints =
    options.media ?? (kind === 'video' ? { video: true } : { audio: true });
  const stream = await media.getUserMedia(constraints);
  // Release the device immediately — otherwise the camera light stays on for a
  // permission check the user never asked to be filmed for.
  stopTracks(stream);
  return 'granted';
}

/**
 * How each permission is actually asked for. The Permissions API cannot prompt; only the
 * feature's own API can, and each one reports the answer differently.
 */
const REQUESTERS: Record<string, (options: RequestOptions) => Promise<PermissionOutcome>> = {
  camera: (options) => requestMedia('video', options),
  microphone: (options) => requestMedia('audio', options),

  geolocation: (options) =>
    new Promise<PermissionOutcome>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve('unsupported');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (error) => resolve(error.code === 1 ? 'denied' : 'error'),
        options.geolocation ?? { timeout: 10000, maximumAge: 0 },
      );
    }),

  notifications: async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    const permission = await new Promise<NotificationPermission>((resolve, reject) => {
      try {
        // Safari <16 only supports the callback form and returns undefined; every other
        // engine returns a promise. Passing both covers the pair without double-prompting.
        const maybe = Notification.requestPermission((value) => resolve(value));
        if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
    if (permission === 'granted') return 'granted';
    if (permission === 'denied') return 'denied';
    return 'dismissed';
  },

  'clipboard-read': async () => {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.read !== 'function') return 'unsupported';
    await clipboard.read();
    return 'granted';
  },

  'persistent-storage': async () => {
    const storage = (navigator as unknown as NavigatorExtras).storage;
    if (!storage || typeof storage.persist !== 'function') return 'unsupported';
    return (await storage.persist()) ? 'granted' : 'denied';
  },

  'screen-wake-lock': async () => {
    const wakeLock = (navigator as unknown as NavigatorExtras).wakeLock;
    if (!wakeLock || typeof wakeLock.request !== 'function') return 'unsupported';
    const sentinel = await wakeLock.request('screen');
    await sentinel.release();
    return 'granted';
  },

  midi: async () => {
    const nav = navigator as unknown as NavigatorExtras;
    if (typeof nav.requestMIDIAccess !== 'function') return 'unsupported';
    await nav.requestMIDIAccess();
    return 'granted';
  },
};

/**
 * Actually ask for a permission — the thing `navigator.permissions.query()` cannot do.
 *
 * **Call this from a user gesture** (a click or tap handler). Browsers ignore or
 * auto-reject prompts that are not tied to one, and repeated auto-prompts get a site
 * put on Chrome's abusive-notification list.
 *
 * Camera and microphone tracks are stopped the moment they arrive, so no capture
 * indicator is left running.
 *
 * @param name Permission to request. Names with no way to prompt return `'unsupported'`.
 * @param options Media constraints, geolocation options, and optional auto-help on denial.
 * @returns One of `granted` / `denied` / `dismissed` / `unsupported` / `error`.
 */
export async function request(
  name: PermissionName,
  options: RequestOptions = {},
): Promise<PermissionOutcome> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  const requester = REQUESTERS[String(name)];
  if (!requester) return 'unsupported';

  let outcome: PermissionOutcome;
  try {
    outcome = await requester(options);
  } catch (error) {
    outcome = mapError(error);
  }

  if (outcome === 'denied' && options.helpOnDenied) {
    void showHelp(name, options.help ?? {});
  }
  return outcome;
}

/**
 * Everything the package exports, as one object — this is what the IIFE build puts on
 * `window.PermissionsCenter`.
 */
const PermissionsCenter = {
  COMMON_PERMISSIONS,
  closeHelp,
  detectBrowser,
  detectBrowserFrom,
  instructions,
  isSupported,
  observe,
  permissionLabel,
  query,
  queryAll,
  request,
  showHelp,
};

export default PermissionsCenter;
