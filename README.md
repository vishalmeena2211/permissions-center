# permissions-center

_Query, request and observe browser permissions — and tell the user how to un-block one they already denied._

[![npm version](https://img.shields.io/npm/v/permissions-center.svg)](https://www.npmjs.com/package/permissions-center)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/permissions-center)](https://bundlephobia.com/package/permissions-center)
[![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/vishalmeena2211/permissions-center/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![GitHub](https://img.shields.io/badge/GitHub-vishalmeena2211%2Fpermissions--center-181717?logo=github)](https://github.com/vishalmeena2211/permissions-center)

```js
// Before — throws TypeError in Firefox, tells the user nothing when they're blocked
const { state } = await navigator.permissions.query({ name: 'camera' });
if (state === 'denied') alert('Camera blocked.'); // ...and now what?

// After
const outcome = await PermissionsCenter.request('camera');           // actually prompts
if (outcome === 'denied') await PermissionsCenter.showHelp('camera'); // shows the real fix
```

## Why this exists

Reading a permission is easy. Everything around it is not, and this package is the pile of
workarounds you would otherwise write yourself:

- **`navigator.permissions.query({ name })` throws a `TypeError` for names the browser does not
  know.** Firefox has no `camera` or `microphone`; Safari has almost nothing. One unknown name in
  a `Promise.all` takes the whole batch down. Every query here is individually guarded and an
  unknown name resolves to `{ state: 'unsupported', supported: false }`. `queryAll()` never rejects.
- **Querying is not requesting.** The Permissions API cannot show a prompt — only the feature's own
  API can. `request()` maps each permission to the right call (`getUserMedia`,
  `getCurrentPosition`, `Notification.requestPermission`, `storage.persist`, `wakeLock.request`,
  `requestMIDIAccess`, `clipboard.read`) and normalises five different result shapes into one union.
- **Asking for the camera leaves it on.** `getUserMedia` hands you live tracks and the capture
  indicator stays lit until you stop them. Every track is stopped the moment it arrives.
- **Each API reports refusal differently.** `NotAllowedError`, a `GeolocationPositionError` with
  `code === 1`, and the string `'default'` all mean different things; `dismissed` (ask again later)
  and `denied` (never prompted again) are not the same outcome and are kept apart.
- **Old Safari's `Notification.requestPermission()` is callback-only** and returns `undefined`
  instead of a promise. Both signatures are handled without double-prompting.
- **`denied` is a dead end without instructions.** The browser will not prompt again, so the only
  way forward is a settings menu whose path differs per browser, per OS and sometimes per
  permission. `instructions()` returns accurate steps for the current one; `showHelp()` renders them.
- **Browsers block pages from navigating to `chrome://` URLs.** A "click here to open settings"
  link silently does nothing. Settings paths are shown as copyable text with a note explaining why.
- **UA sniffing has a required order.** Edge, Brave, Samsung Internet and Opera all ship Chrome's
  UA string, and Chrome ships Safari's. iPadOS reports itself as a Mac and is only distinguishable
  via `navigator.maxTouchPoints > 1`. Detection handles all of it and is a pure, testable function.
- **Permission changes happen outside your page.** `observe()` subscribes to the
  `PermissionStatus` `change` event, so a permission the user fixes in another tab updates your UI
  without a reload.
- **The help sheet renders in a shadow root**, so your CSS cannot leak in and its CSS cannot leak
  out — including on pages with a global `* { box-sizing }` reset or an aggressive design system.

## Install

```sh
npm install permissions-center
```

```html
<script src="https://unpkg.com/permissions-center"></script>
<script>
  PermissionsCenter.request('camera');
</script>
```

## Quick start

```js
import PermissionsCenter, { query, observe, request, showHelp } from 'permissions-center';

// 1. Read the current state — never throws, whatever the browser knows.
const camera = await query('camera');
// { name: 'camera', state: 'prompt' | 'granted' | 'denied' | 'unsupported', supported: boolean }

// 2. Keep a UI in sync. Fires immediately, then on every change.
const stop = observe('camera', (info) => {
  document.querySelector('#cam').textContent = info.state;
});

// 3. Ask for it — from a click handler, not on page load.
document.querySelector('#enable').addEventListener('click', async () => {
  const outcome = await request('camera');

  if (outcome === 'granted') startCall();
  if (outcome === 'dismissed') toast('No problem — tap "Enable camera" when you are ready.');
  if (outcome === 'denied') await showHelp('camera'); // the recovery sheet
});

// 4. Clean up when the view goes away.
stop();
```

## React

```jsx
import { usePermission, usePermissions } from 'permissions-center/react';

function CameraButton() {
  const { state, supported, loading, request, showHelp } = usePermission('camera');

  if (loading) return null;

  if (state === 'denied') {
    return <button onClick={() => showHelp()}>Camera blocked — how to fix</button>;
  }

  return (
    <button disabled={state === 'granted'} onClick={() => request()}>
      {supported ? 'Enable camera' : 'Enable camera (state unknown here)'}
    </button>
  );
}

const WATCHED = ['camera', 'microphone']; // module-level: keep the array stable

function Readiness() {
  const perms = usePermissions(WATCHED);
  return <p>{WATCHED.map((n) => `${n}: ${perms[n]?.state ?? '…'}`).join(' · ')}</p>;
}
```

`usePermission` subscribes with `observe()` on mount and unsubscribes on unmount. `request`,
`showHelp` and `refresh` are stable across renders, so they are safe in dependency arrays. Both
hooks are SSR-safe and touch no browser API during render.

## API

### Methods

| Method | Returns | Description |
| --- | --- | --- |
| `query(name)` | `Promise<PermissionInfo>` | Current state. Never rejects; unknown names give `'unsupported'`. |
| `queryAll(names?)` | `Promise<Record<string, PermissionInfo>>` | Batch read. Defaults to `COMMON_PERMISSIONS`. One bad name cannot fail the batch. |
| `observe(name, listener)` | `() => void` | Calls `listener` with the current value, then on every change. Returns an unsubscribe function. |
| `request(name, options?)` | `Promise<PermissionOutcome>` | Triggers the browser's own prompt. **Call from a user gesture.** |
| `instructions(name, options?)` | `Instructions` | Browser-specific steps for un-blocking. Pure — pass `{ browser, os }` to override detection. |
| `showHelp(name, options?)` | `Promise<void>` | Renders those steps in a shadow-DOM sheet. Resolves when it closes. |
| `closeHelp()` | `void` | Closes the sheet and removes every listener, timer and attribute it added. |
| `detectBrowser()` | `BrowserInfo` | `{ browser, os, mobile, version }` from `navigator`. |
| `detectBrowserFrom(env)` | `BrowserInfo` | The same logic as a pure function over `{ ua, uaData, maxTouchPoints, vendor, brave }`. |
| `permissionLabel(name)` | `string` | The word the browser's own UI uses — `geolocation` → `"location"`. |
| `isSupported()` | `boolean` | Whether `navigator.permissions.query` exists here. |
| `COMMON_PERMISSIONS` | `readonly PermissionName[]` | The default list for `queryAll()`. |

Every member is available as a named export, on the default export, and on the
`window.PermissionsCenter` global from the CDN build.

### `RequestOptions`

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `media` | `MediaStreamConstraints` | `{ video: true }` / `{ audio: true }` | Constraints for `camera` / `microphone`. Tracks are always stopped immediately. |
| `geolocation` | `PositionOptions` | `{ timeout: 10000, maximumAge: 0 }` | Passed to `getCurrentPosition`. |
| `helpOnDenied` | `boolean` | `false` | Open the help sheet automatically when the outcome is `denied`. |
| `help` | `HelpOptions` | `{}` | Forwarded to `showHelp()` when `helpOnDenied` fires. |

### `HelpOptions`

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `accent` | `string` | `'#2563eb'` | Accent colour for step markers and the primary button. |
| `radius` | `string` | `'14px'` | Corner radius of the sheet. |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | `'auto'` follows `prefers-color-scheme`. |
| `title` | `string` | generated | Replace the heading. |
| `steps` | `string[]` | generated | Replace the steps entirely. |
| `dismissible` | `boolean` | `true` | Allow Escape, the close button and the backdrop to close it. |
| `zIndex` | `number` | `2147483000` | `z-index` of the host element. |
| `browser` | `BrowserName` | detected | Render another browser's instructions (support tooling, screenshots, tests). |
| `os` | `OSName` | detected | Render another OS's instructions. |

The sheet is a `role="dialog"` with `aria-modal="true"`, labelled by its title. Focus moves into it
on open and returns to the previously focused element on close, Tab is trapped inside it, the rest
of the page is `aria-hidden` while it is open, Escape closes it, and the entrance animation is
dropped under `prefers-reduced-motion`.

### Exported types

`PermissionName`, `PermissionState`, `PermissionInfo`, `PermissionOutcome`, `BrowserName`,
`OSName`, `BrowserInfo`, `BrowserEnv`, `Instructions`, `InstructionsOptions`, `RequestOptions`,
`HelpOptions` — plus `UsePermissionResult` from `permissions-center/react`.

```ts
type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';
type PermissionOutcome = 'granted' | 'denied' | 'dismissed' | 'unsupported' | 'error';
```

## Permission support matrix

`can query` means `navigator.permissions.query()` accepts the name somewhere. `can request` means
this package knows an API that will actually prompt for it.

| Permission | Can query | Can request | Notes |
| --- | --- | --- | --- |
| `camera` | Chromium only | ✅ `getUserMedia({ video: true })` | Firefox and Safari throw on the query; the request still works. Tracks are stopped immediately. |
| `microphone` | Chromium only | ✅ `getUserMedia({ audio: true })` | Same as camera. |
| `geolocation` | Chromium, Firefox | ✅ `getCurrentPosition` | `code === 1` → `denied`; timeout / unavailable → `error`. |
| `notifications` | Chromium, Firefox | ✅ `Notification.requestPermission()` | `'default'` maps to `dismissed`. iOS needs the site installed to the Home Screen. |
| `clipboard-read` | Chromium only | ✅ `clipboard.read()` | Firefox prompts with a paste button instead and does not expose the permission. |
| `clipboard-write` | Chromium only | ❌ | Writing is auto-granted on a user gesture in Chromium; prompting for it would mean clobbering the clipboard. |
| `persistent-storage` | Chromium, Firefox | ✅ `storage.persist()` | Chromium decides silently from engagement heuristics — often resolves `false` with no prompt. |
| `screen-wake-lock` | Chromium | ✅ `wakeLock.request('screen')` | The sentinel is released immediately, so nothing is kept awake by the check. |
| `midi` | Chromium | ✅ `requestMIDIAccess()` | Only prompts when SysEx is requested; otherwise auto-granted. |
| `push` | Chromium, Firefox | ❌ | Requires a service worker and a VAPID key — out of scope. Request `notifications` instead. |
| `display-capture` | Chromium | ❌ | `getDisplayMedia` opens a picker, not a permission prompt. Call it yourself. |
| `bluetooth`, `nfc`, `midi` (SysEx), `idle-detection`, `window-management`, `local-fonts`, `storage-access`, sensors | varies | ❌ | Queryable where supported; each has a bespoke request API. `instructions()` still covers them. |

Anything not listed returns `'unsupported'` from `request()` rather than pretending.

## Browser support

| Browser | `query` / `observe` | `request` | Instructions |
| --- | --- | --- | --- |
| Chrome, Edge, Opera, Brave (desktop + Android) | Full | Full | Full, with a `chrome://`-style settings path |
| Firefox desktop + Android | Partial — no `camera` / `microphone`; those report `unsupported` | Full | Full, `about:preferences#privacy` |
| Safari macOS | `query` exists but knows very few names | Full | Full, menu-bar steps (Safari exposes no settings URL) |
| Safari / any browser on iOS | Mostly `unsupported` | Full | Full, and honest that several permissions live in the iOS Settings app, not the browser |
| Samsung Internet | Full | Full | Full, no settings URL |
| Unknown / new browsers | Whatever they support | Full | Generic fallback steps that are still correct in shape |
| Node / SSR | `isSupported()` is `false`, `query()` resolves to `unsupported` | `'unsupported'` | `instructions()` returns the `unknown` entry; `showHelp()` resolves immediately |

Nothing here throws when a feature is missing. The worst case is `'unsupported'` plus generic
instructions, which is still better than a `TypeError`.

## Recipes

### Ask once, recover forever

```js
async function enableMic(button) {
  const outcome = await request('microphone', { helpOnDenied: true });
  if (outcome === 'granted') return startRecording();
  if (outcome === 'error') return toast('No microphone found — plug one in and try again.');
  button.textContent = outcome === 'denied' ? 'Microphone blocked' : 'Enable microphone';
}
```

### A pre-flight check before a call

```js
const states = await queryAll(['camera', 'microphone']);
const blocked = Object.values(states).filter((info) => info.state === 'denied');

if (blocked.length > 0) {
  await showHelp(blocked[0].name, { accent: '#e11d48', theme: 'dark' });
}
```

### Show the instructions in your own UI

```js
const guide = instructions('camera'); // pure — no DOM, no side effects
render(`
  <h3>${guide.title}</h3>
  <ol>${guide.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
  ${guide.settingsPath ? `<code>${guide.settingsPath}</code>` : ''}
  ${guide.note ? `<small>${guide.note}</small>` : ''}
`);
```

Because `instructions()` takes `{ browser, os }`, a support agent can render exactly what the
customer is looking at:

```js
instructions('geolocation', { browser: 'safari', os: 'ios' });
```

### React to a permission the user fixed in another tab

```js
observe('geolocation', ({ state }) => {
  if (state === 'granted') {
    closeHelp();
    loadNearbyResults();
  }
});
```

## Gotchas

- **`request()` must run inside a user gesture.** Browsers ignore or auto-reject prompts that are
  not, and repeated automatic prompts get sites onto Chrome's abusive-notification list. This
  package cannot fake a gesture for you.
- **`denied` really is permanent** until the user changes a setting. There is no API that
  re-prompts, in any browser. That is the whole reason `showHelp()` exists.
- **A page cannot open `chrome://settings`.** Navigating there from JavaScript or an `<a href>` is
  blocked with no error. The settings path is presented as copyable text, and the `note` field says
  why. Treating that limitation honestly is the feature.
- **The instruction steps are hardcoded** — see the next section.
- **`persistent-storage` rarely prompts.** Chromium grants or refuses it silently based on
  engagement, bookmarks and installed-PWA status, so a `denied` there is usually not a user
  decision and the help sheet's advice is limited.
- **`observe()` cannot see everything.** Firefox does not fire `change` for every transition, and
  Safari's `PermissionStatus` support is thin. `usePermission()` re-reads after `request()` for
  that reason; call `refresh()` yourself if you change state some other way.
- **iOS is not per-site.** On iOS every browser is WebKit, and camera, microphone and location are
  granted to the *browser app* in the Settings app. The instructions say so instead of sending
  people to a menu that does not exist.
- **Brave's Shields can block a feature the permission allows**, which looks exactly like a denied
  permission. The Brave instructions mention it.
- **The help sheet is not a full modal framework.** It traps focus and hides the rest of the page
  from assistive tech while open, but it does not manage your router, history or scroll position
  beyond locking `documentElement.overflow` and restoring it exactly on close.

## Why the instructions are hardcoded and not scraped

There is no API that returns "here is how to un-block the camera in this browser". Nothing exposes
it, nothing standardises it, and no page can read another browser's settings UI. The only options
are a hand-written matrix or nothing — so this is a hand-written matrix, resolved in three layers
(browser → `browser:os` → `browser:os:permission`) in
[`src/instructions.ts`](https://github.com/vishalmeena2211/permissions-center/blob/main/src/instructions.ts).

The cost of that honesty is drift: **browsers rename these menus**. Chrome moved the lock icon to a
sliders icon, Firefox reworded "Blocked Temporarily", and iOS keeps moving Safari's settings.

**If you spot a step that no longer matches what you see, please open an issue or a PR.** A
one-line change to the matrix is a genuinely valuable contribution, and the layered structure means
you only have to touch the combination you can actually verify — no need to know the other twenty.
Please say which browser, version and OS you checked on.

## Contributing

```sh
git clone https://github.com/vishalmeena2211/permissions-center.git
cd permissions-center
npm install
npm run dev      # tsup --watch
npm test         # builds, then runs node:test against dist/
```

Open `demo/index.html` through a local server (`npx serve .`, then
`http://localhost:3000/demo/`) to exercise the real prompts — `file://` blocks most of them.

Corrections to the instruction matrix are the most welcome kind of PR. Please include the browser
version and OS you verified on.

## Links

- **Repository** — [github.com/vishalmeena2211/permissions-center](https://github.com/vishalmeena2211/permissions-center)
- **npm** — [npmjs.com/package/permissions-center](https://www.npmjs.com/package/permissions-center)
- **Issues & feature requests** — [Report an issue](https://github.com/vishalmeena2211/permissions-center/issues)
- **Changelog** — [releases](https://github.com/vishalmeena2211/permissions-center/releases)

## License

MIT © Vishal Meena
