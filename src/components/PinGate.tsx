import { useState, useEffect, type FormEvent } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { verifyPin, generateSalt, hashPin } from '../lib/pinUtils';
import { logAuditEvent } from '../lib/auditLog';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const PIN_UNLOCK_DURATION = 15 * 60 * 1000; // 15 minutes

export function PinGate() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isSetup, setIsSetup] = useState(false);

  const needsSetup = !profile?.parentPinHash;

  useEffect(() => {
    // Check if we have a stored unlock time
    const stored = sessionStorage.getItem('pinUnlockedAt');
    if (stored) {
      const elapsed = Date.now() - Number(stored);
      if (elapsed < PIN_UNLOCK_DURATION) {
        setUnlocked(true);
        return;
      }
      sessionStorage.removeItem('pinUnlockedAt');
    }
  }, []);

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!profile || !user) return;
    setError('');

    const valid = await verifyPin(pin, profile.parentPinSalt, profile.parentPinHash);
    if (valid) {
      setUnlocked(true);
      sessionStorage.setItem('pinUnlockedAt', String(Date.now()));
      await logAuditEvent(user.uid, profile.auditEnabled, 'SETTINGS_UNLOCK');
      setPin('');
    } else {
      setError('Incorrect PIN');
    }
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');

    if (newPin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    const salt = await generateSalt();
    const hash = await hashPin(newPin, salt);
    const ref = doc(db, 'users', user.uid);
    await setDoc(ref, { parentPinHash: hash, parentPinSalt: salt }, { merge: true });
    await refreshProfile();
    setUnlocked(true);
    sessionStorage.setItem('pinUnlockedAt', String(Date.now()));
    setNewPin('');
    setConfirmPin('');
    setIsSetup(false);
  }

  if (unlocked) {
    return <Outlet />;
  }

  if (needsSetup || isSetup) {
    return (
      <div className="pin-screen">
        <div className="pin-card">
          <h2>Create Parent PIN</h2>
          <p>Set a PIN to protect settings</p>
          <form onSubmit={handleSetup}>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="New PIN (min 4 digits)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              autoFocus
            />
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
            />
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn btn-primary">
              Set PIN
            </button>
            {!needsSetup && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setIsSetup(false);
                  setError('');
                }}
              >
                Cancel
              </button>
            )}
          </form>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pin-screen">
      <div className="pin-card">
        <h2>Enter Parent PIN</h2>
        <form onSubmit={handleVerify}>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary">
            Unlock
          </button>
        </form>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
