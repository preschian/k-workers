import { extendFields, getClient } from '@kodadot1/uniquery';
import type { Prefix } from '@kodadot1/static';
import type { NFT, NFTMeta } from './types';

// TODO: put 'rmrk' into Prefix type
export type Chain = 'rmrk' & Prefix;

export const endpoints: Record<Chain, string> = {
  bsx: 'https://squid.subsquid.io/snekk/v/005/graphql',
  snek: 'https://squid.subsquid.io/snekk/v/004/graphql',
  rmrk: 'https://squid.subsquid.io/rubick/graphql',
};

export const getNftById = async (chain: Chain, id: string) => {
  const client = getClient();
  const query = client.itemById(id, extendFields(['meta', 'price']));

  // TODO: indexer for 'rmrk'
  // return await client.fetch(query);

  return await fetch(endpoints[chain], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(query),
  });
};

export function ipfsToCdn(ipfs: string) {
  const ipfsCid = ipfs.split('ipfs:/')[1];
  const cdn = new URL(ipfsCid, 'https://image.w.kodadot.xyz');

  return cdn.toString();
}

export function formatPrice(price: string) {
  const number = price;
  const numAsNumber = parseFloat(number);
  const divisor = 1000000000000; // 10^12
  const convertedValue = numAsNumber / divisor;
  const ksmValue = convertedValue.toFixed(1);
  return number === '0' ? '' : `${ksmValue} KSM`;
}

export async function getProperties(nft: NFT) {
  if (!nft.meta) {
    const response = await fetch(ipfsToCdn(nft.metadata));
    const data = (await response.json()) as NFTMeta;

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
