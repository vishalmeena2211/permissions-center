import { test } from 'node:test';
import assert from 'node:assert/strict';

import PermissionsCenter, {
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
} from '../dist/index.js';

/* ------------------------------------------------------------------ *
 * 1. SSR safety — this whole file runs in Node with no window at all.
 * ------------------------------------------------------------------ */

test('importing without a DOM does not throw', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof PermissionsCenter, 'object');
});

test('isSupported() is false with no DOM', () => {
  assert.equal(isSupported(), false);
});

test('query() resolves to unsupported with no DOM', async () => {
  assert.deepEqual(await query('camera'), {
    name: 'camera',
    state: 'unsupported',
    supported: false,
  });
});

test('queryAll() resolves every default name to unsupported with no DOM', async () => {
  const all = await queryAll();
  assert.equal(Object.keys(all).length, COMMON_PERMISSIONS.length);
  for (const name of COMMON_PERMISSIONS) {
    assert.equal(all[name].state, 'unsupported', name);
    assert.equal(all[name].supported, false, name);
  }
});

test('observe() emits once and returns a working no-op disposer with no DOM', () => {
  const seen = [];
  const stop = observe('camera', (info) => seen.push(info));
  assert.equal(typeof stop, 'function');
  assert.deepEqual(seen, [{ name: 'camera', state: 'unsupported', supported: false }]);
  stop();
  stop();
  assert.equal(seen.length, 1);
});

test('request() resolves to unsupported with no DOM', async () => {
  assert.equal(await request('camera'), 'unsupported');
});

test('showHelp() resolves and closeHelp() is a no-op with no DOM', async () => {
  await showHelp('camera');
  closeHelp();
  closeHelp();
});

test('detectBrowser() degrades to unknown with no navigator data', () => {
  const info = detectBrowser();
  assert.equal(typeof info.browser, 'string');
  assert.equal(typeof info.os, 'string');
  assert.equal(typeof info.mobile, 'boolean');
});

/* ------------------------------------------------------------------ *
 * 2. API surface
 * ------------------------------------------------------------------ */

test('every documented export exists with the right type', () => {
  const fns = {
    query,
    queryAll,
    observe,
    request,
    instructions,
    showHelp,
    closeHelp,
    detectBrowser,
    detectBrowserFrom,
    isSupported,
    permissionLabel,
  };
  for (const [name, value] of Object.entries(fns)) {
    assert.equal(typeof value, 'function', `${name} should be a function`);
  }
  assert.ok(Array.isArray(COMMON_PERMISSIONS));
});

test('the default export holds the same members as the named exports', () => {
  for (const name of [
    'query',
    'queryAll',
    'observe',
    'request',
    'instructions',
    'showHelp',
    'closeHelp',
    'detectBrowser',
    'detectBrowserFrom',
    'isSupported',
    'permissionLabel',
  ]) {
    assert.equal(typeof PermissionsCenter[name], 'function', name);
  }
  assert.equal(PermissionsCenter.query, query);
  assert.equal(PermissionsCenter.COMMON_PERMISSIONS, COMMON_PERMISSIONS);
});

/* ------------------------------------------------------------------ *
 * 3. Pure logic — browser detection
 * ------------------------------------------------------------------ */

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  firefoxLinux:
    'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  operaMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
};

const shape = ({ browser, os, mobile }) => ({ browser, os, mobile });

test('detectBrowserFrom: Chrome on Windows', () => {
  const info = detectBrowserFrom({ ua: UA.chromeWindows });
  assert.deepEqual(shape(info), { browser: 'chrome', os: 'windows', mobile: false });
  assert.equal(info.version, 126);
});

test('detectBrowserFrom: Chrome on Android', () => {
  const info = detectBrowserFrom({ ua: UA.chromeAndroid });
  assert.deepEqual(shape(info), { browser: 'chrome', os: 'android', mobile: true });
});

test('detectBrowserFrom: Safari on macOS', () => {
  const info = detectBrowserFrom({
    ua: UA.safariMac,
    vendor: 'Apple Computer, Inc.',
    maxTouchPoints: 0,
  });
  assert.deepEqual(shape(info), { browser: 'safari', os: 'macos', mobile: false });
  assert.equal(info.version, 17);
});

test('detectBrowserFrom: Safari on iPhone', () => {
  const info = detectBrowserFrom({ ua: UA.safariIphone, vendor: 'Apple Computer, Inc.' });
  assert.deepEqual(shape(info), { browser: 'safari', os: 'ios', mobile: true });
});

test('detectBrowserFrom: iPadOS pretending to be a Mac is reported as iOS', () => {
  const info = detectBrowserFrom({
    ua: UA.safariMac,
    vendor: 'Apple Computer, Inc.',
    maxTouchPoints: 5,
  });
  assert.deepEqual(shape(info), { browser: 'safari', os: 'ios', mobile: true });
});

test('detectBrowserFrom: Firefox on Linux', () => {
  const info = detectBrowserFrom({ ua: UA.firefoxLinux });
  assert.deepEqual(shape(info), { browser: 'firefox', os: 'linux', mobile: false });
  assert.equal(info.version, 127);
});

test('detectBrowserFrom: Edge is detected before Chrome', () => {
  const info = detectBrowserFrom({ ua: UA.edgeWindows });
  assert.deepEqual(shape(info), { browser: 'edge', os: 'windows', mobile: false });
  assert.equal(info.version, 126);
});

test('detectBrowserFrom: Samsung Internet is detected before Chrome', () => {
  const info = detectBrowserFrom({ ua: UA.samsungAndroid });
  assert.deepEqual(shape(info), { browser: 'samsung', os: 'android', mobile: true });
  assert.equal(info.version, 25);
});

test('detectBrowserFrom: Opera is detected before Chrome', () => {
  const info = detectBrowserFrom({ ua: UA.operaMac });
  assert.deepEqual(shape(info), { browser: 'opera', os: 'macos', mobile: false });
  assert.equal(info.version, 111);
});

test('detectBrowserFrom: Brave is detected before Chrome', () => {
  const info = detectBrowserFrom({ ua: UA.chromeWindows, brave: true });
  assert.equal(info.browser, 'brave');
});

test('detectBrowserFrom: userAgentData wins over the UA string', () => {
  const info = detectBrowserFrom({
    ua: UA.chromeWindows,
    uaData: {
      brands: [
        { brand: 'Not/A)Brand', version: '8' },
        { brand: 'Chromium', version: '126' },
        { brand: 'Microsoft Edge', version: '126' },
      ],
      platform: 'Windows',
      mobile: false,
    },
  });
  assert.deepEqual(shape(info), { browser: 'edge', os: 'windows', mobile: false });
});

test('detectBrowserFrom: an empty environment is unknown, not a crash', () => {
  assert.deepEqual(detectBrowserFrom(), {
    browser: 'unknown',
    os: 'unknown',
    mobile: false,
    version: null,
  });
});

/* ------------------------------------------------------------------ *
 * 4. Pure logic — the instruction matrix
 * ------------------------------------------------------------------ */

test('instructions: Chrome on Windows camera', () => {
  const guide = instructions('camera', { browser: 'chrome', os: 'windows' });
  assert.equal(guide.name, 'camera');
  assert.equal(guide.browser, 'chrome');
  assert.equal(guide.os, 'windows');
  assert.equal(guide.title, 'Allow camera in Chrome');
  assert.ok(guide.steps.length >= 3);
  assert.equal(guide.settingsPath, 'chrome://settings/content/camera');
  assert.match(guide.note, /copy/i);
});

test('instructions: geolocation is called "location", the word Chrome actually uses', () => {
  const guide = instructions('geolocation', { browser: 'chrome', os: 'macos' });
  assert.equal(guide.title, 'Allow location in Chrome');
  assert.equal(guide.settingsPath, 'chrome://settings/content/location');
  assert.ok(guide.steps.some((s) => s.includes('location')));
  assert.ok(!guide.steps.some((s) => s.includes('{permission}')));
  assert.equal(permissionLabel('geolocation'), 'location');
});

test('instructions: Chrome on Android uses the mobile steps', () => {
  const guide = instructions('microphone', { browser: 'chrome', os: 'android' });
  assert.ok(guide.steps[0].startsWith('Tap'));
  assert.equal(guide.settingsPath, 'chrome://settings/content');
});

test('instructions: Edge gets its own settings scheme', () => {
  const guide = instructions('camera', { browser: 'edge', os: 'windows' });
  assert.equal(guide.settingsPath, 'edge://settings/content/camera');
  assert.equal(guide.title, 'Allow camera in Edge');
});

test('instructions: Firefox points at about:preferences, not a chrome:// URL', () => {
  const guide = instructions('camera', { browser: 'firefox', os: 'linux' });
  assert.equal(guide.settingsPath, 'about:preferences#privacy');
  assert.match(guide.note, /about:/);
});

test('instructions: Safari on macOS goes through the menu bar and has no settings URL', () => {
  const guide = instructions('camera', { browser: 'safari', os: 'macos' });
  assert.equal(guide.settingsPath, null);
  assert.match(guide.steps[0], /Settings for This Website/);
});

test('instructions: Safari on iOS sends camera to the address-bar menu', () => {
  const guide = instructions('camera', { browser: 'safari', os: 'ios' });
  assert.match(guide.steps.join(' '), /Website Settings/);
  assert.equal(guide.settingsPath, null);
});

test('instructions: Safari on iOS sends location to the iOS Settings app instead', () => {
  const guide = instructions('geolocation', { browser: 'safari', os: 'ios' });
  assert.match(guide.steps.join(' '), /Settings app/);
  assert.match(guide.steps.join(' '), /Location Services/);
  assert.notDeepEqual(
    guide.steps,
    instructions('camera', { browser: 'safari', os: 'ios' }).steps,
  );
});

test('instructions: Brave warns about Shields', () => {
  const guide = instructions('camera', { browser: 'brave', os: 'macos' });
  assert.equal(guide.settingsPath, 'brave://settings/content/camera');
  assert.match(guide.note, /Shields/);
});

test('instructions: an unknown browser still returns usable steps', () => {
  const guide = instructions('camera', { browser: 'unknown', os: 'unknown' });
  assert.equal(guide.browser, 'unknown');
  assert.ok(guide.steps.length > 0);
  assert.equal(guide.settingsPath, null);
  assert.match(guide.title, /camera/);
});

test('instructions: an unknown permission name is still worded readably', () => {
  const guide = instructions('window-management', { browser: 'chrome', os: 'macos' });
  assert.match(guide.title, /window placement/);
  assert.equal(permissionLabel('some-future-thing'), 'some future thing');
});

test('instructions: a permission with no dedicated Chromium page falls back to the index', () => {
  const guide = instructions('persistent-storage', { browser: 'chrome', os: 'windows' });
  assert.equal(guide.settingsPath, 'chrome://settings/content');
});

/* ------------------------------------------------------------------ *
 * 5. Unsupported-permission handling against a fake Permissions API
 * ------------------------------------------------------------------ */

function withFakeBrowser(permissions, run) {
  const priorWindow = globalThis.window;
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.window = { name: 'fake' };
  Object.defineProperty(globalThis, 'navigator', {
    value: { permissions },
    configurable: true,
    writable: true,
  });
  const restore = () => {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator);
    else delete globalThis.navigator;
  };
  return Promise.resolve()
    .then(run)
    .finally(restore);
}

/** Mimics Firefox: knows `geolocation`, throws TypeError for `camera`. */
const pickyPermissions = {
  query({ name }) {
    if (name !== 'geolocation') {
      throw new TypeError(`'${name}' (value of 'name' member of PermissionDescriptor) is not a valid value`);
    }
    return Promise.resolve({
      state: 'granted',
      addEventListener() {},
      removeEventListener() {},
    });
  },
};

test('query() maps a thrown TypeError to unsupported instead of rejecting', async () => {
  await withFakeBrowser(pickyPermissions, async () => {
    assert.equal(isSupported(), true);
    assert.deepEqual(await query('camera'), {
      name: 'camera',
      state: 'unsupported',
      supported: false,
    });
    assert.deepEqual(await query('geolocation'), {
      name: 'geolocation',
      state: 'granted',
      supported: true,
    });
  });
});

test('queryAll() never rejects because one name is unknown', async () => {
  await withFakeBrowser(pickyPermissions, async () => {
    const all = await queryAll(['camera', 'geolocation', 'made-up']);
    assert.equal(all.camera.state, 'unsupported');
    assert.equal(all.geolocation.state, 'granted');
    assert.equal(all['made-up'].state, 'unsupported');
  });
});

test('query() maps a rejected promise to unsupported too', async () => {
  const rejecting = {
    query: () => Promise.reject(new TypeError('nope')),
  };
  await withFakeBrowser(rejecting, async () => {
    assert.deepEqual(await query('camera'), {
      name: 'camera',
      state: 'unsupported',
      supported: false,
    });
  });
});

test('observe() reports the current state, then every change event', async () => {
  const listeners = new Set();
  const status = {
    state: 'prompt',
    addEventListener(type, fn) {
      if (type === 'change') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'change') listeners.delete(fn);
    },
  };
  const permissions = { query: () => Promise.resolve(status) };

  await withFakeBrowser(permissions, async () => {
    const seen = [];
    const stop = observe('camera', (info) => seen.push(info.state));
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(seen, ['prompt']);

    status.state = 'granted';
    for (const fn of listeners) fn();
    assert.deepEqual(seen, ['prompt', 'granted']);

    stop();
    assert.equal(listeners.size, 0, 'unsubscribing must remove the change listener');

    status.state = 'denied';
    for (const fn of listeners) fn();
    assert.deepEqual(seen, ['prompt', 'granted']);
  });
});

test('observe() falls back to onchange when addEventListener is missing', async () => {
  const status = { state: 'prompt', onchange: null };
  const permissions = { query: () => Promise.resolve(status) };

  await withFakeBrowser(permissions, async () => {
    const seen = [];
    const stop = observe('camera', (info) => seen.push(info.state));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(typeof status.onchange, 'function');

    status.state = 'denied';
    status.onchange();
    assert.deepEqual(seen, ['prompt', 'denied']);

    stop();
    assert.equal(status.onchange, null, 'unsubscribing must restore onchange');
  });
});

test('observe() reports unsupported when the query throws synchronously', async () => {
  await withFakeBrowser(pickyPermissions, async () => {
    const seen = [];
    const stop = observe('camera', (info) => seen.push(info));
    assert.deepEqual(seen, [{ name: 'camera', state: 'unsupported', supported: false }]);
    stop();
  });
});

/* ------------------------------------------------------------------ *
 * 6. request()
 * ------------------------------------------------------------------ */

test('request() returns unsupported for a permission with no requester', async () => {
  await withFakeBrowser(pickyPermissions, async () => {
    assert.equal(await request('clipboard-write'), 'unsupported');
    assert.equal(await request('accelerometer'), 'unsupported');
  });
});

test('request() stops every media track it opened', async () => {
  const stopped = [];
  const track = {
    stop() {
      stopped.push('video');
    },
  };
  const priorWindow = globalThis.window;
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.window = { name: 'fake' };
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      permissions: pickyPermissions,
      mediaDevices: {
        getUserMedia: () => Promise.resolve({ getTracks: () => [track] }),
      },
    },
    configurable: true,
    writable: true,
  });
  try {
    assert.equal(await request('camera'), 'granted');
    assert.deepEqual(stopped, ['video']);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator);
    else delete globalThis.navigator;
  }
});

test('request() maps NotAllowedError to denied and NotFoundError to error', async () => {
  const priorWindow = globalThis.window;
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.window = { name: 'fake' };
  const makeNavigator = (errName) => ({
    permissions: pickyPermissions,
    mediaDevices: {
      getUserMedia: () => {
        const error = new Error('nope');
        error.name = errName;
        return Promise.reject(error);
      },
    },
  });
  const set = (nav) =>
    Object.defineProperty(globalThis, 'navigator', {
      value: nav,
      configurable: true,
      writable: true,
    });
  try {
    set(makeNavigator('NotAllowedError'));
    assert.equal(await request('camera'), 'denied');
    set(makeNavigator('NotFoundError'));
    assert.equal(await request('camera'), 'error');
    set(makeNavigator('AbortError'));
    assert.equal(await request('camera'), 'dismissed');
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator);
    else delete globalThis.navigator;
  }
});

test('request() maps geolocation PERMISSION_DENIED to denied and TIMEOUT to error', async () => {
  const priorWindow = globalThis.window;
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.window = { name: 'fake' };
  const set = (code) =>
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        permissions: pickyPermissions,
        geolocation: {
          getCurrentPosition: (_ok, fail) => fail({ code }),
        },
      },
      configurable: true,
      writable: true,
    });
  try {
    set(1);
    assert.equal(await request('geolocation'), 'denied');
    set(2);
    assert.equal(await request('geolocation'), 'error');
    set(3);
    assert.equal(await request('geolocation'), 'error');
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator);
    else delete globalThis.navigator;
  }
});
