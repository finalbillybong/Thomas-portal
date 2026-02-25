import type { Portal } from '../types';

interface PortalCardProps {
  portal: Portal;
  checked: boolean;
  onTap: (portalId: string, url: string) => void;
}

export function PortalCard({ portal, checked, onTap }: PortalCardProps) {
  const url = portal.deepLinkUrl || portal.baseUrl;

  return (
    <button
      className={`portal-card ${checked ? 'portal-card--checked' : ''}`}
      onClick={() => onTap(portal.id, url)}
    >
      <span className="portal-icon">{portal.icon}</span>
      <span className="portal-name">{portal.name}</span>
      <span className="portal-status">
        {checked ? '\u2705' : '\u2B1C'}
      </span>
    </button>
  );
}
