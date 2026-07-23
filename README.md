# Dice Protocol

**Commit-Reveal Randomness Oracle for Robinhood Chain**

Dice Protocol provides on-chain verifiable randomness through a hash-chain commitment scheme. A designated provider pre-commits to a sequence of random values and reveals them on-demand, combining user-contributed randomness with provider-revealed values using Keccak256.

Portions of the architecture and interfaces are adapted from [Pyth Entropy / pyth-crosschain](https://github.com/pyth-network/pyth-crosschain) under Apache-2.0.

## Why Dice Protocol?

- **Unbiased** — No single party can influence the outcome alone
- **Verifiable** — Every reveal is verifiable on-chain via Keccak256
- **Fast** — Randomness delivered in seconds once revealed
- **Exact fee** — Exactly `0.000025 ETH` per request (`msg.value` must match exactly)
- **Refundable** — If not revealed within ~60–90s (`refundDelayBlocks = 6` L1 blocks), requester can reclaim fee via `refundRequest`
- **Immutable** — No proxy, no upgrades
- **Automatic** — Keeper auto-reveals; optional consumer callback

## Network (live v10)

| Parameter | Value |
|-----------|-------|
| Chain | Robinhood Chain (ID: 4663) |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` |
| DiceEntropy | `0xd8a0680e7699526b57140ed4eafdcc7219dc0a0c` |
| Provider (keeper) | `0x8741b8a825644D9Ef18Faf2DAB5e9b47B900F2b6` |
| Fee | `0.000025 ETH` exact (`25000000000000` wei) |
| Refund delay | `6` L1 blocks (~60–90s wall-clock) |
| Package | `@diceprotocol/sdk` |

## Documentation

| Document | Description |
|----------|-------------|
| [Whitepaper](whitepaper.md) | Technical specification |
| [Integration Guide](INTEGRATION.md) | Quick start |
| [Developer Docs](developer-docs.md) | API reference |
| [Architecture](ARCHITECTURE.md) | System design |
| [Deployment Guide](DEPLOYMENT.md) | Deploy notes |
| [Roadmap](ROADMAP.md) | Roadmap |
| [Security](security-audit.md) | Security notes |

## Quick Example

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {IEntropyConsumer} from "@diceprotocol/sdk/IEntropyConsumer.sol";
import {IEntropy} from "@diceprotocol/sdk/IEntropy.sol";

contract MyGame is IEntropyConsumer {
    IEntropy public immutable dice;
    address public provider = 0x8741b8a825644D9Ef18Faf2DAB5e9b47B900F2b6;

    constructor(address _dice) {
        dice = IEntropy(_dice);
    }

    function roll() external payable {
        // msg.value must equal getFeeV2(provider, gasLimit) exactly
        bytes32 userRandom = keccak256(abi.encodePacked(msg.sender, block.timestamp));
        dice.requestV2{value: msg.value}(provider, userRandom, 200000);
    }

    function entropyCallback(uint64 seq, address, bytes32 random) internal override {
        uint256 result = uint256(random) % 6 + 1;
    }

    function getEntropy() internal view override returns (address) {
        return address(dice);
    }
}
```

## Refunds

If a request is not revealed within about 60–90 seconds (6 L1 blocks on Robinhood / Arbitrum Nitro, where `block.number` is L1), the original requester can call:

```solidity
dice.refundRequest(provider, sequenceNumber);
```

This refunds the exact `feePaid` for that request.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
