import './style.css';
import { getAddress } from 'viem';
import { CHAIN, RPC, explorer, finalized, read, signer, verifyDeployment } from './chain.js';
import { practiceCases, phases } from './cases.js';
import { verifyCall } from './receipts.js';
import { KRAKEN, isAddress, isKey, routes, toUnits } from './routes.js';

const $ = id => document.getElementById(id);
const addressPattern = /^0x[\da-f]{64}$/i;
const storageKey = 'routelock-pending-v1';
let route = 'native';
let mode = 'demo';
let stop = 'identity';
let account = '';
let provider;
let record;
let busy = false;
let pending = readPending();
let stepCount = 1;
let viewedPhase = 0;
let selectedCase = practiceCases[0];
let animation;
let animating = false;
let renderedCaseMode;
const release = Object.values(import.meta.glob('../deployment.json', { eager: true, import: 'default' }))[0];
const liveEvidence = Object.values(import.meta.glob('../evidence/routes.json', { eager: true, import: 'default' }))[0];
const discovered = new Map();

function readPending() {
  try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; }
}

function savePending(value) {
  pending = value;
  if (value) localStorage.setItem(storageKey, JSON.stringify(value));
  else localStorage.removeItem(storageKey);
}

function say(message, steps = stepCount) {
  $('status').textContent = message;
  stepCount = steps;
  showPhase(Math.max(0, stepCount - 1));
}

function showPhase(index) {
  viewedPhase = index;
  [...$('steps').children].forEach((node, position) => {
    node.classList.toggle('done', position < stepCount);
    const control = node.firstElementChild;
    control.disabled = position >= stepCount;
    control.setAttribute('aria-current', position === viewedPhase ? 'step' : 'false');
  });
  const phase = phases[viewedPhase];
  const detail = index === 1 && record?.evidence
    ? record.evidence.policy_quote || 'The policy returned no explicit decision.'
    : index >= 2 && record
      ? (mode === 'demo' ? selectedCase?.detail : 'Finalized state: ' + record.status)
      : phase.detail;
  $('phase-detail').textContent = phase.name + ' · ' + (detail ?? phase.detail);
  document.querySelector('.workspace').dataset.phase = String(viewedPhase);
  $('map').dataset.phase = String(viewedPhase);
}

function renderCases() {
  const cards = mode === 'demo' ? practiceCases : liveEvidence?.records ?? [];
  $('case-heading').textContent = mode === 'demo' ? 'Practice scenarios' : 'Verified Studionet intents';
  $('case-count').textContent = cards.length ? cards.length + ' CASES' : 'Awaiting live evidence';
  if (renderedCaseMode !== mode) {
    renderedCaseMode = mode;
    $('cases').replaceChildren(...cards.map(item => {
      const element = button(item.title, () => {
        if (busy) return;
        if (mode === 'demo') {
          stopAnimation();
          selectedCase = item;
          route = item.route;
          stop = 'identity';
          record = undefined;
          $('amount').value = item.amount;
          $('recipient').value = '0x0000000000000000000000000000000000000123';
          playPractice();
        } else {
          $('owner').value = item.owner;
          $('key').value = item.key;
          run(lookup);
        }
      });
      element.className = 'case-card';
      const state = document.createElement('small');
      state.textContent = item.status.replaceAll('_', ' ');
      element.append(state);
      return element;
    }));
  }
  [...$('cases').children].forEach((element, index) => {
    const item = cards[index];
    const matched = mode === 'demo' ? item.id === selectedCase?.id : item.key === record?.key && item.owner === record?.owner;
    element.setAttribute('aria-pressed', matched);
  });
}


function currentRoute() { return routes[route]; }
function selectedContract() { return $('contract').value.trim().toLowerCase(); }
function selectedKey() { return $('key').value.trim(); }

function render() {
  const selected = currentRoute();
  $('demo-tab').setAttribute('aria-pressed', mode === 'demo');
  $('live-tab').setAttribute('aria-pressed', mode === 'live');
  $('live-fields').hidden = mode === 'demo';
  $('mode-note').textContent = mode === 'demo'
    ? 'Practice uses sample evidence. Real assets stay untouched.'
    : 'Intent details are public. Use test addresses only. Payouts update a demo ledger.';
  $('native').setAttribute('aria-pressed', route === 'native');
  $('bridged').setAttribute('aria-pressed', route === 'bridged');
  for (const line of document.querySelectorAll('.route-line')) {
    line.classList.toggle('active', line.dataset.route === route);
    for (const button of line.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', line.dataset.route === route && button.dataset.stop === stop);
    }
  }
  $('chain-label').textContent = selected.network + ' → Kraken';
  $('issuer-link').href = selected.issuer;
  $('exchange-link').href = KRAKEN;
  $('issuer-note').textContent = record?.evidence?.issuer_quote ?? 'Official asset reference';
  $('exchange-note').textContent = record?.evidence?.policy_quote || (mode === 'demo' ? selected.summary : 'Public deposit rules');
  const stations = {
    identity: ['Issuer contract', selected.address],
    network: ['Sending network', selected.network + ' · EVM chain ' + selected.chain],
    policy: ['Receiving platform', 'Kraken · deposit policy'],
  };
  const [name, detail] = stations[stop];
  const strong = document.createElement('strong');
  strong.textContent = name;
  const description = document.createElement('span');
  description.textContent = detail;
  $('station').replaceChildren(strong, description);
  const states = {
    READY: ['Permit issued', 'A designated reviewer may consume this permit once.'],
    BLOCKED: ['Route blocked', 'The public deposit policy excludes this route.'],
    REVIEW: ['Review needed', 'The sources did not establish a supported route.'],
    CONSUMED: ['Permit consumed', 'The single-use permit has credited the demo ledger.'],
    EXPIRED: ['Permit expired', 'The time limit has passed. A fresh assessment is required.'],
  };
  const [title, note] = states[record?.status] ?? ['Awaiting route check', 'Check a route to see its decision and evidence.'];
  $('verdict').className = 'verdict ' + (record?.status || 'idle').toLowerCase();
  const label = document.createElement('small');
  label.textContent = mode === 'demo' ? 'PRACTICE VERDICT' : 'FINALIZED VERDICT';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = mode === 'demo' && record?.status === selectedCase?.status ? selectedCase.detail : note;
  $('verdict').replaceChildren(label, heading, paragraph);
  if (record?.expires) {
    const expiry = document.createElement('p');
    expiry.textContent = 'Expires ' + new Date(record.expires * 1000).toLocaleString();
    $('verdict').append(expiry);
  }
  $('consume').hidden = record?.status !== 'READY' || (mode === 'live' && account !== record.reviewer);
  $('consume').textContent = mode === 'demo' ? 'Try permit consumption' : 'Consume permit on Studionet';
  $('consume').disabled = busy || (mode === 'live' && Boolean(pending));
  $('check').disabled = busy || animating || (mode === 'live' && Boolean(pending));
  $('lookup').disabled = busy;
  $('share').hidden = mode === 'demo' || !record?.owner;
  $('connect').textContent = account ? account.slice(0, 6) + '…' + account.slice(-4) : 'Connect wallet';
  renderCases();
}

function selectRoute(next, nextStop = 'identity') {
  if (next !== route) {
    stopAnimation();
    selectedCase = practiceCases.find(item => item.route === next);
    record = undefined;
    say('Route changed. Run a new check.', 1);
  }
  route = next;
  stop = nextStop;
  render();
}

function changeMode(next) {
  if (busy || mode === next) return;
  stopAnimation();
  mode = next;
  record = undefined;
  say(next === 'live' ? 'Enter a verified deployment or open a shared intent.' : 'Explore the practice routes.', 1);
  render();
  receiptControls();
}

function button(label, action) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'secondary';
  element.textContent = label;
  element.addEventListener('click', action);
  return element;
}

function walletChoices() {
  const choices = $('providers');
  const injected = window.ethereum?.providers ?? [window.ethereum].filter(Boolean);
  for (const item of [window.okxwallet, ...injected].filter(Boolean)) {
    if ([...discovered.values()].includes(item)) continue;
    const name = item.isOkxWallet || item === window.okxwallet ? 'OKX Wallet' : item.isMetaMask ? 'MetaMask' : 'Browser wallet';
    discovered.set(name, item);
  }
  choices.replaceChildren(...[...discovered].map(([name, item]) => button(name, () => run(() => connect(item)))));
  if (!discovered.size) choices.textContent = 'Open in a browser with OKX Wallet or MetaMask.';
}

async function connect(item) {
  const accounts = await item.request({ method: 'eth_requestAccounts' });
  if (!isAddress(accounts[0] ?? '')) throw new Error('Wallet did not return an account.');
  provider = item;
  account = accounts[0].toLowerCase();
  $('providers').hidden = true;
  item.on?.('accountsChanged', addresses => {
    if (item !== provider) return;
    account = addresses[0]?.toLowerCase() ?? '';
    render();
  });
  say('Wallet connected. Transactions use Stable Studionet.');
}

async function ensureNetwork() {
  if (!provider || !account) throw new Error('Connect OKX Wallet or MetaMask first.');
  if (await provider.request({ method: 'eth_chainId' }) === CHAIN) return;
  const params = [{ chainId: CHAIN }];
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params });
  } catch (error) {
    if (error.code !== 4902 && error.data?.originalError?.code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: CHAIN, chainName: 'GenLayer Stable Studionet', rpcUrls: [RPC],
      nativeCurrency: { name: 'GenLayer', symbol: 'GEN', decimals: 18 }, blockExplorerUrls: [explorer],
    }] });
    if (await provider.request({ method: 'eth_chainId' }) !== CHAIN) {
      await provider.request({ method: 'wallet_switchEthereumChain', params });
    }
  }
  if (await provider.request({ method: 'eth_chainId' }) !== CHAIN) throw new Error('Wallet network did not switch to Studionet.');
}

async function readRecord(deployment, owner, key) {
  const raw = await read(deployment, 'read_intent', [owner, key]);
  if (!raw) throw new Error('No finalized intent at that reference.');
  const result = JSON.parse(raw);
  if (result.deployment !== deployment || result.owner !== owner || result.key !== key) {
    throw new Error('Finalized record does not match the selected intent.');
  }
  if (!Object.values(routes).some(item => item.chain === result.chain && item.address === result.token)) {
    throw new Error('The record does not describe a supported route.');
  }
  return result;
}

function present(result) {
  record = result;
  route = result.chain === routes.native.chain ? 'native' : 'bridged';
  $('owner').value = result.owner;
  $('key').value = result.key;
  $('contract').value = result.deployment;
  $('recipient').value = result.recipient;
  const units = BigInt(result.amount);
  $('amount').value = (units / 1000000n).toString() + '.' + (units % 1000000n).toString().padStart(6, '0');
  $('reviewer').value = result.reviewer;
}

async function resume() {
  const task = pending;
  if (!task?.hash) throw new Error('No submitted transaction hash is available.');
  say('Transaction submitted. Waiting for FINALIZED…', 2);
  const { receipt, execution } = await finalized(task.hash);
  say('Finalized. Confirming execution and reading state…', 3);
  verifyCall(receipt, task);
  if (execution === 'UNKNOWN') throw new Error('Receipt does not yet expose a conclusive execution result.');
  if (execution === 'FAILURE') {
    recoverableHash = task.hash;
    savePending(null);
    throw new Error('Finalized with an execution failure. Inspect the transaction in Explorer.');
  }
  const result = await readRecord(task.deployment, task.owner, task.key);
  if (result.chain !== task.chain || result.token !== task.token || result.recipient !== task.recipient
    || result.amount !== task.amount || result.reviewer !== task.reviewer
    || (task.action === 'consume' && result.status !== 'CONSUMED')) {
    throw new Error('Finalized state does not match the submitted intent.');
  }
  if (task.action === 'consume') {
    const total = await read(task.deployment, 'demo_received', [result.recipient, BigInt(result.chain)]);
    if (BigInt(total) < BigInt(result.amount)) throw new Error('Demo ledger readback is incomplete.');
  }
  present(result);
  recoverableHash = task.hash;
  savePending(null);
  say('FINALIZED · SUCCESS · matching state readback.', 4);
}

async function write(task, args) {
  await ensureNetwork();
  if (task.signer !== account) throw new Error('The wallet account changed. Check the intent and try again.');
  await verifyDeployment(task.deployment);
  if (task.signer !== account) throw new Error('The wallet account changed before signing.');
  say('Review and sign the zero-value Studionet call in your wallet.', 1);
  recoverableHash = '';
  savePending(task);
  try {
    const hash = await signer(provider, task.signer).writeContract({
      address: getAddress(task.deployment), functionName: task.action, args, value: 0n, leaderOnly: false,
    });
    if (!addressPattern.test(hash)) throw new Error('Wallet did not return a valid transaction hash.');
    recoverableHash = hash;
    savePending({ ...task, hash });
  } catch (error) {
    if (error.code === 4001 || error.cause?.code === 4001) savePending(null);
    throw error;
  }
  await resume();
}

function stopAnimation() {
  clearTimeout(animation);
  animating = false;
  $('map').classList.remove('checking');
}

function playPractice() {
  stopAnimation();
  animating = true;
  record = undefined;
  $('map').classList.add('checking');
  let phase = 0;
  const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
  function advance() {
    if (phase === phases.length - 1) {
      record = { status: selectedCase?.status ?? currentRoute().practice };
      stopAnimation();
      say('Practice complete · sample decision shown.', 4);
      render();
      return;
    }
    say('Practice · ' + phases[phase].name, phase + 1);
    phase += 1;
    animation = setTimeout(advance, delay);
  }
  render();
  advance();
}

async function check() {
  const amount = toUnits($('amount').value.trim());
  const recipient = $('recipient').value.trim().toLowerCase();
  if (!isAddress(recipient)) throw new Error('Enter a valid test recipient address.');
  const selected = currentRoute();
  if (mode === 'demo') return playPractice();
  const deployment = selectedContract();
  const reviewer = $('reviewer').value.trim().toLowerCase();
  const key = selectedKey();
  if (!isAddress(deployment) || !isKey(key)) throw new Error('Enter a deployment and a 3–40 character reference.');
  if (!isAddress(reviewer) || reviewer === account) throw new Error('Enter a reviewer address different from the sender.');
  return write({ action: 'assess', deployment, owner: account, signer: account, key, chain: selected.chain,
    token: selected.address, recipient, amount: amount.toString(), reviewer },
  [key, BigInt(selected.chain), selected.address, recipient, amount, reviewer, 30n]);
}

async function consume() {
  if (mode === 'demo') {
    record = { status: 'CONSUMED' };
    say('Practice permit consumed in this session.', 4);
    return;
  }
  if (!record || account !== record.reviewer) throw new Error('Connect the designated reviewer wallet.');
  const { deployment, owner, key, chain, token, recipient, amount, reviewer, permit } = record;
  return write({ action: 'consume', deployment, owner, key, chain, token, recipient, amount, reviewer, permit, signer: account },
    [owner, key, permit]);
}

async function lookup() {
  const deployment = selectedContract();
  const owner = $('owner').value.trim().toLowerCase();
  const key = selectedKey();
  if (!isAddress(deployment) || !isAddress(owner) || !isKey(key)) throw new Error('Enter deployment, owner and intent reference.');
  await verifyDeployment(deployment);
  present(await readRecord(deployment, owner, key));
  say('Read back from finalized contract state.', 4);
}

let recoverableHash = '';
function receiptControls() {
  const area = $('receipt-controls');
  area.replaceChildren();
  if (mode !== 'live') return;
  function addLink(hash, label = 'Explorer') {
    const link = document.createElement('a');
    link.href = explorer + '/transactions/' + hash;
    link.textContent = label + ' ↗';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    area.append(link);
  }
  if (pending?.hash) {
    area.append(button('Resume receipt', () => run(resume)));
    addLink(pending.hash);
  } else if (pending) {
    const input = document.createElement('input');
    input.placeholder = 'Transaction hash';
    input.setAttribute('aria-label', 'Recover transaction hash');
    area.append(input, button('Recover', () => run(async () => {
      const hash = input.value.trim();
      if (!addressPattern.test(hash)) throw new Error('Enter the transaction hash from wallet activity.');
      savePending({ ...pending, hash });
      recoverableHash = hash;
      await resume();
    })), button('Check state', () => run(async () => {
      const task = pending;
      const raw = await read(task.deployment, 'read_intent', [task.owner, task.key]);
      if (raw) {
        const result = await readRecord(task.deployment, task.owner, task.key);
        if (task.action === 'assess' || result.status === 'CONSUMED') {
          present(result);
          say('State exists. Enter the wallet transaction hash to verify execution.', 3);
          return;
        }
      }
      say('No matching finalized change yet. Check wallet activity before submitting again.', 1);
    })));
  } else if (recoverableHash) addLink(recoverableHash);
  const published = liveEvidence?.records.find(item => item.owner === record?.owner && item.key === record?.key && item.deployment === record?.deployment);
  if (published) {
    for (const [label, hash] of Object.entries(published.transactions)) {
      if (hash !== recoverableHash) addLink(hash, label);
    }
  }
}

async function run(action) {
  if (busy) return;
  busy = true;
  render();
  try { await action(); }
  catch (error) { say(error.shortMessage || error.message || 'The operation could not be completed.'); }
  finally { busy = false; render(); receiptControls(); }
}

$('demo-tab').onclick = () => changeMode('demo');
$('live-tab').onclick = () => changeMode('live');
$('native').onclick = () => !busy && selectRoute('native');
$('bridged').onclick = () => !busy && selectRoute('bridged');
$('map').onclick = event => {
  const selected = event.target.closest('button[data-stop]');
  if (selected && !busy) selectRoute(selected.closest('[data-route]').dataset.route, selected.dataset.stop);
};
$('connect').onclick = () => { walletChoices(); $('providers').hidden = !$('providers').hidden; };
$('check').onclick = () => run(check);
$('consume').onclick = () => run(consume);
$('lookup').onclick = () => run(lookup);
$('share').onclick = () => run(async () => {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ contract: record.deployment, owner: record.owner, key: record.key });
  await navigator.clipboard.writeText(url);
  say('Read-only intent link copied.');
});
[...$('steps').children].forEach((node, index) => node.firstElementChild.onclick = () => showPhase(index));
if (release) $('contract').value = release.address.toLowerCase();
for (const id of ['amount', 'recipient', 'contract', 'key', 'owner', 'reviewer']) {
  $(id).addEventListener('input', () => { stopAnimation(); record = undefined; say('Intent edited. Run a new check.', 1); render(); });
}
window.addEventListener('eip6963:announceProvider', event => {
  const { info, provider: item } = event.detail;
  discovered.set(info.name, item);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
$('key').value = 'route-' + crypto.randomUUID().slice(0, 8);
const params = new URLSearchParams(location.search);
if (params.has('contract') && params.has('owner') && params.has('key')) {
  changeMode('live');
  $('contract').value = params.get('contract');
  $('owner').value = params.get('owner');
  $('key').value = params.get('key');
  run(lookup);
} else if (pending) {
  changeMode('live');
  say('A submitted intent is awaiting receipt verification.', 2);
}
render();
showPhase(viewedPhase);
receiptControls();
