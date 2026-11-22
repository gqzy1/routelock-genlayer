export const practiceCases = [
  { id: 'native-ready', title: 'Native deposit', route: 'native', status: 'READY', amount: '250.00', detail: 'Issuer and deposit policy agree.' },
  { id: 'bridge-blocked', title: 'Bridged asset blocked', route: 'bridged', status: 'BLOCKED', amount: '125.00', detail: 'Deposit policy excludes this asset variant.' },
  { id: 'policy-missing', title: 'Missing deposit clause', route: 'native', status: 'REVIEW', amount: '480.00', detail: 'Sample policy only mentions withdrawals.' },
  { id: 'identity-missing', title: 'Asset cannot be confirmed', route: 'bridged', status: 'REVIEW', amount: '94.50', detail: 'Sample issuer evidence does not establish asset identity.' },
  { id: 'permit-expired', title: 'Expired permit', route: 'native', status: 'EXPIRED', amount: '312.75', detail: 'A sample permit passed its 30-minute time limit.' },
  { id: 'permit-used', title: 'Permit already used', route: 'native', status: 'CONSUMED', amount: '600.00', detail: 'A sample ledger credit has already been recorded.' },
];

export const phases = [
  { name: 'Intent locked', detail: 'The route, amount and recipient belong to one intent.' },
  { name: 'Evidence checked', detail: 'Asset identity and deposit permission are checked separately.' },
  { name: 'Decision recorded', detail: 'Only approved routes can yield a usable permit.' },
  { name: 'State read back', detail: 'The resulting state determines which action is available.' },
];
