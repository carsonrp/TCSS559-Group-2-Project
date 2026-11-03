import app from './app.js';
import env from './src/common/config/env.js';

const port = env.PORT;

app.listen(port, () => {
  console.log(`MeetingLoop API is running on port ${port}`);
});
