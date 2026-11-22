import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { readFileSync, writeFileSync } from 'node:fs';
import { executionStatus, verifyCall } from '../src/receipts.js';
import { routes } from '../src/routes.js';

const deployment = JSON.parse(readFileSync(new URL('../deployment.json', import.meta.url)));
const contract = deployment.address.toLowerCase();
const phase = process.argv[2];
const keyDirectory = process.env.ROUTELOCK_TEST_ACCOUNTS;
if (!keyDirectory || !['native', 'consume', 'bridged'].includes(phase)) {
  throw new Error('Select native, consume or bridged and supply the disposable account directory.');
}
const a = createAccount(readFileSync(keyDirectory + '/a', 'utf8').trim());
const b = createAccount(readFileSync(keyDirectory + '/b', 'utf8').trim());
const owner = a.address.toLowerCase();
const reviewer = b.address.toLowerCase();
const recipient = '0x0000000000000000000000000000000000000123';
const client = createClient({ chain: studionet });
const read = (functionName, args) => client.readContract({
  address: deployment.address, functionName, args, transactionHashVariant: 'latest-final',
});
const selected = routes[phase === 'bridged' ? 'bridged' : 'native'];
const key = phase === 'bridged' ? 'avax-bridged-check' : 'arbitrum-native-check';
const amount = phase === 'bridged' ? 125000000n : 250000000n;
const ledgerArgs = [recipient, BigInt(selected.chain)];
const balanceBefore = BigInt(await read('demo_received', ledgerArgs));
const signer = phase === 'consume' ? b : a;
const action = phase === 'consume' ? 'consume' : 'assess';
const journal = keyDirectory + '/' + phase + '.json';
let checkpoint;
try { checkpoint = JSON.parse(readFileSync(journal)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (checkpoint && !checkpoint.hash) throw new Error('An unresolved send was recorded. Recover its hash before making another write.');
let args;
let permit;
if (phase === 'consume') {
  const raw = await read('read_intent', [owner, key]);
  if (!raw) throw new Error('The native assessment is missing.');
  const existing = JSON.parse(raw);
  if (!checkpoint && (existing.status !== 'READY' || !existing.permit)) throw new Error('The native assessment did not issue a permit.');
  permit = existing.permit;
  args = [owner, key, permit];
} else {
  args = [key, BigInt(selected.chain), selected.address, recipient, amount, reviewer, 30n];
}
if (!checkpoint) {
  checkpoint = { phase, balanceBefore: balanceBefore.toString(), signer: signer.address, deployment: contract };
  writeFileSync(journal, JSON.stringify(checkpoint), { flag: 'wx', mode: 0o600 });
  checkpoint.hash = await createClient({ chain: studionet, account: signer }).writeContract({
    address: deployment.address, functionName: action, args, value: 0n, leaderOnly: false,
  });
  writeFileSync(journal, JSON.stringify(checkpoint));
}
console.log(phase, 'submitted', checkpoint.hash);
const receipt = await client.waitForTransactionReceipt({
  hash: checkpoint.hash, status: TransactionStatus.FINALIZED, interval: 6000, retries: 70, fullTransaction: true,
});
const execution = executionStatus(receipt);
checkpoint.status = 'FINALIZED';
checkpoint.execution = execution;
checkpoint.consensus = receipt.consensus_data?.votes ?? receipt.resultName ?? null;
writeFileSync(journal, JSON.stringify(checkpoint, null, 2) + '\n');
if (execution !== 'SUCCESS') {
  const leader = receipt.consensus_data?.leader_receipt;
  console.log('Leader result', JSON.stringify((Array.isArray(leader) ? leader.findLast(entry => entry.mode === 'leader') : leader)?.result));
  throw new Error(phase + ': finalized execution was ' + execution);
}
verifyCall(receipt, { ...checkpoint, signer: signer.address.toLowerCase(), action, key,
  owner, reviewer, permit, chain: selected.chain, token: selected.address, recipient, amount: amount.toString() });
const record = JSON.parse(await read('read_intent', [owner, key]));
const balance = BigInt(await read('demo_received', ledgerArgs));
const expected = { native: 'READY', consume: 'CONSUMED', bridged: 'BLOCKED' }[phase];
if (record.status !== expected || record.owner !== owner || record.reviewer !== reviewer ||
    record.chain !== selected.chain || record.token !== selected.address ||
    record.recipient !== recipient || record.amount !== amount.toString() ||
    (expected === 'BLOCKED' ? Boolean(record.permit) : !record.permit) ||
    balance - BigInt(checkpoint.balanceBefore) !== (phase === 'consume' ? amount : 0n)) {
  console.log('Observed state', record.status, 'balance', balance.toString());
  throw new Error('Finalized state did not match the acceptance case.');
}
checkpoint.record = record;
checkpoint.balanceAfter = balance.toString();
writeFileSync(journal, JSON.stringify(checkpoint, null, 2) + '\n');
console.log(phase, 'FINALIZED SUCCESS', record.status, 'ledger', balance.toString());
