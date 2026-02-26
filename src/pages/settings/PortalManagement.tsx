import { useState, type FormEvent } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePortals } from '../../hooks/usePortals';
import { useAuth } from '../../contexts/AuthContext';
import { logAuditEvent } from '../../lib/auditLog';
import type { Portal } from '../../types';

interface PortalFormData {
  name: string;
  baseUrl: string;
  deepLinkUrl: string;
  icon: string;
  enabled: boolean;
  loginUsername: string;
  loginPassword: string;
  keywords: string;
}

const emptyForm: PortalFormData = {
  name: '',
  baseUrl: '',
  deepLinkUrl: '',
  icon: '\uD83C\uDF10',
  enabled: true,
  loginUsername: '',
  loginPassword: '',
  keywords: '',
};

function SortablePortalItem({
  portal,
  onEdit,
  onDelete,
  onToggle,
}: {
  portal: Portal;
  onEdit: (p: Portal) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: portal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="portal-manage-item">
      <span className="drag-handle" {...attributes} {...listeners}>
        &#9776;
      </span>
      <span className="portal-icon">{portal.icon}</span>
      <span className="portal-manage-name">{portal.name}</span>
      <label className="toggle toggle-sm">
        <input
          type="checkbox"
          checked={portal.enabled}
          onChange={() => onToggle(portal.id, !portal.enabled)}
        />
        <span className="toggle-slider" />
      </label>
      <button className="btn btn-sm" onClick={() => onEdit(portal)}>
        Edit
      </button>
      <button
        className="btn btn-sm btn-danger"
        onClick={() => onDelete(portal.id)}
      >
        Del
      </button>
    </div>
  );
}

export function PortalManagement() {
  const { portals, addPortal, updatePortal, removePortal, reorderPortals } =
    usePortals();
  const { user, profile } = useAuth();
  const [editing, setEditing] = useState<Portal | null>(null);
  const [form, setForm] = useState<PortalFormData>(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(portal: Portal) {
    setEditing(portal);
    setForm({
      name: portal.name,
      baseUrl: portal.baseUrl,
      deepLinkUrl: portal.deepLinkUrl,
      icon: portal.icon,
      enabled: portal.enabled,
      loginUsername: portal.loginUsername || '',
      loginPassword: portal.loginPassword || '',
      keywords: (portal.keywords || []).join(', '),
    });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;

    const keywords = form.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const { keywords: _kw, ...formRest } = form;
    const portalData = { ...formRest, keywords };

    if (editing) {
      await updatePortal(editing.id, portalData);
      await logAuditEvent(
        user.uid,
        profile.auditEnabled,
        'PORTAL_EDIT',
        editing.id,
        form.name,
      );
    } else {
      const maxSort = portals.length > 0
        ? Math.max(...portals.map((p) => p.sortOrder))
        : -1;
      const newId = await addPortal({ ...portalData, sortOrder: maxSort + 1 });
      await logAuditEvent(
        user.uid,
        profile.auditEnabled,
        'PORTAL_ADD',
        newId ?? undefined,
        form.name,
      );
    }

    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this portal?')) return;
    if (!user || !profile) return;
    const portal = portals.find((p) => p.id === id);
    await removePortal(id);
    await logAuditEvent(
      user.uid,
      profile.auditEnabled,
      'PORTAL_DELETE',
      id,
      portal?.name,
    );
  }

  async function handleToggle(id: string, enabled: boolean) {
    await updatePortal(id, { enabled });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (!user || !profile) return;

    const oldIndex = portals.findIndex((p) => p.id === active.id);
    const newIndex = portals.findIndex((p) => p.id === over.id);
    const newOrder = arrayMove(
      portals.map((p) => p.id),
      oldIndex,
      newIndex,
    );
    await reorderPortals(newOrder);
    await logAuditEvent(user.uid, profile.auditEnabled, 'PORTAL_REORDER');
  }

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>Manage Portals</h2>
        <button className="btn btn-primary" onClick={openAdd}>
          + Add Portal
        </button>
      </div>

      {showForm && (
        <div className="portal-form-overlay">
          <form className="portal-form" onSubmit={handleSubmit}>
            <h3>{editing ? 'Edit Portal' : 'Add Portal'}</h3>
            <label>
              Icon (emoji)
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                maxLength={4}
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Base URL
              <input
                type="url"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                required
              />
            </label>
            <label>
              Deep Link URL (optional)
              <input
                type="url"
                value={form.deepLinkUrl}
                onChange={(e) =>
                  setForm({ ...form, deepLinkUrl: e.target.value })
                }
              />
            </label>
            <label>
              Homework Keywords (comma-separated)
              <input
                type="text"
                value={form.keywords}
                onChange={(e) =>
                  setForm({ ...form, keywords: e.target.value })
                }
                placeholder="e.g. maths, science"
              />
              <span className="field-hint">
                Only show this portal when homework matches these keywords. Leave empty to always show.
              </span>
            </label>
            <fieldset className="credential-fieldset">
              <legend>Login Credentials (optional)</legend>
              <label>
                Username
                <input
                  type="text"
                  value={form.loginUsername}
                  onChange={(e) =>
                    setForm({ ...form, loginUsername: e.target.value })
                  }
                  autoComplete="off"
                />
              </label>
              <label>
                Password
                <input
                  type="text"
                  value={form.loginPassword}
                  onChange={(e) =>
                    setForm({ ...form, loginPassword: e.target.value })
                  }
                  autoComplete="off"
                />
              </label>
            </fieldset>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              Enabled
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editing ? 'Save' : 'Add'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={portals.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="portal-manage-list">
            {portals.map((portal) => (
              <SortablePortalItem
                key={portal.id}
                portal={portal}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
