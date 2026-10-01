// Screen hook: the session snapshot plus the guide loaded for the selected pack.
import { useEffect } from 'react';
import { flowSession, useFlow } from '../session';

export function useGuide() {
  const session = flowSession();
  const snap = useFlow(session);
  useEffect(() => {
    void session.loadGuide();
  }, [session, snap.packId]);
  return { session, snap };
}
