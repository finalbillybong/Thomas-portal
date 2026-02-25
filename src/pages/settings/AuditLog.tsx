import { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { getTodayKey, formatTimestamp, formatDateLabel } from '../../lib/dateUtils';
import type { AuditEvent } from '../../types';

export function AuditLog() {
  const { user, profile } = useAuth();
  const [dateKey, setDateKey] = useState(getTodayKey());
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadEvents();
  }, [user, dateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadEvents() {
    if (!user) return;
    setLoading(true);
    const ref = collection(
      db,
      `users/${user.uid}/auditLogs/${dateKey}/events`,
    );
    const q = query(ref, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as AuditEvent[];
    setEvents(items);
    setLoading(false);
  }

  if (!profile?.auditEnabled) {
    return (
      <div className="settings-section">
        <h2>Audit Log</h2>
        <p>Usage logging is disabled. Enable it in General settings.</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2>Audit Log</h2>
      <div className="audit-filter">
        <label>
          Date:
          <input
            type="date"
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
          />
        </label>
        <span className="date-label">{formatDateLabel(dateKey)}</span>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : events.length === 0 ? (
        <p>No events for this date.</p>
      ) : (
        <div className="audit-list">
          {events.map((ev) => (
            <div key={ev.id} className="audit-item">
              <span className="audit-time">
                {formatTimestamp(ev.timestamp)}
              </span>
              <span className="audit-type">{ev.type}</span>
              {ev.portalName && (
                <span className="audit-portal">{ev.portalName}</span>
              )}
              {ev.meta?.secondsAway != null && (
                <span className="audit-meta">
                  ({String(ev.meta.secondsAway)}s away)
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
