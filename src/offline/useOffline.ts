import { useEffect, useSyncExternalStore } from 'react';
import { offline, type OfflineState } from './client';
import { appInstall, type InstallState } from './install';

export function useOffline(): OfflineState {
  const s = useSyncExternalStore(offline.subscribe, offline.snapshot, offline.snapshot);
  useEffect(() => {
    void offline.refresh();
  }, []);
  return s;
}

const NO_INSTALL: InstallState = {
  available: false,
  pending: false,
  accepted: false,
  standalone: false,
};
const noop = () => () => undefined;

export function useInstall(): InstallState {
  return useSyncExternalStore(
    appInstall?.subscribe ?? noop,
    appInstall?.snapshot ?? (() => NO_INSTALL),
    () => NO_INSTALL,
  );
}
