import { FormEvent, useEffect, useState } from 'react';
import { createMeeting, fetchUsers, Person } from '../api/meetings';

interface Props {
  initialStart: Date;
  initialEnd: Date;
  onClose: () => void;
  onCreated: (meetingId: number) => void;
}

// <input type="datetime-local"> wants local time without a zone: "YYYY-MM-DDTHH:mm"
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

type AttendeeChoice = 'none' | 'required' | 'optional';

export default function CreateMeetingDialog({ initialStart, initialEnd, onClose, onCreated }: Props) {
  const [users, setUsers] = useState<Person[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(toLocalInput(initialStart));
  const [end, setEnd] = useState(toLocalInput(initialEnd));
  const [organizerId, setOrganizerId] = useState<number | ''>('');
  const [attendees, setAttendees] = useState<Record<number, AttendeeChoice>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((err) => setError(`Couldn't load users: ${(err as Error).message}`));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cycleAttendee = (id: number) => {
    setAttendees((prev) => {
      const next: Record<AttendeeChoice, AttendeeChoice> = { none: 'required', required: 'optional', optional: 'none' };
      return { ...prev, [id]: next[prev[id] ?? 'none'] };
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const chosen = Object.entries(attendees)
      .filter(([, choice]) => choice !== 'none')
      .map(([id, choice]) => ({ user_id: Number(id), required: choice === 'required' }));

    if (!title.trim()) return setError('Title is required.');
    if (organizerId === '') return setError('Choose an organizer.');
    if (chosen.length === 0) return setError('Add at least one attendee.');
    if (new Date(end) <= new Date(start)) return setError('End time must be after start time.');

    setSaving(true);
    try {
      const meeting = await createMeeting({
        title: title.trim(),
        description: description.trim() || undefined,
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        organizer_id: organizerId,
        attendees: chosen,
      });
      onCreated(meeting.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay overlay-center" onClick={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-label="New meeting"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="panel-title">New meeting</h2>

        <label className="field">
          <span>Title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Starts</span>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>Ends</span>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>Organizer</span>
          <select
            value={organizerId}
            onChange={(e) => setOrganizerId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Select…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.role}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Attendees <em className="muted">(click to cycle: required → optional → off)</em></span>
          <div className="chips">
            {users
              .filter((u) => u.id !== organizerId)
              .map((u) => {
                const choice = attendees[u.id] ?? 'none';
                return (
                  <button
                    type="button"
                    key={u.id}
                    className={`chip chip-${choice}`}
                    onClick={() => cycleAttendee(u.id)}
                  >
                    {u.name}
                    {choice === 'optional' && <span className="chip-note"> (optional)</span>}
                  </button>
                );
              })}
          </div>
        </div>

        <label className="field">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Create meeting'}
          </button>
        </div>
      </form>
    </div>
  );
}
