import { useCallback } from 'react';
import { useDailyStatus } from './useDailyStatus';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/auditLog';

export function usePortalCheck() {
  const { user, profile } = useAuth();
  const { checkedPortalIds, todayKey, markChecked, resetToday } =
    useDailyStatus();

  const tapPortal = useCallback(
    async (portalId: string, url: string) => {
      if (!user) return;

      // Open portal in a new tab
      window.open(url, '_blank', 'noopener');

      // Immediately mark as checked
      await markChecked(portalId);

      await logAuditEvent(
        user.uid,
        profile?.auditEnabled ?? false,
        'PORTAL_TAP',
        portalId,
      );
    },
    [user, profile, markChecked],
  );

  return { checkedPortalIds, todayKey, tapPortal, resetToday };
}
