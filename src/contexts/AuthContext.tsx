import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { logAuditEvent } from '../lib/auditLog';
import type { UserProfile } from '../types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(u: User) {
    const ref = doc(db, 'users', u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setProfile(snap.data() as UserProfile);
    } else {
      const newProfile: UserProfile = {
        email: u.email ?? '',
        createdAt: Date.now(),
        parentPinHash: '',
        parentPinSalt: '',
        auditEnabled: false,
      };
      await setDoc(ref, newProfile);
      setProfile(newProfile);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          await fetchProfile(u);
        } catch (err) {
          console.error('Failed to fetch profile:', err);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Fetch profile and fire audit event
    const ref = doc(db, 'users', cred.user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const p = snap.data() as UserProfile;
      await logAuditEvent(cred.user.uid, p.auditEnabled, 'LOGIN');
    }
  }

  async function logout() {
    await signOut(auth);
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) {
      await fetchProfile(user);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, login, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
