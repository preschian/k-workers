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

  DEDICATED_GATEWAY: string;
  PINATA_GATEWAY: string;
  CLOUDFLARE_GATEWAY: string;
  UPLOAD_R2_GATEWAY: string;
}

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
      const headers = new Headers();

      if (
        url.pathname.includes('/ipfs/') &&
        (request.method === 'GET' || request.method === 'HEAD')
      ) {
        headers.set('Allow', 'GET, HEAD, POST, OPTIONS');
        headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Max-Age', '86400');

        // Construct the cache key from the cache URL
        const cacheKey = new Request(url.toString() + '2022-10-28', request);
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

        console.log({ objectKey, object });

        if (object === null) {
          const fetchIPFS = await Promise.any([
            fetch(env.DEDICATED_GATEWAY + url.pathname),
            fetch(env.PINATA_GATEWAY + url.pathname),
            fetch(env.CLOUDFLARE_GATEWAY + url.pathname),
          ]);
          const statusCode = fetchIPFS.status;
          const contentType = fetchIPFS.headers.get('Content-Type');
          const isJson = contentType === 'application/json';

          const bodyIPFS: ResponseBody | Blob = isJson
            ? await fetchIPFS.json()
            : await fetchIPFS.blob();
          const body = isJson ? JSON.stringify(bodyIPFS) : bodyIPFS;

          console.log({
            statusCode,
            contentType,
            objectKey,
          });

          // TODO: what is the respone status from infura if bandwidth reached the limit?
          if (statusCode === 200) {
            const uploadR2 = await fetch(env.UPLOAD_R2_GATEWAY + url.pathname, {
              method: 'POST',
              body: body,
              headers: {
                'Content-Type': contentType || 'text/plain',
              },
            });

            console.log({
              'upload-r2-status': uploadR2.status,
              path: env.UPLOAD_R2_GATEWAY,
            });

            headers.set('Content-Type', contentType || 'text/plain');
            return new Response(body, {
              headers,
            });
          }

          // fallback to pinata
          // if (url.pathname.length) {
          //   return Response.redirect(
          //     `${env.PINATA_GATEWAY}${url.pathname}`,
          //     302
          //   );
          // }

          // fallback to cf-ipfs
          if (url.pathname.length) {
            return Response.redirect(
              `${env.CLOUDFLARE_GATEWAY}${url.pathname}`,
              302
            );
          }

          headers.set('Content-Type', 'application/json;charset=UTF-8');
          return new Response(
            JSON.stringify({ statusCode, contentType, objectKey }),
            {
              headers,
              status: statusCode,
            }
          );
        }

        // Set the appropriate object headers
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

      const data = {
        status: 'ok',
      };
      const json = JSON.stringify(data, null, 2);
      return new Response(json, {
        headers: {
          'content-type': 'application/json;charset=UTF-8',
        },
      });
    } catch (e) {
      return new Response('Error thrown ' + (e as Error).message);
    }
  },
};
