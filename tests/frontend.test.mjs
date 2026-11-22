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
