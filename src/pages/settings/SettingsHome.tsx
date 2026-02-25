import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalCheck } from '../../hooks/usePortalCheck';
import { logAuditEvent } from '../../lib/auditLog';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const DEFAULT_SCRAPE_TIMES = ['15:30', '18:00', '21:00'];

export function SettingsHome() {
  const { user, profile, refreshProfile } = useAuth();
  const { resetToday } = usePortalCheck();
  const [scrapeTimes, setScrapeTimes] = useState<string[]>(
    profile?.scrapeTimes ?? DEFAULT_SCRAPE_TIMES,
  );
  const [newTime, setNewTime] = useState('');

  async function handleResetToday() {
    if (!confirm('Reset all checked portals for today?')) return;
    await resetToday();
    if (user && profile) {
      await logAuditEvent(user.uid, profile.auditEnabled, 'RESET_TODAY');
    }
  }

  async function toggleAudit() {
    if (!user || !profile) return;
    const ref = doc(db, 'users', user.uid);
    await setDoc(
      ref,
      { auditEnabled: !profile.auditEnabled },
      { merge: true },
    );
    await refreshProfile();
  }

  async function saveTimes(times: string[]) {
    const sorted = [...times].sort();
    setScrapeTimes(sorted);
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    await setDoc(ref, { scrapeTimes: sorted }, { merge: true });
    await refreshProfile();
  }

  function handleAddTime() {
    if (!newTime || scrapeTimes.includes(newTime)) return;
    saveTimes([...scrapeTimes, newTime]);
    setNewTime('');
  }

  function handleRemoveTime(time: string) {
    if (scrapeTimes.length <= 1) return;
    saveTimes(scrapeTimes.filter((t) => t !== time));
  }

  return (
    <div className="settings-section">
      <h2>General Settings</h2>

      <div className="setting-row">
        <div>
          <strong>Reset today's checks</strong>
          <p>Clear all checked portals for today</p>
        </div>
        <button className="btn btn-danger" onClick={handleResetToday}>
          Reset
        </button>
      </div>

      <div className="setting-row">
        <div>
          <strong>Enable usage logging</strong>
          <p>Record portal checks and settings changes</p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={profile?.auditEnabled ?? false}
            onChange={toggleAudit}
          />
          <span className="toggle-slider" />
        </label>
      </div>

      <div className="setting-row setting-row--column">
        <div>
          <strong>Homework scrape times</strong>
          <p>When to check MCAS for new homework each day</p>
        </div>
        <div className="scrape-times">
          {scrapeTimes.map((time) => (
            <span key={time} className="scrape-time-chip">
              {time}
              {scrapeTimes.length > 1 && (
                <button
                  className="scrape-time-remove"
                  onClick={() => handleRemoveTime(time)}
                  aria-label={`Remove ${time}`}
                >
                  x
                </button>
              )}
            </span>
          ))}
          <span className="scrape-time-add">
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="time-input time-input--sm"
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={handleAddTime}
              disabled={!newTime || scrapeTimes.includes(newTime)}
            >
              Add
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
