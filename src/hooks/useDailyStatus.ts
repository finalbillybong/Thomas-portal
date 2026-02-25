import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTodayKey } from '../lib/dateUtils';

export function useDailyStatus() {
  const { user } = useAuth();
  const [checkedPortalIds, setCheckedPortalIds] = useState<string[]>([]);
  const [todayKey, setTodayKey] = useState(getTodayKey());

  // Re-compute today key periodically (handles midnight rollover)
  useEffect(() => {
    const interval = setInterval(() => {
      const newKey = getTodayKey();
      if (newKey !== todayKey) {
        setTodayKey(newKey);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [todayKey]);

  useEffect(() => {
    if (!user) return;

    const ref = doc(db, `users/${user.uid}/dailyStatus`, todayKey);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCheckedPortalIds(data.checkedPortalIds ?? []);
      } else {
        setCheckedPortalIds([]);
      }
    });

    return unsub;
  }, [user, todayKey]);

  const markChecked = useCallback(
    async (portalId: string) => {
      if (!user) return;
      const ref = doc(db, `users/${user.uid}/dailyStatus`, todayKey);
      await setDoc(
        ref,
        {
          checkedPortalIds: arrayUnion(portalId),
          lastUpdatedAt: Date.now(),
          timezone: 'Europe/Amsterdam',
        },
        { merge: true },
      );
    },
    [user, todayKey],
  );

  const resetToday = useCallback(async () => {
    if (!user) return;
    const ref = doc(db, `users/${user.uid}/dailyStatus`, todayKey);
    await setDoc(ref, {
      checkedPortalIds: [],
      lastUpdatedAt: Date.now(),
      timezone: 'Europe/Amsterdam',
    });
  }, [user, todayKey]);

  return { checkedPortalIds, todayKey, markChecked, resetToday };
}
