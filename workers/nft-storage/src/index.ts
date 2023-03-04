import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.text('hello nft-storage!'));

app.post('/pinFile', async (c) => {
  console.log('');
  console.log(c.req.headers.get('Content-Type'));
  // console.log(await c.req.formData());
  console.log('');
  return c.text('hello nft-storage!');
});

export default app;
