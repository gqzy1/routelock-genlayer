# RouteLock

[Open RouteLock](https://gqzy1.github.io/routelock-genlayer/)

[Studionet contract](https://explorer-studio.genlayer.com/address/0xCF045D20fD5373276A8D8Fb14298661070b453E9) · [Acceptance evidence](evidence/routes.json)

RouteLock is a stablecoin deposit preflight desk. A sender checks a specific asset, network and destination policy. GenLayer records the agreed assessment, and a separate reviewer can use an unexpired permit once to credit a demo payout ledger.

| Route | Asset evidence | Deposit policy |
| --- | --- | --- |
| Arbitrum One / native USDC | [Circle contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses) | [Kraken native USDC support](https://support.kraken.com/au/articles/native-usd-coin) |
| Avalanche C-Chain / bridged USDC.e | [Circle bridge identity note](https://help.circle.com/support/en/usdc-on-avalanche-vs-usdc-e?id=kb_article_view&sysparm_article=KB0010587) | [Kraken native USDC support](https://support.kraken.com/au/articles/native-usd-coin) |

## Open the workbench

```sh
npm ci
npm run dev
npm test
npm run build
npm run deploy -- --schema
```

Requires Node.js 22.13+ and Python 3. `npm run deploy -- --schema` asks the official Stable Studionet RPC to compile the canonical source and return its schema without deploying or signing. The static site uses relative asset URLs and supports GitHub Pages repository paths. The Pages workflow expects GitHub Actions as the repository's Pages source.

**Practice** shows six labeled examples. Select a scenario to replay the route and use the timeline to revisit its phases. **Studionet** defaults to the deployment in `deployment.json`. Select a verified intent to read its finalized state without a wallet and open its transaction receipts. Use a connected wallet to assess a new intent.

For a separate deployment, deploy `contracts/routelock.py` in GenLayer Studio on Stable Studionet. Pass its transaction hash to `npm run deploy -- <hash>` in a checkout without a deployment manifest to verify the source, execution and protocol. The deploy script also supports supplying a disposable Studionet signing key through the shell environment.

## Complete a signed preflight

1. Choose Studionet and connect an OKX Wallet or MetaMask signer. Enter the deployed contract, a test recipient and a separate reviewer wallet. The intent fields are public.
2. Select native USDC on Arbitrum or USDC.e on Avalanche and sign a zero-value assessment. RouteLock checks the deployment bytes before signing.
3. Wait for `FINALIZED`, successful execution and matching finalized state. The app persists a pending hash. Use **Resume receipt** after reload or timeout to continue reading that hash. If no hash was returned, recover it from wallet activity.
4. Open the shared intent on the reviewer wallet. For a READY route, consume its permit within 30 minutes. The demo balance is isolated by recipient and source network.
5. Assess the blocked route under a fresh intent reference. It cannot reach the ledger, including through a direct contract call.

## Consensus and state

`assess` freezes sender, reviewer, route, recipient, amount and expiry. The contract restricts use to two pinned token addresses and calls fixed official evidence URLs. The leader and validators independently render the relevant Circle page and the Kraken article. Contract code extracts asset evidence. A model classifies the bounded Kraken article for the exact **deposit** operation and returns an exact grounded quotation for positive or negative decisions. The validator repeats both reads and the policy classification and compares identity, policy status, exact asset, sources and the digest of the relevant policy text. Drift or disagreement cannot publish the leader's record. A matching asset with an explicit allow clause yields READY. An explicit exclusion yields BLOCKED. Missing identity or insufficient policy evidence yields REVIEW.

`consume` is available to the named reviewer, checks the original digest and expiry, and credits the demo ledger once. Its arguments cannot replace the recipient, token or amount. `read_intent` and `demo_received` expose finalized state for other clients.

This application evaluates public deposit policy at assessment time. Account-specific eligibility, address ownership and changes after observation remain outside its scope. The contract moves no USDC and connects to no exchange account. The local tests cover the state machine and receipt matching with fixtures.

## Verified Studionet cases

The evidence file preserves the deployment, a native assessment that issued a READY permit, a separate reviewer's consumption that increased the test ledger by 250,000,000 units, and a bridged assessment that returned BLOCKED with no permit and zero balance. All four transactions reached FINALIZED with successful leader execution. The bridged receipt includes an idle validator entry, which is retained separately from the successful leader record. The two write roles in this run used disposable SDK signers. The live web views read the same deployments and intents.

MIT licensed.
