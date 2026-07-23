# @diceprotocol/sdk

TypeScript SDK for Dice Protocol — trustless commit-reveal RNG on Robinhood Chain.

## Install

```bash
npm install @diceprotocol/sdk
```

## Quick Start

```typescript
import { DiceProtocol } from '@diceprotocol/sdk';
import { ethers } from 'ethers';

const dice = new DiceProtocol({
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  contractAddress: '0xd8a0680e7699526b57140ed4eafdcc7219dc0a0c',
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
| Contract | `0xd8a0680e7699526b57140ed4eafdcc7219dc0a0c` |
| Fee | 0.000025 ETH per request |

## License

Apache-2.0. Portions adapted from Pyth Entropy / pyth-crosschain under Apache-2.0.