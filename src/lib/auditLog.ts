import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getTodayKey } from './dateUtils';
import type { AuditEventType } from '../types';

export async function logAuditEvent(
  uid: string,
  auditEnabled: boolean,
  type: AuditEventType,
  portalId?: string,
  portalName?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  if (!auditEnabled) return;

  const todayKey = getTodayKey();
  const eventsRef = collection(db, `users/${uid}/auditLogs/${todayKey}/events`);
  await addDoc(eventsRef, {
    timestamp: Date.now(),
    type,
    ...(portalId && { portalId }),
    ...(portalName && { portalName }),
    ...(meta && { meta }),
  });
}
