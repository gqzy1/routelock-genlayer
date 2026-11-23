import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { executionStatus } from '../src/receipts.js';
import { isAddress, PROTOCOL, STUDIONET_ID } from '../src/routes.js';

const code = await readFile(new URL('../contracts/routelock.py', import.meta.url), 'utf8');
const endpoint = 'https://studio.genlayer.com/api';
const client = createClient({ chain: { ...studionet, id: STUDIONET_ID }, endpoint });
if (await client.getChainId() !== STUDIONET_ID) throw new Error('Unexpected Studionet chain ID.');

const argument = process.argv[2];
if (argument === '--schema') {
  console.log(JSON.stringify(await client.getContractSchemaForCode(code), null, 2));
} else {
  if (!/^0x[0-9a-f]{64}$/i.test(argument ?? '')) throw new Error('Supply --schema or a submitted deployment hash.');
  const receipt = await client.getTransaction({ hash: argument });
  const address = receipt.to_address ?? receipt.recipient;
  if ((receipt.hash ?? receipt.txId)?.toLowerCase() !== argument.toLowerCase()
      || receipt.typeHex !== 1 || receipt.statusName !== 'FINALIZED' || executionStatus(receipt) !== 'SUCCESS'
      || !isAddress(address)) {
    throw new Error('The deployment receipt has not verified successfully.');
  }
  const [rawCode, protocol] = await Promise.all([
    client.getContractCode(address),
    client.readContract({ address, functionName: 'protocol', transactionHashVariant: 'latest-final' }),
  ]);
  const deployedCode = /^0x[0-9a-f]+$/i.test(rawCode)
    ? Buffer.from(rawCode.slice(2), 'hex')
    : Buffer.from(rawCode);
  if (!deployedCode.equals(Buffer.from(code)) || protocol !== PROTOCOL) {
    throw new Error('Finalized contract source or protocol does not match this release.');
  }
  console.log(JSON.stringify({
    chainId: STUDIONET_ID, protocol, status: 'verified', address,
    deploymentTx: argument.toLowerCase(), sourceSha256: createHash('sha256').update(code).digest('hex'),
    finality: 'FINALIZED', execution: 'SUCCESS',
  }, null, 2));
}
