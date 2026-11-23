import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { readFileSync } from 'node:fs';
import { executionStatus, verifyCall } from '../src/receipts.js';
import { isAddress, isKey, PROTOCOL, routes, STUDIONET_ID } from '../src/routes.js';

const [phase, deployment, owner, key, hash, before, expectedRevision, permit] = process.argv.slice(2);
const outcomes = { native: 'READY', consume: 'CONSUMED', bridged: 'BLOCKED' };
if (!Object.hasOwn(outcomes, phase) || !isAddress(deployment) || !isAddress(owner) || !isKey(key)
    || !/^0x[0-9a-f]{64}$/i.test(hash ?? '') || !/^\d+$/.test(before ?? '')
    || !/^\d+$/.test(expectedRevision ?? '') || (phase === 'consume' && !/^[0-9a-f]{64}$/.test(permit ?? ''))) {
  throw new Error('Usage: node scripts/studionet.mjs <native|consume|bridged> <deployment> <owner> <key> <tx-hash> <ledger-before> <prior-revision> [signed-permit]');
}
const endpoint = 'https://studio.genlayer.com/api';
const client = createClient({ chain: { ...studionet, id: STUDIONET_ID }, endpoint });
if (await client.getChainId() !== STUDIONET_ID) throw new Error('Unexpected Studionet chain ID.');
const read = (functionName, args = []) => client.readContract({
  address: deployment, functionName, args, transactionHashVariant: 'latest-final',
});
const [receipt, rawRecord, protocol, rawCode] = await Promise.all([
  client.getTransaction({ hash }), read('read_intent', [owner, key]), read('protocol'), client.getContractCode(deployment),
]);
const source = readFileSync(new URL('../contracts/routelock.py', import.meta.url));
const chainCode = /^0x[0-9a-f]+$/i.test(rawCode) ? Buffer.from(rawCode.slice(2), 'hex') : Buffer.from(rawCode);
if (protocol !== PROTOCOL || !source.equals(chainCode)) throw new Error('Unexpected contract source or protocol.');
const execution = executionStatus(receipt);
if (receipt.statusName !== 'FINALIZED' || execution !== 'SUCCESS') {
  throw new Error('Observed receipt: ' + receipt.statusName + ' / ' + execution);
}
const record = JSON.parse(rawRecord);
const selected = routes[phase === 'bridged' ? 'bridged' : 'native'];
const outcome = outcomes[phase];
if (record.protocol !== protocol || record.deployment !== deployment.toLowerCase()
    || record.owner !== owner.toLowerCase() || record.key !== key || record.status !== outcome
    || record.chain !== selected.chain || record.token !== selected.address
    || record.revision !== Number(expectedRevision) + 1 || record.evidence?.operation !== 'deposit'
    || record.evidence.chain !== record.chain || record.evidence.asset !== record.token
    || (outcome === 'BLOCKED' ? Boolean(record.permit) : !record.permit)) {
  throw new Error('Unexpected finalized route readback.');
}
const action = phase === 'consume' ? 'consume' : 'assess';
const signer = action === 'consume' ? record.reviewer : record.owner;
if (action === 'consume' && permit !== record.permit) throw new Error('Permit does not match the assessment.');
verifyCall(receipt, { ...record, hash, action, signer, expectedRevision });
const balance = BigInt(await read('demo_received', [record.recipient, BigInt(record.chain)]));
if (balance - BigInt(before) !== (action === 'consume' ? BigInt(record.amount) : 0n)) {
  throw new Error('Unexpected finalized ledger delta.');
}
console.log(JSON.stringify({
  phase, signer, deployment: record.deployment, hash, status: 'FINALIZED', execution,
  balanceBefore: before, balanceAfter: balance.toString(), consensus: receipt.consensus_data?.votes ?? null, record,
}, null, 2));
