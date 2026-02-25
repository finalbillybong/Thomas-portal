import { useEffect, useCallback } from 'react';
import { useDailyStatus } from './useDailyStatus';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/auditLog';

const PENDING_PORTAL_KEY = 'pendingPortalId';
const PENDING_START_KEY = 'pendingStartMs';
const MIN_SECONDS = 10;

export function usePortalCheck() {
  const { user, profile } = useAuth();
  const { checkedPortalIds, todayKey, markChecked, resetToday } =
    useDailyStatus();

  const handleReturn = useCallback(async () => {
    const pendingId = localStorage.getItem(PENDING_PORTAL_KEY);
    const pendingStart = localStorage.getItem(PENDING_START_KEY);

    if (!pendingId || !pendingStart || !user) {
      return;
    }

    const secondsAway = (Date.now() - Number(pendingStart)) / 1000;

    localStorage.removeItem(PENDING_PORTAL_KEY);
    localStorage.removeItem(PENDING_START_KEY);

    if (secondsAway >= MIN_SECONDS) {
      await markChecked(pendingId);
      await logAuditEvent(
        user.uid,
        profile?.auditEnabled ?? false,
        'PORTAL_CONFIRMED',
        pendingId,
        undefined,
        { secondsAway: Math.round(secondsAway) },
      );
    }
  }, [user, profile, markChecked]);

  useEffect(() => {
    // Check on initial load (returning from portal)
    handleReturn();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleReturn();
      }
    };

    const onPageShow = () => {
      handleReturn();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [handleReturn]);

  const tapPortal = useCallback(
    async (portalId: string, url: string) => {
      if (!user) return;

      await logAuditEvent(
        user.uid,
        profile?.auditEnabled ?? false,
        'PORTAL_TAP',
        portalId,
      );

      localStorage.setItem(PENDING_PORTAL_KEY, portalId);
      localStorage.setItem(PENDING_START_KEY, String(Date.now()));

      window.location.href = url;
    },
    [user, profile],
  );

  return { checkedPortalIds, todayKey, tapPortal, resetToday };
}
