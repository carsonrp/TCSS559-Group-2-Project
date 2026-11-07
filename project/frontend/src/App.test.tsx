import { render, screen } from '@testing-library/react';
import App from './App';

// FullCalendar v7 ships as ES modules, which CRA's Jest setup doesn't transform,
// so the calendar itself is stubbed out here.
jest.mock('./Calendar/Calendar', () => () => <div data-testid="calendar" />);

test('renders the app header and calendar', () => {
  render(<App />);
  expect(screen.getByText('MeetingLoop')).toBeInTheDocument();
  expect(screen.getByTestId('calendar')).toBeInTheDocument();
});
