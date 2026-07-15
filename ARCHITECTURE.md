# Dice Protocol — Architecture

## Overview

Dice Protocol is a commit-reveal randomness oracle consisting of two main components:

1. **DiceEntropy** — An immutable Solidity smart contract deployed on Robinhood Chain
2. **Tyche** — A Rust-based off-chain keeper service that auto-reveals randomness

## Contract Architecture

```
contracts/src/
├── DiceEntropy.sol        # Main oracle contract (entry point)
├── DiceState.sol          # Storage layout and state struct
├── DiceStructsV2.sol      # Struct definitions (ProviderInfo, Request, etc.)
└── interfaces/
    ├── IEntropy.sol        # Core interface for requesting randomness
    └── IEntropyConsumer.sol # Interface consuming contracts implement
```

### DiceEntropy.sol

The main contract handles:
- Provider registration (admin-only via `registerFor()`)
- Auto-registration in constructor (for exclusive provider model)
- Request handling (`requestV2()` with 3 overloads)
- Reveal verification (`reveal()`, `revealWithCallback()`)
- Fee accounting (single-fee model, 100% to vault)
- Admin functions (`setFee()`, `withdrawFees()`, `setDefaultGasLimit()`)

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Immutable (no proxy) | Maximum trust — logic can never change |
| V2 API only | Simplified surface area, no legacy support |
| Single fee model | 0.000055 ETH flat, no protocol/provider split |
| Exclusive provider | Admin controls who can provide randomness |
| 50k hash chain | ~500 days at 100 requests/day |
| No blockhash in result | Simplifies verification, uses 2-party commit-reveal |
| Auto-register in constructor | Provider active at deployment, no separate tx |

## Tyche Keeper Architecture

```
tyche/src/
├── main.rs               # CLI entry point (run, setup-provider, generate)
├── command/
│   ├── run.rs            # Main keeper loop — watches blocks, reveals
│   └── setup_provider.rs # Provider registration command
├── keeper/
│   └── block.rs          # Block processing, event filtering
├── chain/
│   ├── reader.rs         # Contract read interface (getProviderInfo, etc.)
│   └── submitter.rs      # Transaction submission (revealWithCallback)
├── state.rs              # Hash chain state management (PebbleHashChain)
├── config.rs             # YAML configuration parser
├── api/                  # HTTP API server (port 34000)
│   ├── explorer.rs       # Request/reveal explorer endpoints
│   └── revelation.rs     # Revelation query endpoints
├── history.rs            # SQLite persistence layer
└── lib.rs                # Shared types
```

### Operation Flow

1. **Startup**: Tyche reads config → connects to RPC → fetches provider info from contract → deserializes commitment metadata → reconstructs hash chain in memory
2. **Backlog processing**: Scans from last-processed block to current block
3. **Live mode**: Polls for new blocks in 100-block batches
4. **Event handling**: For each `Requested` event, computes the reveal value and submits a `revealWithCallback` transaction
5. **Persistence**: All requests and reveals are logged to SQLite

### Hash Chain Computation

The hash chain uses Keccak256 in an S/KEY-like construction:

```
seed → Keccak256(seed) = h₁ → Keccak256(h₁) = h₂ → ... → h₅₀₀₀₀ = commitment
```

Reveals happen in reverse: h₄₉₉₉₉ first, then h₄₉₉₉₈, etc. Each reveal hashes to the previous commitment, proving chain membership.

Tyche stores every hash in the chain in memory (50,000 × 32 bytes = 1.6 MB) for O(1) lookup by sequence number.

## Wallet Architecture

```
Admin (Cold)                Vault (Cold)              Keeper (Hot)
0x4ACD...                   0x918E...                 0x8741...
    │                           │                         │
    ├── setFee()                │                         ├── revealWithCallback()
    ├── withdrawFees() ────────►│                         │   (auto, via Tyche)
    ├── registerFor()           │                         │
    ├── setDefaultProvider()    │                         │
    └── proposeAdmin()          │                         │
```

- **Admin**: Cold wallet, controls all contract parameters
- **Vault**: Cold wallet, receives all withdrawn fees
- **Keeper**: Hot wallet, only submits reveals. Funded with minimal ETH for gas. Cannot steal fees or modify contract state.

## Security Layers

1. **Cryptographic**: Keccak256 hash chain — provider can't precompute, user can't bias
2. **Economic**: Flat fee covers gas + margin, keeper funded separately
3. **Operational**: systemd auto-restart, three-wallet separation
4. **Contract-level**: Immutable, gas-capped callbacks, `excessivelySafeCall` pattern
5. **Infrastructure**: Private keys never committed, config gitignored, separate Git identity
