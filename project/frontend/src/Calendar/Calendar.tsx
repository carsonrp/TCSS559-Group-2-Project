import { useCallback, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import type {
  CalendarRef,
  DateSelectInfo,
  EventClickInfo,
  EventInput,
  EventSourceFuncInfo,
} from '@fullcalendar/react';
import themePlugin from '@fullcalendar/react/themes/monarch';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import listPlugin from '@fullcalendar/react/list';
import interactionPlugin from '@fullcalendar/react/interaction';

// stylesheets
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/monarch/theme.css';
import '@fullcalendar/react/themes/monarch/palettes/purple.css';
import './Calendar.css';

import { fetchMeetings, MeetingSummary } from '../api/meetings';
import { statusColor, statusLabel, STATUS_COLORS } from './status';
import MeetingDetails from './MeetingDetails';
import CreateMeetingDialog from './CreateMeetingDialog';

function toEvent(meeting: MeetingSummary): EventInput {
  return {
    id: String(meeting.id),
    title: meeting.title,
    start: meeting.start_time,
    end: meeting.end_time,
    color: statusColor(meeting.status),
    // The dark palette would otherwise use dark event text; white reads well on every status color.
    contrastColor: '#ffffff',
    extendedProps: { meeting },
  };
}

export default function Calendar() {
  const calendarRef = useRef<CalendarRef>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [newRange, setNewRange] = useState<{ start: Date; end: Date } | null>(null);

  // FullCalendar calls this whenever the visible date range changes.
  const loadEvents = useCallback(async (info: EventSourceFuncInfo): Promise<EventInput[]> => {
    try {
      const meetings = await fetchMeetings(info.start, info.end);
      setError(null);
      return meetings.map(toEvent);
    } catch (err) {
      setError(
        `Couldn't load meetings: ${(err as Error).message}. Is the backend running at ${
          process.env.REACT_APP_API_URL || 'http://localhost:3000'
        }?`
      );
      return [];
    }
  }, []);

  const handleEventClick = (info: EventClickInfo) => {
    info.jsEvent.preventDefault();
    setSelectedMeetingId(Number(info.event.id));
  };

  const handleSelect = (info: DateSelectInfo) => {
    let { start, end } = info;
    // Selecting whole days in month view: default to a 1-hour 9am meeting on the first day.
    if (info.allDay) {
      start = new Date(start);
      start.setHours(9, 0, 0, 0);
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    setNewRange({ start, end });
    calendarRef.current?.getApi().unselect();
  };

  const openNewMeeting = () => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    setNewRange({ start, end: new Date(start.getTime() + 60 * 60 * 1000) });
  };

  const handleCreated = (id: number) => {
    setNewRange(null);
    calendarRef.current?.getApi().refetchEvents();
    setSelectedMeetingId(id);
  };

  return (
    <div className="calendar-page">
      <div className="calendar-toolbar">
        <div className="calendar-legend">
          {Object.keys(STATUS_COLORS).map((status) => (
            <span key={status} className="legend-item">
              <span className="legend-dot" style={{ background: STATUS_COLORS[status] }} />
              {statusLabel(status)}
            </span>
          ))}
        </div>
        <button type="button" className="btn btn-primary" onClick={openNewMeeting}>
          + New meeting
        </button>
      </div>

      {error && <div className="calendar-error">{error}</div>}

      <div className="calendar-shell">
        <FullCalendar
          ref={calendarRef}
          plugins={[themePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            start: 'prev,next today',
            center: 'title',
            end: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          height="auto"
          nowIndicator
          navLinks
          dayMaxEvents
          selectable
          selectMirror
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          scrollTime="08:00:00"
          businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00' }}
          events={loadEvents}
          eventClick={handleEventClick}
          select={handleSelect}
        />
      </div>

      {selectedMeetingId !== null && (
        <MeetingDetails meetingId={selectedMeetingId} onClose={() => setSelectedMeetingId(null)} />
      )}

      {newRange && (
        <CreateMeetingDialog
          initialStart={newRange.start}
          initialEnd={newRange.end}
          onClose={() => setNewRange(null)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
