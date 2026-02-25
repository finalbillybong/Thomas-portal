import { useState, type FormEvent } from 'react';
import { useHomework } from '../hooks/useHomework';
import { getTodayKey } from '../lib/dateUtils';
import type { HomeworkItem } from '../types';

function formatDueDate(dateStr: string): string {
  const today = getTodayKey();
  const due = dateStr;

  if (due === today) return 'Today';

  const todayDate = new Date(today + 'T00:00:00');
  const dueDate = new Date(due + 'T00:00:00');
  const diffDays = Math.round(
    (dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays <= 7) return `In ${diffDays} days`;

  return dueDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function dueDateClass(dateStr: string): string {
  const today = getTodayKey();
  const todayDate = new Date(today + 'T00:00:00');
  const dueDate = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round(
    (dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) return 'hw-overdue';
  if (diffDays === 0) return 'hw-due-today';
  if (diffDays <= 2) return 'hw-due-soon';
  return '';
}

function HomeworkCard({
  item,
  onToggle,
  onDelete,
}: {
  item: HomeworkItem;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`hw-card ${item.completed ? 'hw-card--done' : ''}`}>
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
        <span className="hw-subject">{item.subject}</span>
      </div>
      <div className="hw-right">
        <span className={`hw-due ${dueDateClass(item.dueDate)}`}>
          {formatDueDate(item.dueDate)}
        </span>
        <button
          className="hw-delete"
          onClick={() => onDelete(item.id)}
          aria-label="Delete"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export function Homework() {
  const { pending, completed, loading, toggleComplete, addHomework, removeHomework } =
    useHomework();
  const [showAdd, setShowAdd] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!title.trim() || !subject.trim() || !dueDate) {
      setError('All fields are required');
      return;
    }

    try {
      await addHomework({
        title: title.trim(),
        subject: subject.trim(),
        dueDate,
        completed: false,
        source: 'manual',
      });
      setTitle('');
      setSubject('');
      setDueDate('');
      setShowAdd(false);
    } catch (err) {
      console.error('Failed to add homework:', err);
      setError('Failed to add homework');
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="hw-page">
      <div className="hw-header">
        <h2>Homework</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <form className="hw-add-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary">
            Add Homework
          </button>
        </form>
      )}

      {pending.length === 0 && !showAdd && (
        <div className="hw-empty">
          <p>No homework right now!</p>
        </div>
      )}

      <div className="hw-list">
        {pending.map((item) => (
          <HomeworkCard
            key={item.id}
            item={item}
            onToggle={toggleComplete}
            onDelete={removeHomework}
          />
        ))}
      </div>

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
                  onDelete={removeHomework}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
