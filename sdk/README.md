# @dice-protocol/sdk

TypeScript SDK for Dice Protocol — trustless commit-reveal RNG on Robinhood Chain.

## Install

```bash
npm install @dice-protocol/sdk
```

## Quick Start

```typescript
import { DiceProtocol } from '@dice-protocol/sdk';
import { ethers } from 'ethers';

const dice = new DiceProtocol({
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  contractAddress: '0x2AD7fc99e3D8A8Da72802936DD5145Bf672206b0',
});

// Get current fee
const fee = await dice.getFee();
console.log('Fee:', ethers.formatEther(fee), 'ETH');
```

## Network

| Parameter | Value |
|-----------|-------|
| Chain | Robinhood Chain (ID: 4663) |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Contract | `0x2AD7fc99e3D8A8Da72802936DD5145Bf672206b0` |
| Fee | 0.000055 ETH per request |

## License

MIT
