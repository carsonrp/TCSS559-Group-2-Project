import { useEffect, useState } from 'react';
import { fetchMeetingInsights, MeetingInsights } from '../api/meetings';
import { formatDuration, formatHours, formatLocalLabel, formatTimeRange, reasonLabel, shortZone } from './format';
import './Insights.css';

export default function MeetingInsightsSection({ meetingId }: { meetingId: number }) {
  const [insights, setInsights] = useState<MeetingInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setInsights(null);
    setError(null);
    fetchMeetingInsights(meetingId)
      .then((data) => active && setInsights(data))
      .catch((err) => active && setError((err as Error).message));
    return () => {
      active = false;
    };
  }, [meetingId]);

  return (
    <section className="meeting-insights" aria-label="Meeting insights">
      <h3 className="panel-heading">Insights</h3>
      {error && <p className="form-error">Couldn't load insights: {error}</p>}
      {!insights && !error && <p className="muted">Loading insights…</p>}

      {insights && (
        <>
          <dl className="mini-stats">
            <div>
              <dt>Length</dt>
              <dd>{formatDuration(insights.duration_minutes)}</dd>
            </div>
            <div>
              <dt>Person-hours</dt>
              <dd>{formatHours(insights.person_hours)}</dd>
            </div>
            <div>
              <dt>Time zones</dt>
              <dd>{insights.time_zones.length}</dd>
            </div>
          </dl>

          <InsightBlock
            tone={insights.outside_working_hours_count ? 'warn' : 'ok'}
            title={
              insights.outside_working_hours_count
                ? `Outside working hours for ${insights.outside_working_hours_count} of ${insights.participant_count}`
                : "Inside everyone's working hours"
            }
          >
            {insights.participants
              .filter((p) => !p.within_working_hours)
              .map((p) => (
                <li key={p.user_id}>
                  <span className="insight-name">{p.name}</span>
                  <span className="insight-detail">
                    {formatLocalLabel(p.local_start)} in {shortZone(p.time_zone)} · {reasonLabel(p.reason)}
                  </span>
                </li>
              ))}
          </InsightBlock>

          <InsightBlock
            tone={insights.conflict_count ? 'warn' : 'ok'}
            title={
              insights.conflict_count
                ? `${insights.conflict_count} ${insights.conflict_count === 1 ? 'person is' : 'people are'} double-booked`
                : 'No one is double-booked'
            }
          >
            {insights.conflicts.map((c) => (
              <li key={`${c.user_id}-${c.meeting_id}`}>
                <span className="insight-name">{c.name ?? `User ${c.user_id}`}</span>
                <span className="insight-detail">
                  Also in “{c.title}”, {formatTimeRange(c.start_time, c.end_time)}
                </span>
              </li>
            ))}
          </InsightBlock>
        </>
      )}
    </section>
  );
}

function InsightBlock({
  tone,
  title,
  children,
}: {
  tone: 'ok' | 'warn';
  title: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [];
  return (
    <div className={`insight-block insight-${tone}`}>
      <p className="insight-title">
        <span className="insight-icon" aria-hidden="true">
          {tone === 'ok' ? '✓' : '!'}
        </span>
        {title}
      </p>
      {items.length > 0 && <ul className="insight-list">{children}</ul>}
    </div>
  );
}
