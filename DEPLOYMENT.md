# Dice Protocol — Deployment Overview

> For security reasons, detailed deployment scripts and configurations are kept private.

## Contract Addresses (Mainnet — v10)

| Component | Address |
|-----------|---------|
| DiceEntropy | `0xd8a0680e7699526b57140ed4eafdcc7219dc0a0c` |
| Provider (Keeper) | `0x8741b8a825644D9Ef18Faf2DAB5e9b47B900F2b6` |
| Admin | `0x4ACD2C88a239a924E47Fc4995114ca1Bb0CA3CaD` |
| Vault (Fee Recipient) | `0x918EAF0b2589710B0D85ef48C12a343E68263841` |

## Network

| Parameter | Value |
|-----------|-------|
| Chain ID | 4663 |
| RPC URL | `https://rpc.mainnet.chain.robinhood.com` |
| Block Explorer | `https://robinhoodchain.blockscout.com` |
| Fee | exact `0.000025 ETH` (`25000000000000` wei) |
| Hash Chain Length | **500,000** values registered on live v10 |
| Refund delay | `refundDelayBlocks = 6` L1 blocks (~60–90s) |
| defaultGasLimit | 200,000 |

## Verification

The contract is verified on Blockscout. You can view the source code at:
`https://robinhoodchain.blockscout.com/address/0xd8a0680e7699526b57140ed4eafdcc7219dc0a0c`

## Integration

See the [Integration Guide](INTEGRATION.md) and [Developer Docs](developer-docs.md) for complete integration instructions.

## Refunds (v10)

If a request is not revealed within about 60–90 seconds, the original requester can reclaim the exact fee:

```solidity
// refundDelayBlocks = 6 on Robinhood Chain (L1 blocks ≈ 12s)
dice.refundRequest(provider, sequenceNumber);
```

Notes:
- Only the original requester can refund
- Request must still be active (not revealed / settled)
- Delay is L1-block based because Robinhood/Arbitrum Nitro uses L1 `block.number`
- Fee is exact: `msg.value` must equal the required fee (underpay and overpay both revert)
- Live contract: `0xd8a0680e7699526b57140ed4eafdcc7219dc0a0c`
- Live fee: exact `0.000025 ETH`
