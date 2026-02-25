import { Link } from 'react-router-dom';
import { usePortals } from '../hooks/usePortals';
import { usePortalCheck } from '../hooks/usePortalCheck';
import { useHomework } from '../hooks/useHomework';
import { PortalCard } from '../components/PortalCard';

export function Dashboard() {
  const { enabledPortals, loading } = usePortals();
  const { checkedPortalIds, tapPortal } = usePortalCheck();
  const { pending: pendingHomework } = useHomework();

  if (loading) {
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

      {pendingHomework.length > 0 && (
        <Link to="/homework" className="hw-banner">
          <span className="hw-banner-count">{pendingHomework.length}</span>
          <span>homework {pendingHomework.length === 1 ? 'item' : 'items'} due</span>
        </Link>
      )}

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
