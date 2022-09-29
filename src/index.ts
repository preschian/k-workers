/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
}

const BUCKET_URL = 'https://assets.preschian.xyz';

async function serveAsset(request: Request, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const cache = caches.default;
  let response = await cache.match(request);

  if (!response) {
    response = await fetch(`${BUCKET_URL}${url.pathname}`);
    const headers = { 'cache-control': 'public, max-age=31536000' };
    response = new Response(response.body, { ...response, headers });
    ctx.waitUntil(cache.put(request, response.clone()));
  }
  return response;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method === 'GET') {
      let response = await serveAsset(request, ctx);
      if (response.status > 399) {
        response = new Response(response.statusText, {
          status: response.status,
        });
      }
      return response;
    } else {
      return new Response('Method not allowed', { status: 405 });
    }
  },
};
