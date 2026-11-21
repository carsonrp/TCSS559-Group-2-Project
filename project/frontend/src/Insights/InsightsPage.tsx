import { useEffect, useMemo, useState } from 'react';
import { fetchInsightsSummary, InsightsSummary } from '../api/meetings';
import { STATUS_COLORS, STATUS_ORDER, statusColor, statusLabel } from '../Calendar/status';
import { formatDuration, formatHours, formatLocalLabel, formatWhen, reasonLabel, shortZone } from './format';
import './Insights.css';

type Period = 'week' | 'month';

// Weeks start on Sunday, matching the calendar's week view.
function periodRange(period: Period, anchor: Date) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') {
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  start.setDate(1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

const rangeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

function rangeLabel(period: Period, start: Date, end: Date) {
  if (period === 'month') return monthFmt.format(start);
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  return rangeFmt.formatRange(start, last);
}

export default function InsightsPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { start, end } = useMemo(() => periodRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchInsightsSummary(start, end)
      .then((data) => active && setSummary(data))
      .catch((err) => active && setError((err as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [start, end]);

  const shift = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (period === 'week') next.setDate(next.getDate() + 7 * direction);
    else next.setMonth(next.getMonth() + direction, 1);
    setAnchor(next);
  };

  return (
    <div className="insights-page">
      <div className="insights-toolbar">
        <div className="segmented" role="group" aria-label="Period">
          {(['week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              className={p === period ? 'active' : ''}
              aria-pressed={p === period}
              onClick={() => setPeriod(p)}
            >
              {p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        <div className="insights-nav">
          <button type="button" className="btn" aria-label={`Previous ${period}`} onClick={() => shift(-1)}>
            ‹
          </button>
          <button type="button" className="btn" onClick={() => setAnchor(new Date())}>
            Today
          </button>
          <button type="button" className="btn" aria-label={`Next ${period}`} onClick={() => shift(1)}>
            ›
          </button>
        </div>
        <h2 className="insights-range">{rangeLabel(period, start, end)}</h2>
        {loading && summary && <span className="muted">Updating…</span>}
      </div>

      {error && <div className="calendar-error">Couldn't load insights: {error}</div>}
      {!summary && loading && !error && <p className="muted">Loading insights…</p>}

      {summary && summary.totals.meetings === 0 && (
        <div className="insights-card insights-empty">No meetings in this {period}.</div>
      )}

      {summary && summary.totals.meetings > 0 && <SummaryView summary={summary} />}
    </div>
  );
}

function SummaryView({ summary }: { summary: InsightsSummary }) {
  const { totals } = summary;
  const cancelled = totals.meetings - totals.active_meetings;

  return (
    <>
      <div className="stat-tiles">
        <StatTile label="Meetings" value={`${totals.meetings}`} note={cancelled ? `${cancelled} cancelled` : undefined} />
        <StatTile label="Meeting hours" value={formatHours(totals.meeting_hours)} note="time on the calendar" />
        <StatTile label="Person-hours" value={formatHours(totals.person_hours)} note="hours × participants" />
        <StatTile
          label="Average meeting"
          value={formatDuration(totals.average_duration_minutes)}
          note={`${totals.average_participants} people on average`}
        />
        <StatTile
          label="Outside working hours"
          value={`${totals.meetings_outside_working_hours}`}
          note={`of ${totals.active_meetings} meetings, for someone`}
          warn={totals.meetings_outside_working_hours > 0}
        />
      </div>

      <div className="insights-grid">
        <section className="insights-card">
          <h3>Meetings by status</h3>
          <StatusBar data={summary.by_status} total={totals.meetings} />
          <p className="card-note">
            {summary.attendance.optional} of {summary.attendance.required + summary.attendance.optional} invitations
            are optional ({Math.round(summary.attendance.optional_share * 100)}%).
          </p>
        </section>

        <section className="insights-card">
          <h3>Person-hours by department</h3>
          <DepartmentBars data={summary.by_department} />
        </section>
      </div>

      <section className="insights-card">
        <h3>Time in meetings by person</h3>
        <div className="table-wrap">
          <table className="insights-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Department</th>
                <th scope="col" className="num">Meetings</th>
                <th scope="col" className="num">Hours</th>
                <th scope="col" className="num">Outside their hours</th>
              </tr>
            </thead>
            <tbody>
              {summary.people.map((p) => (
                <tr key={p.user_id}>
                  <td>{p.name}</td>
                  <td>{p.department}</td>
                  <td className="num">{p.meetings}</td>
                  <td className="num">{formatHours(p.hours)}</td>
                  <td className="num">
                    {p.outside_working_hours > 0 ? (
                      <span className="warn-text">{p.outside_working_hours}</span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="insights-card">
        <h3>Meetings outside someone's working hours</h3>
        {summary.outside_working_hours.length === 0 ? (
          <p className="muted">Every meeting falls inside its participants' working hours.</p>
        ) : (
          <div className="table-wrap">
            <table className="insights-table">
              <thead>
                <tr>
                  <th scope="col">Meeting</th>
                  <th scope="col">Your time</th>
                  <th scope="col">Person</th>
                  <th scope="col">Their time</th>
                  <th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {summary.outside_working_hours.map((row) => (
                  <tr key={`${row.meeting_id}-${row.user_id}`}>
                    <td>{row.title}</td>
                    <td>{formatWhen(row.start_time)}</td>
                    <td>{row.name}</td>
                    <td>
                      {formatLocalLabel(row.local_start)} <span className="muted">{shortZone(row.time_zone)}</span>
                    </td>
                    <td>{reasonLabel(row.reason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function StatTile({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className={`stat-tile${warn ? ' stat-warn' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

interface Tip {
  text: string;
  x: number;
  y: number;
}

function useTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (text: string) => (e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    const host = (e.currentTarget.closest('.chart-host') as HTMLElement).getBoundingClientRect();
    const mark = e.currentTarget.getBoundingClientRect();
    setTip({ text, x: mark.left - host.left + mark.width / 2, y: mark.top - host.top });
  };
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="chart-tip" role="status" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  ) : null;
  return { show, hide, node };
}

function StatusBar({ data, total }: { data: InsightsSummary['by_status']; total: number }) {
  const { show, hide, node } = useTooltip();
  // Fixed order so a status keeps its place and color whatever the counts are.
  const ordered = [...data].sort(
    (a, b) =>
      (STATUS_ORDER.indexOf(a.status) + 99) % 99 - (STATUS_ORDER.indexOf(b.status) + 99) % 99
  );

  return (
    <div className="chart-host">
      <div className="status-bar" role="img" aria-label={ordered.map((d) => `${statusLabel(d.status)} ${d.count}`).join(', ')}>
        {ordered.map((d) => {
          const text = `${statusLabel(d.status)}: ${d.count} meeting${d.count === 1 ? '' : 's'} (${Math.round(
            (d.count / total) * 100
          )}%)`;
          return (
            <span
              key={d.status}
              className="status-seg"
              tabIndex={0}
              style={{ flexGrow: d.count, background: statusColor(d.status) }}
              onMouseEnter={show(text)}
              onFocus={show(text)}
              onMouseLeave={hide}
              onBlur={hide}
            />
          );
        })}
      </div>
      <ul className="chart-legend">
        {ordered.map((d) => (
          <li key={d.status}>
            <span className="legend-swatch" style={{ background: STATUS_COLORS[d.status] ?? statusColor(d.status) }} />
            {statusLabel(d.status)}
            <strong>{d.count}</strong>
          </li>
        ))}
      </ul>
      {node}
    </div>
  );
}

function DepartmentBars({ data }: { data: InsightsSummary['by_department'] }) {
  const { show, hide, node } = useTooltip();
  const max = Math.max(...data.map((d) => d.person_hours), 1);

  return (
    <div className="chart-host">
      <div className="hbars">
        {data.map((d) => {
          const text = `${d.department}: ${formatHours(d.person_hours)} person-hours across ${d.meetings} meeting${
            d.meetings === 1 ? '' : 's'
          }`;
          return (
            <div
              key={d.department}
              className="hbar-row"
              tabIndex={0}
              onMouseEnter={show(text)}
              onFocus={show(text)}
              onMouseLeave={hide}
              onBlur={hide}
            >
              <span className="hbar-label">{d.department}</span>
              <span className="hbar-track">
                <span className="hbar-fill" style={{ width: `calc((100% - 48px) * ${d.person_hours / max})` }} />
                <span className="hbar-value">{formatHours(d.person_hours)}</span>
              </span>
            </div>
          );
        })}
      </div>
      {node}
    </div>
  );
}
