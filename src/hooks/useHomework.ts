import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { HomeworkItem } from '../types';

export function useHomework() {
  const { user } = useAuth();
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const colRef = collection(db, `users/${user.uid}/homework`);
    const q = query(colRef, orderBy('dueDate'));
    const unsub = onSnapshot(q, (snap) => {
      const items: HomeworkItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as HomeworkItem[];
      setHomework(items);
      setLoading(false);
    });

    return unsub;
  }, [user]);

  async function toggleComplete(id: string, completed: boolean) {
    if (!user) return;
    const ref = doc(db, `users/${user.uid}/homework`, id);
    await setDoc(
      ref,
      {
        completed,
        completedAt: completed ? Date.now() : null,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  }

  async function addHomework(
    data: Omit<HomeworkItem, 'id' | 'createdAt' | 'updatedAt'>,
  ) {
    if (!user) return;
    const colRef = collection(db, `users/${user.uid}/homework`);
    const ref = doc(colRef);
    await setDoc(ref, {
      ...data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return ref.id;
  }

  async function removeHomework(id: string) {
    if (!user) return;
    const ref = doc(db, `users/${user.uid}/homework`, id);
    await deleteDoc(ref);
  }

  const pending = homework.filter((h) => !h.completed);
  const completed = homework.filter((h) => h.completed);

  return {
    homework,
    pending,
    completed,
    loading,
    toggleComplete,
    addHomework,
    removeHomework,
  };
}
