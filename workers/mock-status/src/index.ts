import { Hono } from 'hono';
import { poweredBy } from 'hono/powered-by';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());
app.use('*', poweredBy());

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.get('/404', (c) => {
  c.status(404);
  return c.body('Not Found');
});

app.get('/429', (c) => {
  c.status(429);
  return c.body('Too Many Requests');
});

app.get('/delay', (c) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(c.text('Delayed'));
    }, 3000);
  });
});

export default app;
