import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Env {
  MY_BUCKET: R2Bucket;
  DEDICATED_GATEWAY: string;
  DEDICATED_BACKUP_GATEWAY: string;
  CLOUDFLARE_GATEWAY: string;
  BUCKET_PUBLIC_URL: string;
  CF_IMAGE_ACCOUNT: string;
  CF_IMAGE_ID: string;

  // wrangler secret
  TOKEN: string;
}

const app = new Hono<{ Bindings: Env }>()

app.use('/ipfs/*', cors())

app.get('/', (c) => c.text('Hello! cf-workers!'))

app.all('/ipfs/:cid', async (c) => {
  const cid = c.req.param('cid')
  const method = c.req.method

  if (method === 'GET') {
    // TODO: get/set cache before hit ipfs gateway
    const fetchIPFS = await Promise.any([
      fetch(`${c.env.DEDICATED_GATEWAY}/ipfs/${cid}`),
      fetch(`${c.env.DEDICATED_BACKUP_GATEWAY}/ipfs/${cid}`)
    ])
    const statusCode = fetchIPFS.status

    if (statusCode === 200) {
      const objectName = `ipfs/${cid}`
      const object = await c.env.MY_BUCKET.get(objectName);

      // upload to r2
      if (object === null) {
        await c.env.MY_BUCKET.put(objectName, fetchIPFS.body, {
          httpMetadata: fetchIPFS.headers,
        })
      }

      // start upload to cf-images section
      const uploadHeaders = new Headers();
      uploadHeaders.append("Authorization", `Bearer ${c.env.TOKEN}`);

      const uploadFormData = new FormData();
      uploadFormData.append("url", `${c.env.DEDICATED_GATEWAY}/ipfs/${cid}`);
      uploadFormData.append("id", cid);

      const requestOptions = {
        method: 'POST',
        headers: uploadHeaders,
        body: uploadFormData,
        redirect: 'follow'
      };

      const uploadCfImage = await fetch(`https://api.cloudflare.com/client/v4/accounts/${c.env.CF_IMAGE_ACCOUNT}/images/v1`, requestOptions)
      const uploadStatus = uploadCfImage.status

      // end upload to cf-images section
      if (uploadStatus === 200 || uploadStatus === 409) {
        return Response.redirect(`https://imagedelivery.net/${c.env.CF_IMAGE_ID}/${cid}/public`, 302)
        // const cdn = await fetch(`https://imagedelivery.net/${c.env.CF_IMAGE_ID}/${cid}/public`)
        // const cdnContentType = cdn.headers.get('content-type') || 'text/plain'
        // c.header('content-type', cdnContentType)
        // return c.body(cdn.body)
      }

      // return Response.redirect(`${c.env.BUCKET_PUBLIC_URL}/ipfs/${cid}`, 302)
      // const r2Object = await fetch(`${c.env.BUCKET_PUBLIC_URL}/ipfs/${cid}`)
      // if (r2Object.status === 200) {
      //   const r2ContentType = r2Object.headers.get('content-type') || 'text/plain'
      //   c.header('content-type', r2ContentType)
      //   return c.body(r2Object.body)
      // }
      const r2Object = await c.env.MY_BUCKET.get(objectName);
      if (r2Object !== null) {
        const headers = new Headers()
        r2Object.writeHttpMetadata(headers)
        headers.set('etag', r2Object.httpEtag);

        return new Response(r2Object.body, {
          headers,
        })
      }
    }

    // fallback to cf-ipfs
    return Response.redirect(`${c.env.CLOUDFLARE_GATEWAY}/ipfs/${cid}`, 302)
  }

  if (method === 'HEAD') {
    const fetchIPFS = await Promise.any([
      fetch(`${c.env.DEDICATED_GATEWAY}/ipfs/${cid}`),
      fetch(`${c.env.DEDICATED_BACKUP_GATEWAY}/ipfs/${cid}`)
    ])

    return c.body(fetchIPFS.body)
  }
})

export default app
