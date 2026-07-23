# Dice Protocol — Roadmap

## Current State (v1.0 — July 2026)

### ✅ Shipped
- DiceEntropy contract live on Robinhood Chain mainnet
- Tyche keeper operational (systemd, auto-reveal verified)
- TypeScript SDK (built, ready to publish)
- Security audit complete (v9: 1 critical mitigated, 2 high under remediation)
- 1,000-value hash chain currently registered on live v10
- E2E verified: request → auto-reveal → callback → random number delivered

## v1.1 (Q3 2026)

### Keeper Enhancements
- [ ] Multi-replica Tyche (redundancy — 2+ keepers for failover)
- [ ] Monitoring dashboard (Grafana/Prometheus metrics endpoint)
- [ ] Alerting on keeper downtime (Telegram/Discord notifications)
- [ ] Automatic keeper wallet top-up (watch balance, alert when low)

### SDK
- [ ] npm publish `@diceprotocol/sdk`
- [ ] React hook (`useDiceRandom()`)
- [ ] Python SDK for off-chain verification
- [ ] Hardhat/Foundry integration helpers

### Documentation
- [ ] Interactive API playground
- [ ] Video integration tutorial
- [ ] Example dApp repository (coin flip, lottery, NFT mint)

## v1.2 (Q4 2026)

### Contract
- [ ] Hash chain renewal automation (alert at 40,000 reveals used)
- [ ] Optional commit-reveal without blockhash (for chains with weak blockhash)
- [ ] Batch reveal (multiple requests in single tx for gas efficiency)

### Infrastructure
- [ ] Dedicated VPS migration (isolation from other services)
- [ ] CDN for SDK distribution
- [ ] Status page (dice-protocol.status.io equivalent)

## v2.0 (Q1 2027)

### Protocol Upgrades
- [ ] Multi-provider support (competing providers, user choice)
- [ ] Onchain slashing for non-responsive providers
- [ ] Variable fee tiers (basic/premium with different gas limits)
- [ ] Governance for parameter changes (admin → DAO transition)

### Cross-Chain
- [ ] Deploy on additional Arbitrum Nitro L2s
- [ ] Unified keeper managing multiple chains
- [ ] Cross-chain random number verification

### Advanced Features
- [ ] VRF mode (verifiable random function alternative to commit-reveal)
- [ ] Subscription model (prepaid requests at discount)
- [ ] Developer API key system (rate limiting, analytics)

## Long-term Vision

Dice Protocol becomes the default randomness layer for Robinhood Chain — every game, every mint, every lottery defaults to Dice. The protocol expands to serve multiple chains from a single keeper infrastructure, with competitive provider markets driving down fees while maintaining security guarantees.

## Non-Goals (v1)

- ❌ Governance/DAO — admin controls all parameters
- ❌ Token — no token, fees paid in native ETH
- ❌ Upgradable contract — immutable for maximum trust
- ❌ Multi-provider — single exclusive provider for v1
- ❌ Staking/slashing — relies on operational uptime, not economic penalties
