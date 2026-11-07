import { useEffect, useState } from 'react';
import { fetchMeeting, MeetingDetail } from '../api/meetings';
import { statusColor, statusLabel } from './status';

interface Props {
  meetingId: number;
  onClose: () => void;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export default function MeetingDetails({ meetingId, onClose }: Props) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setMeeting(null);
    setError(null);
    fetchMeeting(meetingId)
      .then((m) => active && setMeeting(m))
      .catch((err) => active && setError((err as Error).message));
    return () => {
      active = false;
    };
  }, [meetingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="panel" role="dialog" aria-label="Meeting details" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="panel-close" aria-label="Close" onClick={onClose}>
          ×
        </button>

        {error && <p className="form-error">{error}</p>}
        {!meeting && !error && <p className="muted">Loading…</p>}

        {meeting && (
          <>
            <span className="status-pill" style={{ background: statusColor(meeting.status) }}>
              {statusLabel(meeting.status)}
            </span>
            <h2 className="panel-title">{meeting.title}</h2>
            <p className="panel-when">
              {dateFmt.format(new Date(meeting.start_time))}
              <br />
              {timeFmt.format(new Date(meeting.start_time))} – {timeFmt.format(new Date(meeting.end_time))}
            </p>

            {meeting.description && <p className="panel-description">{meeting.description}</p>}

            <h3 className="panel-heading">Organizer</h3>
            <PersonRow name={meeting.organizer.name} sub={`${meeting.organizer.role} · ${meeting.organizer.email}`} />

            <h3 className="panel-heading">Attendees ({meeting.attendees.length})</h3>
            <ul className="people">
              {meeting.attendees.map((a) => (
                <li key={a.user_id}>
                  <PersonRow name={a.name} sub={`${a.role} · ${a.timezone}`} tag={a.required ? undefined : 'Optional'} />
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

function PersonRow({ name, sub, tag }: { name: string; sub: string; tag?: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  return (
    <div className="person">
      <span className="avatar">{initials}</span>
      <span className="person-text">
        <span className="person-name">
          {name} {tag && <span className="tag">{tag}</span>}
        </span>
        <span className="person-sub">{sub}</span>
      </span>
    </div>
  );
}
