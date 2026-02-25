import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Portal } from '../types';
import { DEFAULT_PORTALS } from '../types';

export function usePortals() {
  const { user } = useAuth();
  const [portals, setPortals] = useState<Portal[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!user) return;

    const colRef = collection(db, `users/${user.uid}/portals`);
    const q = query(colRef, orderBy('sortOrder'));
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty && !seeded) {
        setSeeded(true);
        const batch = writeBatch(db);
        for (const p of DEFAULT_PORTALS) {
          const ref = doc(colRef);
          batch.set(ref, {
            ...p,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        await batch.commit();
        return;
      }

      const items: Portal[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Portal[];
      setPortals(items);
      setLoading(false);
    }, (err) => {
      console.error('Portals snapshot error:', err);
      setLoading(false);
    });

    return unsub;
  }, [user, seeded]);

  async function addPortal(data: Omit<Portal, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!user) return;
    const colRef = collection(db, `users/${user.uid}/portals`);
    const ref = doc(colRef);
    await setDoc(ref, {
      ...data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return ref.id;
  }

  async function updatePortal(id: string, data: Partial<Portal>) {
    if (!user) return;
    const ref = doc(db, `users/${user.uid}/portals`, id);
    await setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true });
  }

  async function removePortal(id: string) {
    if (!user) return;
    const ref = doc(db, `users/${user.uid}/portals`, id);
    await deleteDoc(ref);
  }

  async function reorderPortals(orderedIds: string[]) {
    if (!user) return;
    const batch = writeBatch(db);
    orderedIds.forEach((id, i) => {
      const ref = doc(db, `users/${user.uid}/portals`, id);
      batch.update(ref, { sortOrder: i, updatedAt: Date.now() });
    });
    await batch.commit();
  }

  const enabledPortals = portals.filter((p) => p.enabled);

  return {
    portals,
    enabledPortals,
    loading,
    addPortal,
    updatePortal,
    removePortal,
    reorderPortals,
  };
}
