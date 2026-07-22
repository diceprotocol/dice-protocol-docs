# Dice Protocol

**Commit-Reveal Randomness Oracle for Robinhood Chain**

Dice Protocol provides onchain verifiable randomness through a hash-chain commitment scheme. A designated provider pre-commits to a sequence of random values and reveals them on-demand, combining user-contributed randomness with provider-revealed values using Keccak256.

## Why Dice Protocol?

- **Unbiased** — No single party can influence the outcome
- **Verifiable** — Every reveal is verifiable onchain via Keccak256
- **Fast** — Random numbers delivered in ~3.5 seconds
- **Affordable** — Flat 0.000025 ETH per request
- **Immutable** — No proxy, no upgrades, no governance
- **Automatic** — Keeper auto-reveals, callback fires automatically

## Documentation

| Document | Description |
|----------|-------------|
| [Whitepaper](whitepaper.md) | Full technical specification |
| [Integration Guide](INTEGRATION.md) | Quick start for developers |
| [Developer Docs](developer-docs.md) | Complete API reference |
| [Architecture](ARCHITECTURE.md) | System design overview |
| [Deployment Guide](DEPLOYMENT.md) | Deploy your own instance |
| [Roadmap](ROADMAP.md) | Project roadmap |
| [Security Audit](security-audit.md) | Audit results |

## Network

| Parameter | Value |
|-----------|-------|
| Chain | Robinhood Chain (ID: 4663) |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` |
| Contract | `0x2AD7fc99e3D8A8Da72802936DD5145Bf672206b0` |
| Fee | 0.000025 ETH per request |

## Quick Example

```solidity
import { IEntropyConsumer } from "@diceprotocol/sdk/IEntropyConsumer.sol";
import { IEntropy } from "@diceprotocol/sdk/IEntropy.sol";

contract MyGame is IEntropyConsumer {
    IEntropy public immutable dice;
    address public provider = 0x8741b8a825644D9Ef18Faf2DAB5e9b47B900F2b6;

    constructor(address _dice) {
        dice = IEntropy(_dice);
    }

    function roll() external payable {
        bytes32 userRandom = keccak256(abi.encodePacked(msg.sender, block.timestamp));
        dice.requestV2{value: msg.value}(provider, userRandom, 200000);
    }

    function entropyCallback(uint64 seq, address, bytes32 random) internal override {
        uint256 result = uint256(random) % 6 + 1; // Dice roll 1-6
    }

    function getEntropy() internal view override returns (address) {
        return address(dice);
    }
}
```

## License

MIT
