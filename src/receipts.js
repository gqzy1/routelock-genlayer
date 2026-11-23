import { abi } from 'genlayer-js';

function decodedCall(receipt) {
  if (receipt.txDataDecoded?.callData) return receipt.txDataDecoded.callData;
  const data = receipt.data?.calldata;
  const base64 = typeof data === 'string' ? data : data?.base64;
  if (!base64) return null;
  return abi.calldata.decode(Uint8Array.from(atob(base64), value => value.charCodeAt(0)));
}

export function executionStatus(receipt) {
  const leaders = receipt.consensus_data?.leader_receipt;
  const leader = Array.isArray(leaders)
    ? leaders.findLast(entry => entry.mode === 'leader')
      ?? (leaders.length === 1 && !leaders[0].mode ? leaders[0] : undefined)
    : leaders?.mode === 'validator' ? undefined : leaders;
  const result = String(leader?.execution_result ?? receipt.txExecutionResultName ?? '').toUpperCase();
  if (['SUCCESS', 'FINISHED_WITH_RETURN'].includes(result) || (!result && receipt.txExecutionResult === 1)) return 'SUCCESS';
  if (['ERROR', 'FAILURE', 'FINISHED_WITH_ERROR'].includes(result) || (!result && receipt.txExecutionResult === 2)) return 'FAILURE';
  return 'UNKNOWN';
}

export function verifyCall(receipt, task) {
  const landed = receipt.hash ?? receipt.txId;
  const target = receipt.to_address ?? receipt.recipient;
  const sender = receipt.from_address ?? receipt.sender;
  const call = decodedCall(receipt);
  const method = call instanceof Map ? call.get('method') : call?.method;
  const args = call instanceof Map ? call.get('args') : call?.args;
  const expected = task.action === 'assess'
    ? [task.key, task.chain, task.token, task.recipient, task.amount, task.reviewer, 30, task.expectedRevision]
    : [task.owner, task.key, task.permit];
  if (landed?.toLowerCase() !== task.hash.toLowerCase()
    || target?.toLowerCase() !== task.deployment || sender?.toLowerCase() !== task.signer
    || method !== task.action || !Array.isArray(args) || args.length !== expected.length
    || !expected.every((value, index) => String(value).toLowerCase() === String(args[index]).toLowerCase())) {
    throw new Error('Receipt transaction does not match the signed call.');
  }
}
