import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { HomeworkItem } from '../types';

function isExpired(item: HomeworkItem): boolean {
  const now = new Date();
  const due = new Date(item.dueDate + 'T23:59:59');
  const daysSinceDue = (now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceDue > 7;
}

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
      // Hide items more than 7 days past due date
      setHomework(items.filter((item) => !isExpired(item)));
      setLoading(false);
    }, (err) => {
      console.error('Homework snapshot error:', err);
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

  const pending = homework.filter((h) => !h.completed);
  const completed = homework.filter((h) => h.completed);

  return {
    homework,
    pending,
    completed,
    loading,
    toggleComplete,
  };
}
