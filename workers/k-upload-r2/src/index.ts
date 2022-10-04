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
  MY_BUCKET: R2Bucket;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    context: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    console.log({ url });

    try {
      if (request.method === 'PUT' || request.method == 'POST') {
        console.log(url.pathname);

        const objectKey = url.pathname.slice(1);
        const object = await env.MY_BUCKET.get(objectKey);

        if (!object) {
          await env.MY_BUCKET.put(url.pathname.substring(1), request.body, {
            httpMetadata: request.headers,
          });
        }

        return new Response('success');
      }
    } catch (error) {
      console.log(error);
    }

    return new Response('Hello World!');
  },
};
