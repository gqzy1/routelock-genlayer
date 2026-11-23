export const KRAKEN = 'https://support.kraken.com/articles/native-usd-coin';
export const POLICY_NOTICE = 'https://support.kraken.com/ca/articles/usdce-support-ending-arbitrum-optimism-polygon';
export const PROTOCOL = 'routelock/2';
export const STUDIONET_ID = 61999;
export const routes = {
  native: {
    chain: 42161,
    network: 'Arbitrum One',
    variant: 'Native USDC',
    address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    issuer: 'https://developers.circle.com/stablecoins/usdc-contract-addresses',
    policy: KRAKEN,
    practice: 'READY',
    summary: 'The public policy lists native USDC deposits on Arbitrum One.',
  },
  bridged: {
    chain: 43114,
    network: 'Avalanche C-Chain',
    variant: 'Bridged USDC.e',
    address: '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664',
    issuer: 'https://help.circle.com/support/en/usdc-on-avalanche-vs-usdc-e?id=kb_article_view&sysparm_article=KB0010587',
    policy: KRAKEN,
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

export function releaseAddress(release) {
  return release?.chainId === STUDIONET_ID && release.protocol === PROTOCOL
    && release.status === 'verified' && isAddress(release.address)
    && /^0x[0-9a-f]{64}$/i.test(release.deploymentTx)
    && /^[0-9a-f]{64}$/.test(release.sourceSha256)
    && release.finality === 'FINALIZED' && release.execution === 'SUCCESS'
    ? release.address.toLowerCase() : '';
}

export function liveRecords(release, evidence) {
  const address = releaseAddress(release);
  if (!address || evidence?.chainId !== STUDIONET_ID || evidence.protocol !== PROTOCOL
      || evidence.address?.toLowerCase() !== address || evidence.deploymentTx !== release.deploymentTx
      || evidence.sourceSha256 !== release.sourceSha256 || !Array.isArray(evidence.records)) return [];
  return evidence.records.filter(item => item.protocol === PROTOCOL && item.deployment === address
    && Number.isSafeInteger(item.revision) && item.revision > 0
    && Object.values(routes).some(route => route.chain === item.chain && route.address === item.token)
    && item.evidence?.asset === item.token && item.evidence.chain === item.chain
    && item.evidence.operation === 'deposit' && item.transactions?.Assessment
    && (item.status === 'CONSUMED') === Boolean(item.transactions.Consumption)
    && Object.keys(item.transactions).every(label => ['Assessment', 'Consumption'].includes(label))
    && Object.values(item.transactions).every(hash => /^0x[0-9a-f]{64}$/i.test(hash)));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

export function matchesPublishedRecord(result, published) {
  const { title, transactions, ...record } = published;
  return JSON.stringify(canonical(result)) === JSON.stringify(canonical(record));
}
