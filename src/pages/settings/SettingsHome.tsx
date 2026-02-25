import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalCheck } from '../../hooks/usePortalCheck';
import { logAuditEvent } from '../../lib/auditLog';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export function SettingsHome() {
  const { user, profile, refreshProfile } = useAuth();
  const { resetToday } = usePortalCheck();
  const [scrapeTime, setScrapeTime] = useState(profile?.scrapeTime || '16:00');

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

  async function handleScrapeTimeChange(newTime: string) {
    setScrapeTime(newTime);
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    await setDoc(ref, { scrapeTime: newTime }, { merge: true });
    await refreshProfile();
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

      <div className="setting-row">
        <div>
          <strong>Homework scrape time</strong>
          <p>When to check MCAS for new homework daily</p>
        </div>
        <input
          type="time"
          value={scrapeTime}
          onChange={(e) => handleScrapeTimeChange(e.target.value)}
          className="time-input"
        />
      </div>
    </div>
  );
}
