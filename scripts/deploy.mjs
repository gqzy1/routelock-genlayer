import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { executionStatus } from '../src/receipts.js';

const code = await readFile(new URL('../contracts/routelock.py', import.meta.url), 'utf8');
const chain = studionet;
const client = createClient({ chain });
const schema = await client.getContractSchemaForCode(code);
if (process.argv.includes('--schema')) {
  console.log(JSON.stringify(schema, null, 2));
  process.exit(0);
}
const existingHash = process.argv[2];
const output = new URL('../deployment.json', import.meta.url);
try {
  await readFile(output);
  throw new Error('deployment.json already exists.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let hash = existingHash;
if (!hash) {
  const key = process.env.ROUTELOCK_STUDIONET_KEY;
  if (!/^0x[0-9a-f]{64}$/i.test(key || '')) throw new Error('A funded disposable Studionet signer is required.');
  const signer = createClient({ chain, account: createAccount(key) });
  hash = await signer.deployContract({ code, args: [], leaderOnly: false });
}
if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Invalid deployment transaction hash.');
console.log('Deployment transaction:', hash);
const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED,
  interval: 4500, retries: 60, fullTransaction: true });
const address = receipt.to_address ?? receipt.recipient;
if (executionStatus(receipt) !== 'SUCCESS' || !address ||
    await client.getContractCode(address) !== code ||
    await client.readContract({ address, functionName: 'protocol', transactionHashVariant: 'latest-final' }) !== 'routelock/1') {
  throw new Error('Deployment execution, source and protocol did not all verify.');
}
await writeFile(output, JSON.stringify({ chainId: chain.id, address, deploymentTx: hash,
  sourceSha256: createHash('sha256').update(code).digest('hex') }, null, 2) + '\n', { flag: 'wx' });
console.log('Verified deployment:', address);
