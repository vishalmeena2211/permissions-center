import { instructions, permissionLabel } from './instructions.js';
import type { HelpOptions, PermissionName } from './types.js';

interface ActiveSheet {
  close: () => void;
}

let active: ActiveSheet | null = null;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function css(accent: string, radius: string, zIndex: number): string {
  return `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: ${zIndex};
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.wrap {
  --pc-accent: ${accent};
  --pc-radius: ${radius};
  --pc-bg: #ffffff;
  --pc-fg: #111827;
  --pc-muted: #6b7280;
  --pc-border: #e5e7eb;
  --pc-code-bg: #f3f4f6;
  --pc-scrim: rgba(15, 23, 42, 0.45);
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  color-scheme: light;
}
:host([data-theme="dark"]) .wrap { color-scheme: dark; }
:host([data-theme="dark"]) .wrap,
.wrap[data-dark="1"] {
  --pc-bg: #14161a;
  --pc-fg: #f3f4f6;
  --pc-muted: #9ca3af;
  --pc-border: #2a2f37;
  --pc-code-bg: #1f242b;
  --pc-scrim: rgba(0, 0, 0, 0.6);
}
@media (prefers-color-scheme: dark) {
  :host([data-theme="auto"]) .wrap {
    color-scheme: dark;
    --pc-bg: #14161a;
    --pc-fg: #f3f4f6;
    --pc-muted: #9ca3af;
    --pc-border: #2a2f37;
    --pc-code-bg: #1f242b;
    --pc-scrim: rgba(0, 0, 0, 0.6);
  }
}
@media (min-width: 560px) { .wrap { align-items: center; } }
.scrim {
  position: absolute;
  inset: 0;
  background: var(--pc-scrim);
  animation: pc-fade 160ms ease-out;
}
.sheet {
  position: relative;
  box-sizing: border-box;
  width: min(30rem, 100%);
  max-height: 86vh;
  overflow-y: auto;
  background: var(--pc-bg);
  color: var(--pc-fg);
  border-radius: var(--pc-radius) var(--pc-radius) 0 0;
  padding: 20px 20px 18px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  animation: pc-rise 200ms cubic-bezier(0.22, 1, 0.36, 1);
  font-size: 15px;
  line-height: 1.5;
}
@media (min-width: 560px) {
  .sheet { border-radius: var(--pc-radius); }
}
.sheet:focus { outline: none; }
.head { display: flex; align-items: flex-start; gap: 12px; }
h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
  flex: 1;
}
.sub { margin: 6px 0 0; color: var(--pc-muted); font-size: 13.5px; }
.close {
  flex: none;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--pc-muted);
  font: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.close:hover { background: var(--pc-code-bg); color: var(--pc-fg); }
ol {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  counter-reset: pc;
}
li {
  counter-increment: pc;
  position: relative;
  padding: 0 0 0 32px;
  margin: 0 0 12px;
}
li::before {
  content: counter(pc);
  position: absolute;
  left: 0;
  top: 1px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--pc-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 650;
  display: flex;
  align-items: center;
  justify-content: center;
}
.path {
  margin-top: 4px;
  border: 1px solid var(--pc-border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--pc-code-bg);
}
code {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
  user-select: all;
}
.copy {
  margin-top: 8px;
  border: 1px solid var(--pc-border);
  background: var(--pc-bg);
  color: var(--pc-fg);
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.copy:hover { border-color: var(--pc-accent); }
.note {
  margin: 14px 0 0;
  color: var(--pc-muted);
  font-size: 13px;
}
.actions { margin-top: 18px; display: flex; justify-content: flex-end; }
.done {
  border: 0;
  border-radius: 10px;
  background: var(--pc-accent);
  color: #fff;
  padding: 9px 18px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
:is(.close, .copy, .done):focus-visible {
  outline: 2px solid var(--pc-accent);
  outline-offset: 2px;
}
@keyframes pc-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pc-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .scrim, .sheet { animation: none; }
}
`;
}

/**
 * Show a themeable, accessible sheet explaining how to un-block a permission in
 * *this* browser. Rendered into a shadow root so no CSS crosses in either direction.
 *
 * Only one sheet exists at a time — calling this again closes the previous one.
 * The returned promise resolves when the sheet closes.
 *
 * On the server (no `document`) it resolves immediately and renders nothing.
 *
 * @param name Permission to explain.
 * @param options Theming, copy overrides and dismissal behaviour.
 * @returns A promise that resolves once the sheet has closed and cleaned up.
 */
export function showHelp(name: PermissionName, options: HelpOptions = {}): Promise<void> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve();
  }
  closeHelp();

  const guide = instructions(name, { browser: options.browser, os: options.os });
  const accent = options.accent ?? '#2563eb';
  const radius = options.radius ?? '14px';
  const theme = options.theme ?? 'auto';
  const dismissible = options.dismissible !== false;
  const zIndex = options.zIndex ?? 2147483000;
  const steps = options.steps ?? guide.steps;
  const title = options.title ?? guide.title;

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const host = document.createElement('div');
  host.setAttribute('data-permissions-center', String(name));
  host.setAttribute('data-theme', theme);
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = css(accent, radius, zIndex);
  root.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  if (theme === 'dark') wrap.setAttribute('data-dark', '1');

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  wrap.appendChild(scrim);

  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'pc-title');
  sheet.setAttribute('aria-describedby', 'pc-sub');
  sheet.tabIndex = -1;

  const head = document.createElement('div');
  head.className = 'head';
  const heading = document.createElement('h2');
  heading.id = 'pc-title';
  heading.textContent = title;
  head.appendChild(heading);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  head.appendChild(closeBtn);
  sheet.appendChild(head);

  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.id = 'pc-sub';
  sub.textContent = `This browser is blocking ${permissionLabel(name)} for this site. It will not ask again until you change the setting yourself.`;
  sheet.appendChild(sub);

  const list = document.createElement('ol');
  for (const step of steps) {
    const li = document.createElement('li');
    li.textContent = step;
    list.appendChild(li);
  }
  sheet.appendChild(list);

  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let copyBtn: HTMLButtonElement | null = null;
  if (guide.settingsPath) {
    const path = guide.settingsPath;
    const box = document.createElement('div');
    box.className = 'path';
    const code = document.createElement('code');
    code.textContent = path;
    box.appendChild(code);

    copyBtn = document.createElement('button');
    copyBtn.className = 'copy';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy settings link';
    const label = copyBtn;
    copyBtn.addEventListener('click', () => {
      const reset = () => {
        label.textContent = 'Copy settings link';
        copyTimer = null;
      };
      const clipboard = navigator.clipboard;
      const done = (text: string) => {
        label.textContent = text;
        if (copyTimer !== null) clearTimeout(copyTimer);
        copyTimer = setTimeout(reset, 2500);
      };
      if (clipboard && typeof clipboard.writeText === 'function') {
        clipboard.writeText(path).then(
          () => done('Copied'),
          () => done('Copy blocked — select the text above'),
        );
      } else {
        done('Copy unavailable — select the text above');
      }
    });
    box.appendChild(copyBtn);
    sheet.appendChild(box);
  }

  if (guide.note) {
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = guide.note;
    sheet.appendChild(note);
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  const doneBtn = document.createElement('button');
  doneBtn.className = 'done';
  doneBtn.type = 'button';
  doneBtn.textContent = 'Done';
  actions.appendChild(doneBtn);
  sheet.appendChild(actions);

  wrap.appendChild(sheet);
  root.appendChild(wrap);

  // Keep assistive tech inside the dialog without permanently rewriting the page.
  const hidden: Array<[Element, string | null]> = [];
  const parent = document.body ?? document.documentElement;
  for (const child of Array.from(parent.children)) {
    if (child === host) continue;
    hidden.push([child, child.getAttribute('aria-hidden')]);
    child.setAttribute('aria-hidden', 'true');
  }

  const docEl = document.documentElement;
  const previousOverflow = docEl.style.overflow;
  docEl.style.overflow = 'hidden';

  let closed = false;
  let settle: (() => void) | null = null;

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (copyTimer !== null) clearTimeout(copyTimer);
    copyTimer = null;
    host.removeEventListener('keydown', onKeyDown, true);
    scrim.removeEventListener('click', onScrim);
    closeBtn.removeEventListener('click', close);
    doneBtn.removeEventListener('click', close);
    for (const [el, prior] of hidden) {
      if (prior === null) el.removeAttribute('aria-hidden');
      else el.setAttribute('aria-hidden', prior);
    }
    hidden.length = 0;
    docEl.style.overflow = previousOverflow;
    if (host.parentNode) host.parentNode.removeChild(host);
    if (active && active.close === close) active = null;
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    if (settle) settle();
  };

  function focusables(): HTMLElement[] {
    return Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && dismissible) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) {
      event.preventDefault();
      sheet.focus();
      return;
    }
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    const current = root.activeElement;
    if (event.shiftKey && (current === first || current === sheet)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onScrim(): void {
    if (dismissible) close();
  }

  host.addEventListener('keydown', onKeyDown, true);
  scrim.addEventListener('click', onScrim);
  closeBtn.addEventListener('click', close);
  doneBtn.addEventListener('click', close);
  if (!dismissible) closeBtn.remove();

  parent.appendChild(host);
  sheet.focus();

  active = { close };
  return new Promise<void>((resolve) => {
    if (closed) {
      resolve();
      return;
    }
    settle = resolve;
  });
}

/**
 * Close the sheet opened by {@link showHelp}, removing the host element, every listener,
 * the scroll lock and the temporary `aria-hidden` attributes. Safe to call when nothing
 * is open, and safe to call on the server.
 */
export function closeHelp(): void {
  if (active) active.close();
}
