import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'

interface Env {
  MY_BUCKET: R2Bucket;
  DEDICATED_GATEWAY: string;
  DEDICATED_BACKUP_GATEWAY: string;
  CLOUDFLARE_GATEWAY: string;
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

app.get('/', (c) => c.text('Hello! cf-workers!'))

// app.get('/ipfs/*', cache({ cacheName: 'cdn-010323-01', cacheControl: 'max-age=31536000' }))

app.all('/ipfs/:cid', async (c) => {
  const cid = c.req.param('cid')
  const method = c.req.method

  if (method === 'GET' || method === 'HEAD') {
    const fetchIPFS = await Promise.any([
      fetch(`${c.env.DEDICATED_GATEWAY}/ipfs/${cid}`),
      fetch(`${c.env.DEDICATED_BACKUP_GATEWAY}/ipfs/${cid}`)
    ])
    // const statusCode = fetchIPFS.status
    const contentType = fetchIPFS.headers.get('Content-Type')

    c.header('Content-Type', contentType || 'text/plain')

    // return c.text(`${statusCode}: ${cid}`)
    return c.body(fetchIPFS.body)
  }
})

export default app
