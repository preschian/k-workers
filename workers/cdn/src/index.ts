import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  MY_BUCKET: R2Bucket;
  DEDICATED_GATEWAY: string;
  DEDICATED_BACKUP_GATEWAY: string;
  CLOUDFLARE_GATEWAY: string;
  CF_IMAGE_ACCOUNT: string;
  CF_IMAGE_ID: string;

  // wrangler secret
  TOKEN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/ipfs/*', cors());

app.get('/', (c) => c.text('Hello! cf-workers!'));

async function uploadToCloudflareImages({
  token,
  gateway,
  cid,
  imageAccount,
  imageId,
}: {
  token: string;
  gateway: string;
  cid: string;
  imageAccount: string;
  imageId: string;
}) {
  const uploadHeaders = new Headers();
  uploadHeaders.append('Authorization', `Bearer ${token}`);

  const uploadFormData = new FormData();
  uploadFormData.append('url', `${gateway}/ipfs/${cid}`);
  uploadFormData.append('id', cid);

  const requestOptions = {
    method: 'POST',
    headers: uploadHeaders,
    body: uploadFormData,
    redirect: 'follow',
  };

  const uploadCfImage = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${imageAccount}/images/v1`,
    requestOptions
  );
  const uploadStatus = uploadCfImage.status;

  // if image supported by cf-images or already exists, redirect to cf-images
  if (uploadStatus === 200 || uploadStatus === 409) {
    // return Response.redirect(`https://imagedelivery.net/${c.env.CF_IMAGE_ID}/${cid}/public`, 302)
    return `https://imagedelivery.net/${imageId}/${cid}/public`;
  }

  return '';
}

app.all('/ipfs/:cid', async (c) => {
  const cid = c.req.param('cid');
  const method = c.req.method;

  if (method === 'GET') {
    const objectName = `ipfs/${cid}`;
    const object = await c.env.MY_BUCKET.get(objectName);

    // if r2 object not exists, fetch from ipfs gateway
    if (object === null) {
      const fetchIPFS = await Promise.any([
        fetch(`${c.env.DEDICATED_GATEWAY}/ipfs/${cid}`),
        fetch(`${c.env.DEDICATED_BACKUP_GATEWAY}/ipfs/${cid}`),
      ]);
      const statusCode = fetchIPFS.status;

      if (statusCode === 200) {
        // put object to r2
        await c.env.MY_BUCKET.put(objectName, fetchIPFS.body, {
          httpMetadata: fetchIPFS.headers,
        });

        // put object to cf-images
        const imageUrl = await uploadToCloudflareImages({
          cid,
          token: c.env.TOKEN,
          gateway: c.env.DEDICATED_GATEWAY,
          imageAccount: c.env.CF_IMAGE_ACCOUNT,
          imageId: c.env.CF_IMAGE_ID,
        });

        if (imageUrl) {
          return Response.redirect(imageUrl, 302);
        }

        // else, render r2 object
        const r2Object = await c.env.MY_BUCKET.get(objectName);
        if (r2Object !== null) {
          const headers = new Headers();
          r2Object.writeHttpMetadata(headers);
          headers.set('Access-Control-Allow-Origin', '*');
          headers.set('etag', r2Object.httpEtag);

          return new Response(r2Object.body, {
            headers,
          });
        }
      }

      // fallback to cf-ipfs
      return Response.redirect(`${c.env.CLOUDFLARE_GATEWAY}/ipfs/${cid}`, 302);
    }

    // else, redirect to cf-images or render existing r2 object
    const imageUrl = await uploadToCloudflareImages({
      cid,
      token: c.env.TOKEN,
      gateway: c.env.DEDICATED_GATEWAY,
      imageAccount: c.env.CF_IMAGE_ACCOUNT,
      imageId: c.env.CF_IMAGE_ID,
    });

    if (imageUrl) {
      return Response.redirect(imageUrl, 302);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('etag', object.httpEtag);

    return new Response(object.body, {
      headers,
    });
  }

  if (method === 'HEAD') {
    const fetchIPFS = await Promise.any([
      fetch(`${c.env.DEDICATED_GATEWAY}/ipfs/${cid}`),
      fetch(`${c.env.DEDICATED_BACKUP_GATEWAY}/ipfs/${cid}`),
    ]);

    return c.body(fetchIPFS.body);
  }
});

export default app;
