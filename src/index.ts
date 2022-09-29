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

const PUBLIC_GATEWAY = 'https://kodadot.mypinata.cloud';

type ResponseBody =
  'string | Blob | ReadableStream | ArrayBuffer | ArrayBufferView | null';

export default {
  async fetch(
    request: Request,
    env: Env,
    context: ExecutionContext
  ): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname.includes('/ipfs/')) {
        // Construct the cache key from the cache URL
        const cacheKey = new Request(url.toString(), request);
        const cache = caches.default;

        // Check whether the value is already available in the cache
        // if not, you will need to fetch it from R2, and store it in the cache
        // for future access
        let response = await cache.match(cacheKey);

        if (response) {
          console.log(`Cache hit for: ${request.url}.`);
          return response;
        }

        console.log(
          `Response for request url: ${request.url} not present in cache. Fetching and caching request.`
        );

        // If not in cache, get it from R2
        const objectKey = url.pathname.slice(1);
        const object = await env.MY_BUCKET.get(objectKey);
        // const object = null;

        if (object === null) {
          const fileName = url.pathname.substring(1);
          const fetchIPFS = await fetch(PUBLIC_GATEWAY + url.pathname);
          const statusCode = fetchIPFS.status;
          const contentType = fetchIPFS.headers.get('Content-Type');
          const isJson = contentType === 'application/json';

          const bodyIPFS: ResponseBody | Blob = isJson
            ? await fetchIPFS.json()
            : await fetchIPFS.blob();
          const body = isJson ? JSON.stringify(bodyIPFS) : bodyIPFS;

          context.waitUntil(
            env.MY_BUCKET.put(fileName, body, {
              httpMetadata: { contentType: contentType || undefined },
            })
          );

          console.log({ statusCode, contentType, fileName });

          if (statusCode === 200) {
            return new Response(body, {
              headers: {
                'content-type': contentType || 'text/plain',
              },
            });
          }

          if (url.pathname.length) {
            return Response.redirect(`${PUBLIC_GATEWAY}${url.pathname}`, 301);
          }

          return new Response('Not found');
        }

        // Set the appropriate object headers
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);

        // Cache API respects Cache-Control headers. Setting s-max-age to 10
        // will limit the response to be in cache for 10 seconds max
        // Any changes made to the response here will be reflected in the cached value
        // headers.append('Cache-Control', 's-maxage=10');
        headers.append('Cache-Control', 'public, max-age=31536000');

        response = new Response(object.body, {
          headers,
        });

        // Store the fetched response as cacheKey
        // Use waitUntil so you can return the response without blocking on
        // writing to cache
        context.waitUntil(cache.put(cacheKey, response.clone()));

        return response;
      }

      return new Response('Not found');
    } catch (e) {
      return new Response('Error thrown ' + (e as Error).message);
    }
  },
};
