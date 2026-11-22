export const KRAKEN = 'https://support.kraken.com/au/articles/native-usd-coin';
export const routes = {
  native: {
    chain: 42161,
    network: 'Arbitrum One',
    variant: 'Native USDC',
    address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    issuer: 'https://developers.circle.com/stablecoins/usdc-contract-addresses',
    practice: 'READY',
    summary: 'The public policy lists native USDC deposits on Arbitrum One.',
  },
  bridged: {
    chain: 43114,
    network: 'Avalanche C-Chain',
    variant: 'Bridged USDC.e',
    address: '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664',
    issuer: 'https://help.circle.com/support/en/usdc-on-avalanche-vs-usdc-e?id=kb_article_view&sysparm_article=KB0010587',
    practice: 'BLOCKED',
    summary: 'The public policy excludes USDC.e on Avalanche C-Chain.',
  },
};

export const isAddress = (value) => /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
export const isKey = (value) => /^[a-z0-9][a-z0-9-]{2,39}$/.test(value);

export function toUnits(value) {
  if (!/^\d{1,7}(\.\d{1,6})?$/.test(value)) throw new Error('Enter an amount with up to six decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (amount <= 0n || amount > 1000000000000n) throw new Error('Amount must be above zero and at most 1,000,000.');
  return amount;
}
