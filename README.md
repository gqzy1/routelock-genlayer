# RouteLock

[Open RouteLock](https://gqzy1.github.io/routelock-genlayer/)

RouteLock checks public Kraken deposit policy for a specific asset and network. GenLayer records the agreed result. A designated reviewer can use a READY permit once to credit a simulated USDC ledger. The ledger tracks six-decimal units by test recipient and source network. RouteLock transfers no real USDC and needs no exchange account.

| Deposit route | Contract address | Reviewed Kraken policy |
| --- | --- | --- |
| Arbitrum One · native USDC | `0xaf88d065e77c8cc2239327c5edb3a432268e5831` | Public deposits supported |
| Avalanche C-Chain · bridged USDC.e | `0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664` | Public deposits unsupported |

[Policy sources and release evidence](evidence/routes.json)

## Policy and consensus

The [Kraken asset article](https://support.kraken.com/articles/native-usd-coin) documents support for Arbitrum native USDC and excludes Avalanche USDC.e. The [USDC.e sunset notice](https://support.kraken.com/ca/articles/usdce-support-ending-arbitrum-optimism-polygon) applies to the bridged assets on Arbitrum, Optimism and Polygon. It ends deposits on November 16, 2026 and withdrawals on December 14, 2026, while confirming continued native support. The [Circle registry](https://developers.circle.com/stablecoins/usdc-contract-addresses) and [Avalanche identity note](https://help.circle.com/support/en/usdc-on-avalanche-vs-usdc-e?id=kb_article_view&sysparm_article=KB0010587) establish asset identity. The contract evaluates deposits for the two routes in the table.

The leader and each validator independently render the route-specific Circle page and both Kraken articles. Contract logic checks the reviewed article body hashes, identifies the token, and applies policy by asset, network, operation and date. The model can confirm the resulting decision or defer to REVIEW. Each validator compares the complete structured result, including the exact token and chain, operation, source observations, policy disposition and date evidence. An explicit start date is recorded when the source provides one. An already-in-force statement records the latest verified bound on its start. A source that cannot be verified, a body change, or ambiguous policy yields REVIEW when the observations agree. Validators with different observations reject the proposed result.

The sender can reassess an unconsumed intent with the same fields and its current revision. A successful reassessment invalidates its previous permit. The named reviewer needs the current permit, matching revision and an unexpired assessment. A consumed intent cannot be reassessed or credited again. REVIEW and BLOCKED carry no permit. The app uses a 30-minute window, and the permit reflects the policy observed at assessment time. Public articles cannot establish account-specific eligibility, deposit address ownership or changes after assessment.

## Development and Studionet

```sh
npm ci
npm test
npm run build
npm run deploy -- --schema
npm run dev
```

Requires Node.js 22.13+ and Python 3. The schema command compiles this source through the Stable Studionet RPC without signing. Practice mode uses labeled fixtures. The Studionet view verifies deployed source and protocol before writing, persists pending transactions so that receipts can be resumed, and validates finality, execution and finalized state. Published case receipts also have to match the verified deployment and signed call.

RouteLock uses Stable Studionet, chain ID 61999. Deploy `contracts/routelock.py` with a wallet in GenLayer Studio and use `npm run deploy -- <deployment-tx-hash>` to verify the finalized deployment and print a manifest. For route verification, use separate sender and reviewer wallets. Assess Arbitrum native USDC and verify the READY record before the named reviewer consumes its permit. Then assess Avalanche USDC.e and verify that it has no permit and produces no credit. `node scripts/studionet.mjs` verifies the submitted receipt, contract source and protocol, and finalized state for each phase. Wallet calls carry zero value. The repository's Pages workflow runs the tests and production build on `main`.

## Deployment evidence

[`routelock/2` on Stable Studionet](https://explorer-studio.genlayer.com/address/0x0c023865876BaD39f32aa227C00E3f46CdD92bF4) recorded a READY Arbitrum native USDC assessment, a reviewer consumption that credited 250,000,000 simulated ledger units, and a BLOCKED Avalanche USDC.e assessment with no permit or credit. All four transactions reached FINALIZED with majority agreement and successful execution. [Deployment manifest](deployment.json) · [Release evidence](evidence/routes.json)

An [earlier policy validation](evidence/routes-routelock-2-review.json) recorded REVIEW for both routes. The base Kraken article could not be extracted using the original article boundaries. The current parser uses Kraken's canonical article and accepts both observed date formats while retaining the pinned normalized article hash.

The historical `routelock/1` deployment and original acceptance evidence retain the recorded native assessment, consumption and Avalanche assessment. [Historical contract](https://explorer-studio.genlayer.com/address/0xCF045D20fD5373276A8D8Fb14298661070b453E9) · [Historical evidence](evidence/routes-routelock-1.json)

MIT licensed.
