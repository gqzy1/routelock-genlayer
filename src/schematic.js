const outcomes = {
  READY: ['ready', 'destination', '✓', 'Deposit policy passed · permit available'],
  BLOCKED: ['blocked', 'network', '×', 'Blocked at the deposit gate · no permit'],
  CONSUMED: ['consumed', 'destination', '✓', 'Permit used · test ledger credited'],
  EXPIRED: ['expired', 'destination', '◷', 'Permit expired at the gate · no payout'],
};

export function schematicState(record, phase, checking) {
  const status = record?.status;
  if (phase >= 2 && status) {
    if (status === 'REVIEW') {
      return record.evidence?.identity === 'UNKNOWN'
        ? ['review', 'asset', '?', 'Paused at asset identity · evidence required']
        : ['review', 'network', '?', 'Paused at deposit policy · evidence required'];
    }
    if (outcomes[status]) return outcomes[status];
  }
  if (phase === 1) return ['checking', 'asset', '', 'Checking route evidence'];
  if (checking) return ['checking', 'origin', '', 'Starting the route check'];
  return ['idle', 'origin', '', 'Select an asset or run a route check'];
}
