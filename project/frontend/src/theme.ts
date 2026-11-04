import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'meetingloop-theme';

function readInitialTheme(): Theme {
  // public/index.html sets this attribute before React loads; dark is the default.
  const attr = document.documentElement.getAttribute('data-color-scheme');
  if (attr === 'light' || attr === 'dark') return attr;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    // FullCalendar's monarch palette keys its dark colors off this same attribute.
    document.documentElement.setAttribute('data-color-scheme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage unavailable (private mode etc.) — theme still applies for this visit */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return { theme, toggleTheme };
}
