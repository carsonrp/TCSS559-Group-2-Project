import { useState } from 'react';
import './App.css';
import Calendar from './Calendar/Calendar';
import InsightsPage from './Insights/InsightsPage';
import { useTheme } from './theme';

type View = 'calendar' | 'insights';

function App() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [view, setView] = useState<View>('calendar');

  return (
    <div className="App">
      <header className="App-header">
        <h1>MeetingLoop</h1>
        <p>Team meeting calendar</p>
        <nav className="app-tabs" aria-label="Views">
          <button
            type="button"
            className={view === 'calendar' ? 'active' : ''}
            aria-current={view === 'calendar' ? 'page' : undefined}
            onClick={() => setView('calendar')}
          >
            Calendar
          </button>
          <button
            type="button"
            className={view === 'insights' ? 'active' : ''}
            aria-current={view === 'insights' ? 'page' : undefined}
            onClick={() => setView('insights')}
          >
            Insights
          </button>
        </nav>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
      </header>
      <main>{view === 'calendar' ? <Calendar /> : <InsightsPage />}</main>
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default App;
