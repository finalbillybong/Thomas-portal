import { useState } from 'react';
import { usePortals } from '../hooks/usePortals';
import { usePortalCheck } from '../hooks/usePortalCheck';
import { useHomework } from '../hooks/useHomework';
import { useAuth } from '../contexts/AuthContext';
import { PortalCard } from '../components/PortalCard';
import { getTodayKey } from '../lib/dateUtils';
import type { HomeworkItem } from '../types';

// Subject colour mapping
const SUBJECT_COLOURS: Record<string, string> = {
  music: '#3b82f6',
  science: '#22c55e',
  maths: '#f59e0b',
  english: '#ef4444',
  history: '#8b5cf6',
  geography: '#06b6d4',
  art: '#ec4899',
  pe: '#f97316',
  computing: '#6366f1',
  french: '#14b8a6',
  spanish: '#e11d48',
  german: '#84cc16',
  re: '#a855f7',
  dt: '#d97706',
  drama: '#f43f5e',
};

function getSubjectColour(subject: string): string {
  const lower = subject.toLowerCase();
  for (const [key, colour] of Object.entries(SUBJECT_COLOURS)) {
    if (lower.includes(key)) return colour;
  }
  // Generate a stable colour from subject name
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = lower.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

function getDaysInfo(dateStr: string): { text: string; className: string } {
  const today = getTodayKey();
  const todayDate = new Date(today + 'T00:00:00');
  const dueDate = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round(
    (dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d late`, className: 'hw-badge hw-badge--overdue' };
  if (diffDays === 0) return { text: 'TODAY', className: 'hw-badge hw-badge--today' };
  if (diffDays === 1) return { text: '1d', className: 'hw-badge hw-badge--soon' };
  if (diffDays <= 3) return { text: `${diffDays}d`, className: 'hw-badge hw-badge--soon' };
  return { text: `${diffDays}d`, className: 'hw-badge' };
}

function formatLastScraped(ts: number | undefined): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const scraped = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (scraped.getTime() === today.getTime()) return `Today ${time}`;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (scraped.getTime() === yesterday.getTime()) return `Yesterday ${time}`;

  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` ${time}`;
}

function HomeworkCard({
  item,
  onToggle,
}: {
  item: HomeworkItem;
  onToggle: (id: string, done: boolean) => void;
}) {
  const colour = getSubjectColour(item.subject);
  const daysInfo = getDaysInfo(item.dueDate);

  return (
    <div className={`hw-card ${item.completed ? 'hw-card--done' : ''}`}>
      <div className="hw-colour-strip" style={{ backgroundColor: colour }} />
      <button
        className="hw-check"
        onClick={() => onToggle(item.id, !item.completed)}
        aria-label={item.completed ? 'Mark as not done' : 'Mark as done'}
      >
        {item.completed ? '\u2705' : '\u2B1C'}
      </button>
      <div className="hw-info">
        <span className={`hw-title ${item.completed ? 'hw-title--done' : ''}`}>
          {item.title}
        </span>
        <span className="hw-subject">{item.subject}{item.teacher ? ` \u2014 ${item.teacher}` : ''}</span>
        {item.resources && item.resources.links && item.resources.links.length > 0 && (
          <div className="hw-resources">
            {item.resources.links.map((link, idx) => (
              <a
                key={idx}
                className="hw-resource-link"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {link.name}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="hw-right">
        <span className={daysInfo.className}>{daysInfo.text}</span>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { enabledPortals, loading: portalsLoading } = usePortals();
  const { checkedPortalIds, tapPortal } = usePortalCheck();
  const { pending, completed, loading: hwLoading, toggleComplete } = useHomework();
  const { profile } = useAuth();
  const [showCompleted, setShowCompleted] = useState(false);

  if (portalsLoading || hwLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  const checkedCount = enabledPortals.filter((p) =>
    checkedPortalIds.includes(p.id),
  ).length;
  const totalCount = enabledPortals.length;
  const allDone = checkedCount === totalCount && totalCount > 0;

  const remaining = enabledPortals.filter(
    (p) => !checkedPortalIds.includes(p.id),
  );

  return (
    <div className="dashboard">
      {/* Homework section */}
      <div className="hw-section">
        <div className="hw-section-header">
          <h2>Homework</h2>
          <span className="hw-last-scraped">
            Last checked: {formatLastScraped(profile?.lastScrapedAt)}
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="hw-empty">
            <p>No homework due!</p>
          </div>
        ) : (
          <div className="hw-list">
            {pending.map((item) => (
              <HomeworkCard
                key={item.id}
                item={item}
                onToggle={toggleComplete}
              />
            ))}
          </div>
        )}

        {completed.length > 0 && (
          <div className="hw-completed-section">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowCompleted(!showCompleted)}
            >
              {showCompleted ? 'Hide' : 'Show'} completed ({completed.length})
            </button>
            {showCompleted && (
              <div className="hw-list">
                {completed.map((item) => (
                  <HomeworkCard
                    key={item.id}
                    item={item}
                    onToggle={toggleComplete}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Portal check section */}
      <div className={`status-banner ${allDone ? 'status-banner--done' : ''}`}>
        <h2>
          Checked {checkedCount} / {totalCount} portals today
        </h2>
        {allDone ? (
          <p className="status-message">All done for today!</p>
        ) : (
          <p className="status-message">
            Still to check:{' '}
            {remaining.map((p) => p.name).join(', ')}
          </p>
        )}
      </div>

      <div className="portal-grid">
        {enabledPortals.map((portal) => (
          <PortalCard
            key={portal.id}
            portal={portal}
            checked={checkedPortalIds.includes(portal.id)}
            onTap={tapPortal}
          />
        ))}
      </div>
    </div>
  );
}
