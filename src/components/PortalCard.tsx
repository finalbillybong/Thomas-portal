import { useState } from 'react';
import type { Portal } from '../types';

interface PortalCardProps {
  portal: Portal;
  checked: boolean;
  onTap: (portalId: string, url: string) => void;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for insecure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button className="credential-copy-btn" onClick={handleCopy}>
      <span className="credential-label">{label}</span>
      <span className="credential-value">{text}</span>
      <span className="credential-copy-icon">{copied ? '\u2705' : '\uD83D\uDCCB'}</span>
    </button>
  );
}

export function PortalCard({ portal, checked, onTap }: PortalCardProps) {
  const [showCreds, setShowCreds] = useState(false);
  const url = portal.deepLinkUrl || portal.baseUrl;
  const hasCreds = !!(portal.loginUsername || portal.loginPassword);

  return (
    <div className="portal-card-wrapper">
      <button
        className={`portal-card ${checked ? 'portal-card--checked' : ''}`}
        onClick={() => onTap(portal.id, url)}
      >
        <span className="portal-icon">{portal.icon}</span>
        <span className="portal-name">{portal.name}</span>
        {hasCreds && (
          <button
            className="portal-creds-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setShowCreds(!showCreds);
            }}
            aria-label={showCreds ? 'Hide credentials' : 'Show credentials'}
          >
            {showCreds ? '\uD83D\uDD12' : '\uD83D\uDD11'}
          </button>
        )}
        <span className="portal-status">
          {checked ? '\u2705' : '\u2B1C'}
        </span>
      </button>
      {showCreds && hasCreds && (
        <div className="portal-credentials">
          {portal.loginUsername && (
            <CopyButton text={portal.loginUsername} label="User" />
          )}
          {portal.loginPassword && (
            <CopyButton text={portal.loginPassword} label="Pass" />
          )}
        </div>
      )}
    </div>
  );
}
