import app from './app.js';
import './calendar.repository.js';

const port = Number(process.env.PORT) || 3010;
app.listen(port, () => {
  console.log(`Calendar Service is running on port ${port}`);
});
