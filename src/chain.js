import { getAddress } from 'viem';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { executionStatus } from './receipts.js';
import source from '../contracts/routelock.py?raw';

export const RPC = 'https://studio.genlayer.com/api';
export const CHAIN = '0xf22f';
export const protocol = 'routelock/1';
const chain = { ...studionet, id: 61999, rpcUrls: { default: { http: [RPC] } } };
export const readonly = createClient({ chain, endpoint: RPC });
export const explorer = 'https://explorer-studio.genlayer.com';

export function signer(provider, account) {
  return createClient({ chain, endpoint: RPC, provider, account });
}

export function read(address, functionName, args = []) {
  return readonly.readContract({ address: getAddress(address), functionName, args, transactionHashVariant: 'latest-final' });
}

export async function verifyDeployment(address) {
  const [code, version] = await Promise.all([readonly.getContractCode(getAddress(address)), read(address, 'protocol')]);
  const decoded = /^0x[\da-f]+$/i.test(code)
    ? new TextDecoder().decode(Uint8Array.from(code.slice(2).match(/../g), byte => parseInt(byte, 16)))
    : code;
  if (decoded !== source || version !== protocol) throw new Error('Deployment source or protocol does not match RouteLock.');
}

export async function finalized(hash) {
  const receipt = await readonly.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 3500, retries: 42, fullTransaction: true });
  if (receipt.statusName !== 'FINALIZED' && receipt.status !== 'FINALIZED' && receipt.status !== 7) {
    throw new Error('Receipt has not reached FINALIZED.');
  }
  return { receipt, execution: executionStatus(receipt) };
}
