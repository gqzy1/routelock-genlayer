import test from 'node:test';
import assert from 'node:assert/strict';
import { abi } from 'genlayer-js';
import { executionStatus, verifyCall } from '../src/receipts.js';
import { toUnits } from '../src/routes.js';

test('amount parsing uses exact micro-USDC arithmetic', () => {
  assert.equal(toUnits('250.123456'), 250123456n);
  assert.throws(() => toUnits('0'));
  assert.throws(() => toUnits('250.1234567'));
  assert.throws(() => toUnits('1000000.000001'));
});

test('execution decoding distinguishes unknown, failure and success', () => {
  assert.equal(executionStatus({ txExecutionResult: 0 }), 'UNKNOWN');
  assert.equal(executionStatus({ txExecutionResult: 1 }), 'SUCCESS');
  assert.equal(executionStatus({ consensus_data: { leader_receipt: [{ execution_result: 'ERROR' }] } }), 'FAILURE');
});

test('a receipt from the same sender is rejected if calldata differs', () => {
  const task = { hash: '0x123', deployment: '0xaa', signer: '0xbb', action: 'consume',
    owner: '0xcc', key: 'demo-1', permit: 'ab' };
  const base64 = Buffer.from(abi.calldata.encode({ method: 'consume', args: ['0xcc', 'demo-1', 'ab'] })).toString('base64');
  const receipt = { hash: task.hash, to_address: task.deployment, from_address: task.signer, data: { calldata: { base64 } } };
  assert.doesNotThrow(() => verifyCall(receipt, task));
  assert.throws(() => verifyCall(receipt, { ...task, permit: 'cd' }), /signed call/);
});


test('validator idleness does not replace the leader execution result', () => {
  const receipt = { consensus_data: { leader_receipt: [
    { mode: 'leader', execution_result: 'SUCCESS' },
    { mode: 'validator', vote: 'idle', execution_result: 'ERROR' },
  ] } };
  assert.equal(executionStatus(receipt), 'SUCCESS');
  assert.equal(executionStatus({ consensus_data: { leader_receipt: [receipt.consensus_data.leader_receipt[1]] } }), 'UNKNOWN');
});

test('the route schematic branches on the verdict and evidence checkpoint', async () => {
  const { schematicState } = await import('../src/schematic.js');
  const states = ['READY', 'BLOCKED', 'CONSUMED', 'EXPIRED'].map(status => schematicState({ status }, 3, false));
  assert.deepEqual(states.map(state => state[0]), ['ready', 'blocked', 'consumed', 'expired']);
  assert.deepEqual(states.map(state => state[1]), ['destination', 'network', 'destination', 'destination']);
  assert.equal(schematicState({ status: 'REVIEW', evidence: { identity: 'UNKNOWN' } }, 3, false)[1], 'asset');
  assert.equal(schematicState({ status: 'REVIEW', evidence: { identity: 'MATCH' } }, 3, false)[1], 'network');
  assert.equal(schematicState({ status: 'BLOCKED' }, 1, false)[0], 'checking');
});

test('published cases require the current verified deployment and exact finalized state', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const historical = await readFile(new URL('../evidence/routes-routelock-1.json', import.meta.url));
  assert.equal(createHash('sha256').update(historical).digest('hex'),
    '5e2cd830c11014e9fa8411f51278f19378be378a8c5c658009d36f19a008f51d');
  const old = JSON.parse(historical);
  const { liveRecords, matchesPublishedRecord, releaseAddress, PROTOCOL, routes } = await import('../src/routes.js');
  const hash = '0x' + '1'.repeat(64);
  const address = '0x' + '2'.repeat(40);
  const release = { chainId: 61999, protocol: PROTOCOL, address, deploymentTx: hash,
    sourceSha256: 'a'.repeat(64), status: 'verified', finality: 'FINALIZED', execution: 'SUCCESS' };
  const record = { protocol: PROTOCOL, deployment: address, revision: 1, status: 'READY',
    token: routes.native.address, chain: routes.native.chain,
    evidence: { sha: 'expected', asset: routes.native.address, chain: routes.native.chain, operation: 'deposit' } };
  const published = { ...record, title: 'Native deposit', transactions: { Assessment: hash } };
  assert.equal(releaseAddress({ ...release, execution: 'FAILURE' }), '');
  assert.deepEqual(liveRecords(release, old), []);
  assert.deepEqual(liveRecords(release, { ...release, records: old.records }), []);
  assert.deepEqual(liveRecords(release, { ...release, records: [published] }), [published]);
  assert(matchesPublishedRecord(record, published));
  assert(!matchesPublishedRecord(record, { ...published, status: 'CONSUMED' }));
  assert(!matchesPublishedRecord(record, { ...published, evidence: { ...record.evidence, sha: 'tampered' } }));
  assert(!matchesPublishedRecord({ ...record, revision: 2 }, published));
});

test('assessment receipts bind the prior revision and cannot be reused for a later check', () => {
  const task = { hash: '0x123', deployment: '0xaa', signer: '0xbb', action: 'assess',
    key: 'ref-1', chain: 42161, token: '0xcc', recipient: '0xdd',
    amount: '100', reviewer: '0xee', expectedRevision: 1 };
  const receipt = { hash: task.hash, to_address: task.deployment, from_address: task.signer,
    txDataDecoded: { callData: new Map([['method', 'assess'], ['args',
      [task.key, task.chain, task.token, task.recipient, 100n, task.reviewer, 30n, 1n]]]) } };
  assert.doesNotThrow(() => verifyCall(receipt, task));
  assert.throws(() => verifyCall(receipt, { ...task, expectedRevision: 2 }), /signed call/);
  assert.throws(() => verifyCall({ ...receipt, hash: undefined }, task), /signed call/);
  assert.throws(() => verifyCall({ ...receipt, to_address: '0xff' }, task), /signed call/);
});
