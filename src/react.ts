import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observe, query, request, showHelp } from './index.js';
import type {
  HelpOptions,
  PermissionInfo,
  PermissionName,
  PermissionOutcome,
  PermissionState,
  RequestOptions,
} from './types.js';

export type {
  HelpOptions,
  PermissionInfo,
  PermissionName,
  PermissionOutcome,
  PermissionState,
  RequestOptions,
} from './types.js';

/** What {@link usePermission} returns. */
export interface UsePermissionResult {
  /** Live state. Starts as `'prompt'` before the first read resolves. */
  state: PermissionState;
  /** `false` once it is known the browser does not recognise this permission. */
  supported: boolean;
  /** `true` until the first value has arrived. */
  loading: boolean;
  /**
   * Trigger the browser's own prompt. Stable across renders — safe in a dependency array.
   * Call it from a user gesture.
   */
  request: (options?: RequestOptions) => Promise<PermissionOutcome>;
  /** Open the un-block instructions sheet. Stable across renders. */
  showHelp: (options?: HelpOptions) => Promise<void>;
  /** Re-read the state manually. Stable across renders. Rarely needed — `observe` pushes changes. */
  refresh: () => Promise<void>;
}

/**
 * Subscribe a component to one permission.
 *
 * Subscribes with `observe()` on mount and unsubscribes on unmount, so a change made in
 * browser settings — even in another tab — re-renders the component. SSR-safe: on the
 * server it renders `{ state: 'prompt', supported: false, loading: true }` and does nothing.
 *
 * @param name Permission to watch, e.g. `'camera'`.
 * @returns Live state plus stable `request`, `showHelp` and `refresh` callbacks.
 */
export function usePermission(name: PermissionName): UsePermissionResult {
  const [info, setInfo] = useState<PermissionInfo | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let alive = true;
    const stop = observe(name, (next) => {
      if (alive) setInfo(next);
    });
    return () => {
      alive = false;
      stop();
    };
  }, [name]);

  const doRequest = useCallback(async (options?: RequestOptions) => {
    const outcome = await request(nameRef.current, options);
    // Firefox does not fire `change` for every transition; re-read to stay honest.
    const next = await query(nameRef.current);
    setInfo(next);
    return outcome;
  }, []);

  const doShowHelp = useCallback(
    (options?: HelpOptions) => showHelp(nameRef.current, options),
    [],
  );

  const refresh = useCallback(async () => {
    setInfo(await query(nameRef.current));
  }, []);

  return useMemo(
    () => ({
      state: info?.state ?? 'prompt',
      supported: info?.supported ?? false,
      loading: info === null,
      request: doRequest,
      showHelp: doShowHelp,
      refresh,
    }),
    [info, doRequest, doShowHelp, refresh],
  );
}

/**
 * Subscribe a component to several permissions at once.
 *
 * Each name is observed independently, so an unknown name simply reports
 * `'unsupported'` instead of breaking the rest. SSR-safe: returns `{}` on the server.
 *
 * @param names Permissions to watch. Pass a stable array (or a module-level constant) —
 *   the subscription is keyed on the joined names, not on array identity.
 * @returns A record keyed by permission name.
 */
export function usePermissions(
  names: readonly PermissionName[],
): Record<string, PermissionInfo> {
  const key = names.join(',');
  const [map, setMap] = useState<Record<string, PermissionInfo>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let alive = true;
    const list = key === '' ? [] : key.split(',');
    const stops = list.map((name) =>
      observe(name, (info) => {
        if (!alive) return;
        setMap((prev) => {
          const current = prev[name];
          if (current && current.state === info.state && current.supported === info.supported) {
            return prev;
          }
          return { ...prev, [name]: info };
        });
      }),
    );
    return () => {
      alive = false;
      for (const stop of stops) stop();
    };
  }, [key]);

  return map;
}
