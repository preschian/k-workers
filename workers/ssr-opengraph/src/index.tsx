import { Hono } from 'hono';
import isbot from 'isbot';
import { Opengraph } from './template';

const app = new Hono();

app.get('/', (c) => {
  return c.text('hello hono.js');
});

function ipfsToCdn(ipfs: string) {
  const ipfsCid = ipfs.split('ipfs:/')[1];
  const cdn = new URL(ipfsCid, 'https://image.w.kodadot.xyz');

  return cdn.toString();
}

function formatPrice(price: string) {
  const number = price;
  const numAsNumber = parseFloat(number);
  const divisor = 1000000000000; // 10^12
  const convertedValue = numAsNumber / divisor;
  const ksmValue = convertedValue.toFixed(1);
  return number === '0' ? '' : `${ksmValue} KSM`;
}

async function getProperties(nft) {
  if (!nft.meta) {
    const response = await fetch(ipfsToCdn(nft.metadata));
    const data = await response.json();

    return {
      name: data.name,
      description: data.description,
      title: `${data.name} | Low Carbon NFTs`,
      cdn: ipfsToCdn(data.image),
    };
  }

  const name = nft.name;
  const description = nft.meta?.description;
  const title = `${name} | Low Carbon NFTs`;
  const cdn = ipfsToCdn(nft.meta?.image);

  return {
    name,
    description,
    title,
    cdn,
  };
}

app.get('/:chain/gallery/:id', async (c) => {
  const useragent = c.req.headers.get('user-agent');

  if (useragent && !isbot(useragent)) {
    return fetch(c.req.url);
  }

  const chain = c.req.param('chain') as 'bsx' | 'rmrk';
  const id = c.req.param('id');

  const endpoints: Record<'bsx' | 'rmrk', string> = {
    bsx: 'https://squid.subsquid.io/snekk/v/005/graphql',
    rmrk: 'https://squid.subsquid.io/rubick/graphql',
  };

  const response = await fetch(endpoints[chain], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
          query NftById {
            nftEntityById(id: "${id}") {
              id
              name
              price
              metadata
              meta {
                name
                image
                animationUrl
                description
                id
              }
            }
          }
        `,
    }),
  });
  const data = await response.json();
  const { nftEntityById } = data.data;

  const canonical = `https://kodadot.xyz/${chain}/gallery/${id}`;
  const { name, description, title, cdn } = await getProperties(nftEntityById);

  // contruct price
  const price = formatPrice(nftEntityById.price);

  // construct vercel image with cdn
  const image = new URL(`https://og-image-green-seven.vercel.app/${name}.jpeg`);
  image.searchParams.set('price', price);
  image.searchParams.set('image', cdn);

  const props = {
    name: `${chain} ${id}`,
    siteData: {
      title,
      description: description,
      canonical,
      image: image.toString(),
    },
  };

  return c.html(<Opengraph {...props} />);
});

export default app;
