import { useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { verifyPin, generateSalt, hashPin } from '../../lib/pinUtils';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export function Security() {
  const { user, profile, refreshProfile } = useAuth();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleChangePin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!user || !profile) return;

    if (profile.parentPinHash) {
      const valid = await verifyPin(
        currentPin,
        profile.parentPinSalt,
        profile.parentPinHash,
      );
      if (!valid) {
        setError('Current PIN is incorrect');
        return;
      }
    }

    if (newPin.length < 4) {
      setError('New PIN must be at least 4 digits');
      return;
    }

    if (newPin !== confirmPin) {
      setError('New PINs do not match');
      return;
    }

    const salt = await generateSalt();
    const hash = await hashPin(newPin, salt);
    const ref = doc(db, 'users', user.uid);
    await setDoc(ref, { parentPinHash: hash, parentPinSalt: salt }, { merge: true });
    await refreshProfile();

    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setSuccess('PIN changed successfully');
  }

  return (
    <div className="settings-section">
      <h2>Security</h2>
      <form onSubmit={handleChangePin} className="pin-change-form">
        {profile?.parentPinHash && (
          <label>
            Current PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              required
            />
          </label>
        )}
        <label>
          New PIN
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm New PIN
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
        <button type="submit" className="btn btn-primary">
          Change PIN
        </button>
      </form>
    </div>
  );
}
