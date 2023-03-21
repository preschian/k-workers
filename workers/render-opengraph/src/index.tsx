import { Hono } from 'hono';
import { html } from 'hono/html';

const app = new Hono();

interface SiteData {
  children?: any;
  title: string;
  description: string;
  canonical: string;
  image: string;
}

const Layout = (props: SiteData) => html`
  <!DOCTYPE html>
  <html>
    <head>
      <title>${props.title}</title>

      <link rel="canonical" href="${props.canonical}" />

      <meta name="description" content="${props.description}" />

      <meta property="og:type" content="website" />
      <meta property="og:url" content="${props.canonical}" />
      <meta
        property="og:site_name"
        content="KodaDot - Polkadot / Kusama NFT explorer"
      />
      <meta property="og:title" content="${props.title}" />
      <meta property="og:description" content="${props.description}" />
      <meta property="og:image" content="${props.image}" />

      <meta name="twitter:card" content="summary_large_image" />
    </head>

    <body>
      ${props.children}
    </body>
  </html>
`;

const Opengraph = (props: { siteData: SiteData; name: string }) => (
  <Layout {...props.siteData}>
    <h1>{props.siteData.title}</h1>
    <img src={props.siteData.image} alt={props.siteData.title} />
  </Layout>
);

app.get('/', (c) => {
  return c.text('hello hono.js');
});

app.get('/:chain/gallery/:id', async (c) => {
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
  const name = nftEntityById.name;
  const description = nftEntityById.meta?.description;
  const title = `${name} | Low Carbon NFTs`;

  // contruct price
  const number = nftEntityById.price;
  const numAsNumber = parseFloat(number);
  const divisor = 1000000000000; // 10^12
  const convertedValue = numAsNumber / divisor;
  const ksmValue = convertedValue.toFixed(1);
  const price = number === '0' ? '' : `${ksmValue} KSM`;

  // construct image to cdn
  const ipfsCid = nftEntityById.meta?.image.split('ipfs:/')[1];
  const cdn = new URL(ipfsCid, 'https://image.w.kodadot.xyz');
  const image = new URL(`https://og-image-green-seven.vercel.app/${name}.jpeg`);
  image.searchParams.set('price', price);
  image.searchParams.set('image', cdn.toString());

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
