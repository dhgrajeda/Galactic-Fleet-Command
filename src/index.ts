import { createApp } from './app';

const app = createApp();

const port = process.env.PORT || 3000;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Galactic Fleet Command API listening on port ${port}`);
});


