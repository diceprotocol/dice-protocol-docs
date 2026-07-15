# Dice Protocol — Developer Documentation

> **Contract:** [`0x777Af3fE41855Cb9E06Ae51ed7941F4A4241690F`](https://robinhoodchain.blockscout.com/address/0x777Af3fE41855Cb9E06Ae51ed7941F4A4241690F)
> **Chain:** Robinhood Chain Mainnet (Chain ID: 4663)
> **Fee:** 0.000055 ETH per request
> **Solidity:** ^0.8.24
> **License:** Apache-2.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Contract Architecture](#3-contract-architecture)
4. [Core Concepts](#4-core-concepts)
5. [Public Function Reference](#5-public-function-reference)
6. [Event Reference](#6-event-reference)
7. [Error Reference](#7-error-reference)
8. [Integration Patterns](#8-integration-patterns)
9. [Fee Handling](#9-fee-handling)
10. [Gas Considerations](#10-gas-considerations)
11. [Testing Guide](#11-testing-guide)
12. [Deployment Guide](#12-deployment-guide)

---

## 1. Overview

Dice Protocol is a trustless commit-reveal randomness oracle deployed on Robinhood Chain. It delivers provably fair, on-chain verifiable random numbers through a two-party commit-reveal scheme — no single party can bias the outcome.

**Key properties:**

- **Unbiased** — The random number is derived from contributions by both the requester and the provider. Neither party alone controls or can predict the outcome.
- **Immutable** — The contract is deployed without a proxy. The logic can never be changed.
- **Callback-based** — When the random number is ready, the contract calls back into the requesting contract automatically. No polling or manual retrieval is needed.
- **Single fee model** — A flat fee of 0.000055 ETH per request. All fees accrue to a protocol vault.
- **Exclusive provider** — Providers are registered by the protocol admin only. No permissionless registration.

### How It Works (Commit-Reveal)

```
┌──────────┐                      ┌──────────┐                  ┌─────────────┐
│  User /  │  1. requestV2()      │ DiceEntropy│  2. Detect     │   Provider   │
│  dApp    │ ────────────────────>│  Contract  │ <── Requested ──│  (Keeper)    │
│          │  (pays fee, commits  │            │    event       │              │
│          │   userRandom hash)   │            │                │              │
│          │                      │            │  3. revealWith │              │
│          │                      │            │  Callback()    │              │
│          │  4. entropyCallback()│            │ <──────────────│              │
│          │ <───────────────────│            │  (reveals hash │              │
│          │  (delivers random#)  │            │   chain value) │              │
└──────────┘                      └──────────┘                  └─────────────┘
```

1. **User commits** — The requester generates a 32-byte random number (`userRandom`) and submits only its hash (`keccak256(userRandom)`) on-chain via `requestV2()`. The raw value stays secret.
2. **Provider reveals** — The provider holds a pre-committed hash chain. Upon seeing the `Requested` event, it submits the next chain value (`providerRevelation`) via `revealWithCallback()`. The contract verifies this value hashes back to the provider's published commitment.
3. **Random number derived** — `randomNumber = keccak256(userRandom, providerContribution, blockHash)`. Since V2 always sets `useBlockhash = false`, the formula is effectively `keccak256(userRandom, providerContribution, 0)`.
4. **Callback** — The contract calls `entropyCallback(sequence, provider, randomNumber)` on the requesting contract. If the callback reverts or runs out of gas, the reveal still succeeds and the failure is recorded in the `Revealed` event.

### Hash Chain

The provider pre-commits a chain of values: `x₀ → x₁ → ... → xₙ`, where `xᵢ = keccak256(xᵢ₊₁)`. Only `x₀` (the commitment root) is published on-chain at registration. Each request consumes one value from the chain. This means:

- **Past reveals are verifiable** — any revealed value hashes back to the commitment.
- **Future reveals are unpredictable** — without knowing `xᵢ₊₁`, you cannot derive it from `xᵢ`.

When the chain runs low, the provider registers a new chain via `registerFor()`.

---

## 2. Prerequisites

### Solidity / Foundry

| Requirement | Version | Install |
|-------------|---------|---------|
| Foundry (forge, cast) | ≥ 0.2.0 | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Solidity Compiler | 0.8.24 | Bundled with Foundry |
| OpenZeppelin Contracts | ^5.0 | `forge install OpenZeppelin/openzeppelin-contracts` |
| ExcessivelySafeCall | latest | `forge install nomiclabs/ExcessivelySafeCall` |

**Remappings** (`contracts/remappings.txt`):

```
@openzeppelin/=lib/openzeppelin-contracts/contracts/
@excessively-safe-call/=lib/ExcessivelySafeCall/
@dice-protocol/=src/
```

**Foundry config** (`contracts/foundry.toml`):

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
```

### TypeScript SDK / Node.js

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18 |
| npm or yarn | latest |
| ethers.js | ^6.13.0 |
| TypeScript | ^5.5.0 |

```bash
# Install the SDK
npm install @dice-protocol/sdk

# Or build from source
cd sdk && npm install && npm run build
```

---

## 3. Contract Architecture

### File Layout

```
contracts/src/
├── DiceEntropy.sol              # Main oracle contract (entry point)
├── DiceState.sol                # Storage layout (State struct, constants)
├── sdk/
│   ├── DiceStructsV2.sol        # Struct definitions (ProviderInfo, Request)
│   ├── DiceErrors.sol           # Custom error definitions
│   ├── DiceEventsV2.sol         # Event definitions
│   ├── DiceStatusConstants.sol  # Callback status constants
│   ├── IEntropy.sol             # Full interface (V2 + provider management)
│   ├── IEntropyV2.sol           # V2 interface (request/reveal/view)
│   ├── IEntropyConsumer.sol     # Base contract for consumers
│   └── PRNG.sol                 # PRNG utility for deriving multiple values
├── TestConsumer.sol             # Example consumer contract
└── test/
    ├── DiceEntropy.t.sol        # Core test suite
    └── DiceEntropyFull.t.sol    # Full test suite
```

### Component Overview

#### DiceEntropy

The main contract. Inherits `DiceState` and implements `IEntropy`. Handles:

- Provider registration (admin-only via `registerFor()`)
- Request handling (`requestV2()` with 4 overloads)
- Reveal verification (`reveal()`, `revealWithCallback()`)
- Callback dispatch to consumer contracts
- Fee accounting (single flat fee, all to vault)
- Admin management (propose/accept admin, set fee, set default provider)

**Key constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `TEN_THOUSAND` | 10,000 | Gas limit rounding unit |
| `MAX_GAS_LIMIT` | 655,350,000 | Maximum callback gas limit (`uint16.max × 10000`) |

#### DiceState

Defines the storage layout. Contains a single `State` struct stored in `_state`:

```solidity
struct State {
    address admin;                                    // Protocol admin
    uint128 feeInWei;                                 // Flat fee per request
    uint128 accruedFeesInWei;                         // Total fees held in contract
    address vault;                                    // Fee withdrawal target
    address defaultProvider;                          // Default provider address
    DiceStructsV2.Request[32] requests;              // In-flight request table (primary)
    mapping(bytes32 => DiceStructsV2.Request) requestsOverflow; // Overflow slots
    mapping(address => DiceStructsV2.ProviderInfo) providers;   // Provider registry
    address proposedAdmin;                            // Pending admin transfer
    bytes32 seed;                                     // Internal PRNG seed
}
```

| Constant | Value | Description |
|----------|-------|-------------|
| `NUM_REQUESTS` | 32 | Size of the primary request array (power of 2) |
| `NUM_REQUESTS_MASK` | `0x1f` | Bitmask for array index (`NUM_REQUESTS - 1`) |

The request table uses a two-level hash table: a 32-slot array indexed by the low byte of `keccak256(provider, sequenceNumber)`, with a mapping for overflow collisions.

#### DiceStructsV2

Defines the two primary data structures:

**`ProviderInfo`** — Stored per provider address:

```solidity
struct ProviderInfo {
    uint128 feeInWei;                              // Unused in single-fee model (always 0)
    uint128 accruedFeesInWei;                      // Unused in single-fee model (always 0)
    bytes32 originalCommitment;                    // Initial hash chain root (x₀)
    uint64 originalCommitmentSequenceNumber;       // Sequence number at original commit
    bytes commitmentMetadata;                      // Optional metadata for chain management
    bytes uri;                                     // Optional URI for revelation retrieval
    uint64 endSequenceNumber;                      // Exclusive end of current chain
    uint64 sequenceNumber;                         // Next sequence number to assign
    bytes32 currentCommitment;                     // Current chain position
    uint64 currentCommitmentSequenceNumber;        // Sequence number at current commitment
    address feeManager;                            // Unused in single-fee model
    uint32 maxNumHashes;                           // Max hashes allowed per reveal (0 = unlimited)
    uint32 defaultGasLimit;                        // Default callback gas limit
}
```

**`Request`** — Stored per in-flight request:

```solidity
struct Request {
    address provider;            // Slot 1: Provider address
    uint64 sequenceNumber;       // Slot 1: Unique request ID
    uint32 numHashes;            // Slot 1: Hashes needed to verify reveal
    bytes32 commitment;          // Slot 2: keccak256(userCommitment, providerCommitment)
    uint64 blockNumber;          // Slot 3: Block where request was created
    address requester;           // Slot 3: Address that made the request
    bool useBlockhash;           // Slot 3: Always false in V2
    uint8 callbackStatus;        // Slot 3: See DiceStatusConstants
    uint16 gasLimit10k;          // Slot 3: Callback gas limit in 10k units
}
```

### Callback Status Constants

Defined in `DiceStatusConstants`:

| Constant | Value | Meaning |
|----------|-------|---------|
| `CALLBACK_NOT_NECESSARY` | 0 | Request was made without callback (plain `reveal`) |
| `CALLBACK_NOT_STARTED` | 1 | Callback has not been invoked yet |
| `CALLBACK_IN_PROGRESS` | 2 | Callback is currently executing (reentrancy guard) |
| `CALLBACK_FAILED` | 3 | Callback was invoked but reverted/out of gas |

### IEntropyConsumer

Abstract base contract that consumers inherit. It provides:

```solidity
abstract contract IEntropyConsumer {
    function _entropyCallback(uint64 sequence, address provider, bytes32 randomNumber) external virtual;
    function getEntropy() internal view virtual returns (address);
    function entropyCallback(uint64 sequence, address provider, bytes32 randomNumber) internal virtual;
}
```

The `_entropyCallback` function is called externally by `DiceEntropy` and verifies `msg.sender` is the registered entropy contract. It then delegates to the internal `entropyCallback()` which the consumer implements.

---

## 4. Core Concepts

### Sequence Numbers

Each request is assigned a monotonically increasing `sequenceNumber` scoped to a provider. This serves as the unique identifier for the request throughout its lifecycle — from `requestV2()` through `revealWithCallback()` and into the `Requested`/`Revealed` events.

### User Commitment

When a user calls `requestV2()`, they pass a `userRandomNumber` (32 bytes). The contract computes:

```
userCommitment = keccak256(userRandomNumber)
```

This hash is stored on-chain. The raw `userRandomNumber` is kept secret by the user and revealed later during `revealWithCallback()`.

### Provider Commitment

The provider's commitment is a hash chain root `x₀` published at registration. For a request at sequence number `S` with the current commitment at sequence number `C`, the number of hashes needed is `numHashes = S - C`. The provider reveals `x₅` (for example), and the contract verifies:

```
keccak256ⁿ(revelation) == currentCommitment    where n = numHashes
```

### Combined Randomness

The final random number is:

```
randomNumber = keccak256(abi.encodePacked(userContribution, providerContribution, blockHash))
```

In V2, `useBlockhash` is always `false`, so `blockHash` is `bytes32(0)`. The effective formula is:

```
randomNumber = keccak256(abi.encodePacked(userRandom, providerRevelation, 0))
```

### Request Lifecycle

```
           requestV2()                revealWithCallback()
               │                            │
               ▼                            ▼
┌─────────────────────┐         ┌─────────────────────────┐
│  Request created    │         │  Verify revelations      │
│  - sequence assigned│         │  against commitment      │
│  - commitment stored│  ──────>│  Compute randomNumber    │
│  - fee collected    │         │  Call entropyCallback()  │
│  - Requested event  │         │  Emit Revealed event     │
└─────────────────────┘         │  Clear request from pool │
                                └─────────────────────────┘
```

---

## 5. Public Function Reference

### Constructor

```solidity
constructor(
    address admin,
    uint128 feeInWei,
    address defaultProvider,
    bool prefillRequestStorage,
    address vault,
    bytes32 providerCommitment,
    uint64 providerChainLength,
    bytes memory providerCommitmentMetadata
)
```

Deploys the contract with initial configuration. If `providerChainLength > 0`, the default provider is auto-registered with the given commitment — no separate registration transaction needed.

| Parameter | Description |
|-----------|-------------|
| `admin` | Protocol admin address (sets fee, default provider, withdraws fees) |
| `feeInWei` | Flat fee per request in wei |
| `defaultProvider` | Initial default provider address |
| `prefillRequestStorage` | If true, pre-writes request slots for gas consistency |
| `vault` | Address that receives all withdrawn fees |
| `providerCommitment` | Hash chain root (x₀) for auto-registration |
| `providerChainLength` | Number of values in the hash chain |
| `providerCommitmentMetadata` | Optional bincode-serialized metadata |

---

### Request Functions

All `requestV2` overloads are `payable` and return the assigned `sequenceNumber`.

#### `requestV2()`

```solidity
function requestV2() external payable returns (uint64 assignedSequenceNumber)
```

Request randomness from the default provider. The user's random number is auto-generated by the contract's internal PRNG. Gas limit defaults to 0 (provider default).

#### `requestV2(uint32 gasLimit)`

```solidity
function requestV2(uint32 gasLimit) external payable returns (uint64 assignedSequenceNumber)
```

Request from the default provider with a specified callback gas limit. User random is auto-generated.

#### `requestV2(address provider, uint32 gasLimit)`

```solidity
function requestV2(address provider, uint32 gasLimit) external payable returns (uint64 assignedSequenceNumber)
```

Request from a specific provider with a specified gas limit. User random is auto-generated.

#### `requestV2(address provider, bytes32 userRandomNumber, uint32 gasLimit)`

```solidity
function requestV2(address provider, bytes32 userRandomNumber, uint32 gasLimit)
    public payable returns (uint64 assignedSequenceNumber)
```

**Primary request function.** All overloads delegate here. The user provides their own 32-byte random number for maximum entropy contribution. Pass `gasLimit = 0` to use the provider's default gas limit.

| Parameter | Description |
|-----------|-------------|
| `provider` | Provider address (use `getDefaultProvider()` if unsure) |
| `userRandomNumber` | 32-byte random value generated off-chain (keep secret until reveal) |
| `gasLimit` | Gas limit for the callback. 0 = use provider's `defaultGasLimit` |

**Emits:** `Requested`

**Reverts:** `NoSuchProvider`, `OutOfRandomness`, `InsufficientFee`, `LastRevealedTooOld`, `MaxGasLimitExceeded`

---

### Reveal Functions

#### `reveal(address provider, uint64 sequenceNumber, bytes32 userRevelation, bytes32 providerRevelation)`

```solidity
function reveal(
    address provider,
    uint64 sequenceNumber,
    bytes32 userRevelation,
    bytes32 providerRevelation
) public returns (bytes32 randomNumber)
```

Reveals the random number for a request **without** triggering a callback. Only callable by the original requester. Only valid for requests made without callback (though V2 always uses callback, so this is primarily for non-contract callers).

| Parameter | Description |
|-----------|-------------|
| `provider` | Provider address |
| `sequenceNumber` | The request's sequence number |
| `userRevelation` | The raw user random number (must match the committed hash) |
| `providerRevelation` | The provider's hash chain value for this sequence |

**Returns:** The generated random number

**Emits:** `Revealed`

**Reverts:** `NoSuchRequest`, `InvalidRevealCall`, `Unauthorized`, `IncorrectRevelation`, `BlockhashUnavailable`

#### `revealWithCallback(address provider, uint64 sequenceNumber, bytes32 userRevelation, bytes32 providerRevelation)`

```solidity
function revealWithCallback(
    address provider,
    uint64 sequenceNumber,
    bytes32 userRevelation,
    bytes32 providerRevelation
) public
```

Reveals the random number and triggers the `entropyCallback()` on the requesting contract. This is the standard reveal path for V2 requests. Can be called by anyone (typically the provider/keeper).

If the callback fails (reverts or out of gas), the reveal still succeeds. The request is marked `CALLBACK_FAILED` and can be re-revealed with `revealWithCallback()` to retry the callback.

**Emits:** `Revealed` (with `callbackFailed` flag)

**Reverts:** `NoSuchRequest`, `InvalidRevealCall`, `IncorrectRevelation`, `InsufficientGas`

---

### Commitment Advancement

#### `advanceProviderCommitment(address provider, uint64 advancedSequenceNumber, bytes32 providerRevelation)`

```solidity
function advanceProviderCommitment(
    address provider,
    uint64 advancedSequenceNumber,
    bytes32 providerRevelation
) public
```

Advances the provider's on-chain commitment to reduce `numHashes` for future requests. This is a gas optimization — without advancement, older requests require more hash iterations to verify. The caller provides a revelation value that, when hashed `numHashes` times, must equal the current commitment.

**Reverts:** `UpdateTooOld`, `AssertionFailure`, `IncorrectRevelation`

---

### View Functions

#### `getDefaultProvider()`

```solidity
function getDefaultProvider() public view returns (address provider)
```

Returns the default provider address.

#### `getProviderInfo(address provider)`

```solidity
function getProviderInfo(address provider) public view returns (DiceStructsV2.ProviderInfo memory info)
```

Returns full provider information. Alias of `getProviderInfoV2()`.

#### `getProviderInfoV2(address provider)`

```solidity
function getProviderInfoV2(address provider) public view returns (DiceStructsV2.ProviderInfo memory info)
```

Returns full provider information (V2 naming).

#### `getRequest(address provider, uint64 sequenceNumber)`

```solidity
function getRequest(address provider, uint64 sequenceNumber) public view returns (DiceStructsV2.Request memory req)
```

Returns request details. Alias of `getRequestV2()`.

#### `getRequestV2(address provider, uint64 sequenceNumber)`

```solidity
function getRequestV2(address provider, uint64 sequenceNumber) public view returns (DiceStructsV2.Request memory req)
```

Returns request details (V2 naming).

#### `getFee(address provider)`

```solidity
function getFee(address provider) public view returns (uint128 feeAmount)
```

Returns the flat protocol fee in wei. The `provider` parameter is accepted for interface compatibility but the fee is protocol-level (same for all providers).

#### `getFeeV2()`

```solidity
function getFeeV2() external view returns (uint128 feeAmount)
```

Returns the protocol fee for the default provider with default gas limit.

#### `getFeeV2(uint32 gasLimit)`

```solidity
function getFeeV2(uint32 gasLimit) external view returns (uint128 feeAmount)
```

Returns the protocol fee for the default provider with a specified gas limit.

#### `getFeeV2(address provider, uint32 gasLimit)`

```solidity
function getFeeV2(address provider, uint32 gasLimit) public view returns (uint128 feeAmount)
```

Returns the protocol fee for a specific provider and gas limit. All overloads return the same flat fee.

#### `getAccruedFees()`

```solidity
function getAccruedFees() public view returns (uint128)
```

Returns total fees currently held in the contract.

#### `getProtocolFee()`

```solidity
function getProtocolFee() public view returns (uint128)
```

Returns the current per-request fee in wei.

#### `getAccruedTreasuryFees()`

```solidity
function getAccruedTreasuryFees() public view returns (uint128)
```

Returns total accrued fees. Alias of `getAccruedFees()` (kept for interface compatibility).

---

### Pure Functions

#### `constructUserCommitment(bytes32 userRandomness)`

```solidity
function constructUserCommitment(bytes32 userRandomness) public pure returns (bytes32 userCommitment)
```

Computes `keccak256(userRandomness)`. Useful for off-chain verification or pre-computing commitments.

#### `combineRandomValues(bytes32 userRandomness, bytes32 providerRandomness, bytes32 blockHash)`

```solidity
function combineRandomValues(
    bytes32 userRandomness,
    bytes32 providerRandomness,
    bytes32 blockHash
) public pure returns (bytes32 combinedRandomness)
```

Computes `keccak256(abi.encodePacked(userRandomness, providerRandomness, blockHash))`. In V2, `blockHash` is always `bytes32(0)`.

---

### Provider Configuration Functions

These functions are callable by the registered provider (via `msg.sender`):

#### `setProviderUri(bytes calldata newUri)`

```solidity
function setProviderUri(bytes calldata newUri) external
```

Updates the provider's optional URI. **Emits:** `ProviderUriUpdated`

#### `setMaxNumHashes(uint32 maxNumHashes)`

```solidity
function setMaxNumHashes(uint32 maxNumHashes) external
```

Sets the maximum number of hashes allowed per reveal. If a request's `numHashes` exceeds this, `LastRevealedTooOld` is reverted. Set to 0 for unlimited. **Emits:** `ProviderMaxNumHashesAdvanced`

#### `setDefaultGasLimit(uint32 gasLimit)`

```solidity
function setDefaultGasLimit(uint32 gasLimit) external
```

Sets the default callback gas limit for requests that pass `gasLimit = 0`. **Emits:** `ProviderDefaultGasLimitUpdated`

#### `setProviderFee(uint128 newFeeInWei)` — *always reverts*

```solidity
function setProviderFee(uint128 newFeeInWei) external
```

Always reverts with `Unauthorized()`. Per-provider fees are not supported in the single-fee model. Use `setFee()` (admin) instead.

#### `setProviderFeeAsFeeManager(address provider, uint128 newFeeInWei)` — *always reverts*

```solidity
function setProviderFeeAsFeeManager(address provider, uint128 newFeeInWei) external
```

Always reverts with `Unauthorized()`. Fee manager model is removed.

#### `setFeeManager(address manager)` — *always reverts*

```solidity
function setFeeManager(address manager) external
```

Always reverts with `Unauthorized()`. Fee manager model is removed.

#### `withdraw(uint128 amount)` — *always reverts*

```solidity
function withdraw(uint128 amount) public
```

Always reverts with `Unauthorized()`. Per-provider withdrawal is removed. Admin uses `withdrawFees()` instead.

#### `withdrawAsFeeManager(address provider, uint128 amount)` — *always reverts*

```solidity
function withdrawAsFeeManager(address provider, uint128 amount) external
```

Always reverts with `Unauthorized()`.

---

### Provider Registration

#### `registerFor(address providerAddress, uint128 feeInWei, bytes32 commitment, bytes calldata commitmentMetadata, uint64 chainLength, bytes calldata uri)`

```solidity
function registerFor(
    address providerAddress,
    uint128 feeInWei,
    bytes32 commitment,
    bytes calldata commitmentMetadata,
    uint64 chainLength,
    bytes calldata uri
) external
```

Registers or rotates a provider. **Admin-only.** The `feeInWei` parameter is accepted for interface compatibility but ignored — fees are protocol-level.

| Parameter | Description |
|-----------|-------------|
| `providerAddress` | Provider's address |
| `feeInWei` | Ignored (kept for interface compat) |
| `commitment` | Hash chain root (x₀) |
| `commitmentMetadata` | Optional metadata |
| `chainLength` | Number of values in the chain (≥ 1) |
| `uri` | Optional URI for revelation retrieval |

**Emits:** `Registered`

**Reverts:** `Unauthorized`, `AssertionFailure` (if `chainLength == 0`)

---

### Admin Functions

#### `proposeAdmin(address newAdmin)`

```solidity
function proposeAdmin(address newAdmin) external
```

Proposes a new admin. Must be accepted by the new admin via `acceptAdmin()`. **Admin-only.**

#### `acceptAdmin()`

```solidity
function acceptAdmin() external
```

Accepts the admin role. Must be called by the proposed admin.

#### `setDefaultProvider(address provider)`

```solidity
function setDefaultProvider(address provider) external
```

Sets the default provider address. **Admin-only.**

#### `setFee(uint128 feeInWei)`

```solidity
function setFee(uint128 feeInWei) external
```

Sets the protocol fee per request. **Admin-only.**

#### `withdrawFees(uint128 amount)`

```solidity
function withdrawFees(uint128 amount) external
```

Withdraws accrued fees to the vault address. **Admin-only.** Reverts if `amount > accruedFeesInWei`.

---

## 6. Event Reference

### `Registered`

```solidity
event Registered(address indexed provider, bytes extraArgs);
```

Emitted when a provider is registered or its commitment is rotated.

### `Requested`

```solidity
event Requested(
    address indexed provider,
    address indexed caller,
    uint64 indexed sequenceNumber,
    bytes32 userContribution,
    uint32 gasLimit,
    bytes extraArgs
);
```

Emitted when a randomness request is created. The `sequenceNumber` is the key identifier for tracking the request through to reveal.

### `Revealed`

```solidity
event Revealed(
    address indexed provider,
    address indexed caller,
    uint64 indexed sequenceNumber,
    bytes32 randomNumber,
    bytes32 userContribution,
    bytes32 providerContribution,
    bool callbackFailed,
    bytes callbackReturnValue,
    uint32 callbackGasUsed,
    bytes extraArgs
);
```

Emitted when a request is revealed. Contains the final random number and callback execution details. If `callbackFailed` is `true`, the callback reverted or ran out of gas — the random number is still valid and the request can be re-revealed with `revealWithCallback()` to retry.

### `ProviderFeeUpdated`

```solidity
event ProviderFeeUpdated(
    address indexed provider,
    uint128 oldFee,
    uint128 newFee,
    bytes extraArgs
);
```

Reserved for interface compatibility. Not emitted in the single-fee model.

### `ProviderDefaultGasLimitUpdated`

```solidity
event ProviderDefaultGasLimitUpdated(
    address indexed provider,
    uint32 oldDefaultGasLimit,
    uint32 newDefaultGasLimit,
    bytes extraArgs
);
```

Emitted when a provider updates their default callback gas limit via `setDefaultGasLimit()`.

### `ProviderUriUpdated`

```solidity
event ProviderUriUpdated(
    address indexed provider,
    bytes oldUri,
    bytes newUri,
    bytes extraArgs
);
```

Emitted when a provider updates their URI via `setProviderUri()`.

### `ProviderFeeManagerUpdated`

```solidity
event ProviderFeeManagerUpdated(
    address indexed provider,
    address oldFeeManager,
    address newFeeManager,
    bytes extraArgs
);
```

Reserved for interface compatibility. Not emitted in the single-fee model.

### `ProviderMaxNumHashesAdvanced`

```solidity
event ProviderMaxNumHashesAdvanced(
    address indexed provider,
    uint32 oldMaxNumHashes,
    uint32 newMaxNumHashes,
    bytes extraArgs
);
```

Emitted when a provider updates their max num hashes via `setMaxNumHashes()`.

### `Withdrawal`

```solidity
event Withdrawal(
    address indexed provider,
    address indexed recipient,
    uint128 withdrawnAmount,
    bytes extraArgs
);
```

Reserved for interface compatibility. Fee withdrawals in the single-fee model use `withdrawFees()` which does not emit this event.

---

## 7. Error Reference

All errors are custom errors defined in `DiceErrors.sol`. They do not include string messages (gas-efficient).

| Error | Selector | Triggered When |
|-------|----------|----------------|
| `AssertionFailure()` | `0x0dbe671f` | A contract invariant was violated (software bug), or `chainLength == 0` in `registerFor()` |
| `NoSuchProvider()` | `0x3dfb79f8` | The provider address is not registered |
| `NoSuchRequest()` | `0x7c0c8b94` | No active request exists for the given provider + sequence number |
| `OutOfRandomness()` | `0x9c4f72c0` | The provider's hash chain is exhausted (`sequenceNumber >= endSequenceNumber`) |
| `InsufficientFee()` | `0x1f77a9bd` | `msg.value` is less than the required fee |
| `IncorrectRevelation()` | `0x435c5f64` | The revealed user or provider value does not match the stored commitment |
| `Unauthorized()` | `0x82b42900` | `msg.sender` is not authorized for this operation |
| `BlockhashUnavailable()` | `0x8c1f9e1e` | The blockhash for the request's block number is zero (block too old) |
| `InvalidRevealCall()` | `0x67bb0dcc` | Wrong reveal function used (e.g., `reveal()` on a callback request, or `revealWithCallback()` on a non-callback request) |
| `LastRevealedTooOld()` | `0x8129e6f4` | The request's `numHashes` exceeds the provider's `maxNumHashes` limit |
| `UpdateTooOld()` | `0x6a7a7f0c` | The advanced sequence number is not newer than the current commitment |
| `InsufficientGas()` | `0x2c3fab1f` | Not enough gas was provided to execute the callback with the desired gas limit |
| `MaxGasLimitExceeded()` | `0x54b94f55` | A gas limit value exceeded the maximum of 655,350,000 |

---

## 8. Integration Patterns

### Pattern A: Solidity Consumer (Callback)

This is the standard pattern for smart contracts that need randomness. The consumer inherits `IEntropyConsumer`, requests randomness, and receives the result via callback.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IEntropyConsumer} from "@dice-protocol/sdk/IEntropyConsumer.sol";
import {IEntropy} from "@dice-protocol/sdk/IEntropy.sol";

contract MyGame is IEntropyConsumer {
    IEntropy public immutable dice;
    address public immutable provider;

    mapping(uint64 => address) public requesters;
    mapping(uint64 => bytes32) public randomNumbers;
    mapping(uint64 => bool) public resolved;

    // Store pending request context
    struct PendingRequest {
        address player;
        uint256 betAmount;
    }
    mapping(uint64 => PendingRequest) public pending;

    constructor(address _dice, address _provider) {
        dice = IEntropy(_dice);
        provider = _provider;
    }

    /// @notice Request a random number. Caller must send ETH for the fee.
    function play(bytes32 userRandom) external payable returns (uint64 seq) {
        // Get the required fee
        uint128 fee = dice.getFee(provider);
        require(msg.value >= fee, "Insufficient fee");

        // Store context for the callback
        seq = dice.requestV2{value: fee}(provider, userRandom, 100_000);
        pending[seq] = PendingRequest(msg.sender, msg.value - fee);
        requesters[seq] = msg.sender;
    }

    /// @notice Called by DiceEntropy when the random number is ready
    function entropyCallback(
        uint64 sequence,
        address,
        bytes32 randomNumber
    ) internal override {
        require(!resolved[sequence], "Already resolved");
        resolved[sequence] = true;
        randomNumbers[sequence] = randomNumber;

        // Use the random number — e.g., coin flip
        PendingRequest memory req = pending[sequence];
        bool heads = uint256(randomNumber) % 2 == 0;
        if (heads) {
            payable(req.player).transfer(req.betAmount * 2);
        }
        delete pending[sequence];
    }

    /// @notice Required by IEntropyConsumer — return the DiceEntropy address
    function getEntropy() internal view override returns (address) {
        return address(dice);
    }
}
```

**Key points:**
- Generate `userRandom` off-chain using a secure random source (e.g., `crypto.getRandomValues()` in JS, `keccak256(block.prevrandao, msg.sender, nonce)` in Solidity).
- Keep `userRandom` secret until the provider reveals — you'll need it to call `revealWithCallback()`.
- The gas limit you pass to `requestV2()` must cover your `entropyCallback()` logic.
- If the callback fails, anyone can retry by calling `revealWithCallback()` again with the same parameters.

### Pattern B: Solidity Consumer (Manual Reveal)

If you don't want the callback pattern (e.g., you're an EOA or want to read the result off-chain), use `reveal()` instead of `revealWithCallback()`:

```solidity
// Request randomness (no callback needed)
uint64 seq = dice.requestV2{value: fee}(provider, userRandom, 0);

// Later, after the provider has published the revelation:
bytes32 randomNumber = dice.reveal(provider, seq, userRandom, providerRevelation);
```

> **Note:** In V2, all `requestV2()` calls set the callback status to `CALLBACK_NOT_STARTED`. Use `reveal()` only if you explicitly don't want a callback — the reveal function checks the status and will revert with `InvalidRevealCall` if you mix them up.

### Pattern C: TypeScript SDK

The `@dice-protocol/sdk` package provides a TypeScript interface for off-chain integration.

```typescript
import { DiceProtocol, ethers } from '@dice-protocol/sdk';

// Initialize
const dice = new DiceProtocol({
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  contractAddress: '0x777Af3fE41855Cb9E06Ae51ed7941F4A4241690F',
});

// Load wallet
const wallet = new ethers.Wallet('YOUR_PRIVATE_KEY', dice.provider);

// --- Request randomness ---
// 1. Generate a random user contribution (keep this secret!)
const userRandom = DiceProtocol.generateUserRandom();

// 2. Submit the request
const seq = await dice.requestRandom(wallet, undefined, userRandom, 100_000);
console.log('Request sequence:', seq);

// --- Listen for the reveal ---
dice.onReveal((event) => {
  if (event.sequenceNumber === seq) {
    console.log('Random number:', event.randomNumber);
    console.log('Callback failed:', event.callbackFailed);
    console.log('Gas used:', event.callbackGasUsed.toString());
    dice.removeAllListeners();
  }
});

// --- Read contract state ---
const provider = await dice.getDefaultProvider();
const fee = await dice.getFee(provider);
console.log('Fee:', ethers.formatEther(fee), 'ETH');

const providerInfo = await dice.getProviderInfo(provider);
console.log('Sequence:', providerInfo.sequenceNumber.toString());
console.log('Chain remaining:',
  (providerInfo.endSequenceNumber - providerInfo.sequenceNumber).toString()
);
```

### Pattern D: Off-Chain Provider / Keeper

If you're running a provider (keeper) service, you need to:

1. **Generate a hash chain** off-chain and register it:
```typescript
const seed = '0x' + crypto.randomBytes(32).toString('hex');
const chain = DiceProtocol.generateHashChain(seed, 50_000);

// Register (admin only — uses registerFor on-chain)
// commitment = chain.commitment (x₀)
// revelations[0] = x₁ (first reveal), revelations[1] = x₂, ...
```

2. **Watch for `Requested` events** and submit reveals:
```typescript
dice.onRequest(async (event) => {
  // Look up the providerRevelation for this sequence number
  const providerRevelation = chain.revelations[event.sequenceNumber - 1];

  // Submit the reveal (triggers callback on the requesting contract)
  await dice.revealWithCallback(
    keeperWallet,
    event.sequenceNumber,
    event.userContribution,  // The user's original random number
    providerRevelation,       // The hash chain value for this sequence
  );
});
```

### Pattern E: PRNG Utility

The `PRNG` contract helps derive multiple random values from a single `bytes32` random number:

```solidity
import {PRNG} from "@dice-protocol/sdk/PRNG.sol";

contract DiceGame is IEntropyConsumer, PRNG {
    constructor(address _dice, address _provider)
        IEntropyConsumer()
        PRNG(bytes32(0))
    {
        dice = IEntropy(_dice);
        provider = _provider;
    }

    function entropyCallback(uint64 seq, address, bytes32 randomNumber) internal override {
        // Seed the PRNG with the delivered random number
        setSeed(randomNumber);

        // Roll 3 dice
        uint256 roll1 = randUintRange(1, 7);  // [1, 6]
        uint256 roll2 = randUintRange(1, 7);
        uint256 roll3 = randUintRange(1, 7);

        // Shuffle a deck
        uint256[] memory deck = randomPermutation(52);
    }
}
```

---

## 9. Fee Handling

### Fee Model

Dice Protocol uses a **single flat fee model**:

| Property | Value |
|----------|-------|
| Fee per request | 0.000055 ETH (55,000,000,000,000 wei) |
| Fee destination | Protocol vault |
| Per-provider fees | Not supported (always reverts) |
| Fee managers | Not supported (always reverts) |

### Checking the Fee

```solidity
// On-chain
uint128 fee = dice.getFee(provider);
// or
uint128 fee = dice.getFeeV2(provider, gasLimit);
```

```typescript
// Off-chain (SDK)
const fee = await dice.getFee(provider);
```

All fee query functions return the same value regardless of provider or gas limit.

### Paying the Fee

The fee must be sent as `msg.value` with the `requestV2()` call:

```solidity
uint128 fee = dice.getFee(provider);
dice.requestV2{value: fee}(provider, userRandom, gasLimit);
```

If `msg.value < fee`, the transaction reverts with `InsufficientFee()`. Excess `msg.value` is added to the accrued fees (no refund mechanism — send exactly the fee amount).

### Fee Withdrawal

Fees accumulate in the contract until withdrawn by the admin:

```solidity
// Admin withdraws all accrued fees to the vault
uint128 accrued = dice.getAccruedFees();
dice.withdrawFees(accrued);
```

The vault address is set at deployment and receives all withdrawn fees. There is no way to change the vault after deployment (it's stored in immutable state).

### Mainnet Fee Configuration

| Parameter | Value |
|-----------|-------|
| Fee | 0.000055 ETH |
| Vault | `0x918EAF0b2589710B0D85ef48C12a343E68263841` |
| Admin | `0x4ACD2C88a239a924E47Fc4995114ca1Bb0CA3CaD` |

---

## 10. Gas Considerations

### Request Gas

A `requestV2()` call typically costs ~100k–150k gas:
- Provider lookup and sequence assignment
- Commitment hash computation
- Request storage (2–3 storage slots written)
- `Requested` event emission

### Reveal Gas

A `revealWithCallback()` call costs:
- Base reveal: ~80k–120k gas
- Callback execution: up to `gasLimit` (default 100k if provider has `defaultGasLimit` set)
- Total: base + callback + event emission

If the callback gas limit is set (non-zero `gasLimit10k`), the contract uses `ExcessivelySafeCall` to isolate callback failures. The callback runs with exactly `gasLimit10k × 10,000` gas. If the callback uses less, the remainder is not refunded to the caller.

### Gas Limit Rounding

Callback gas limits are rounded up to the nearest 10,000 gas:

```solidity
// 95,000 gas → rounds to 100,000 (gasLimit10k = 10)
// 100,001 gas → rounds to 110,000 (gasLimit10k = 11)
// 0 gas → uses provider's defaultGasLimit
```

Maximum gas limit: **655,350,000** (`uint16.max × 10,000`). Exceeding this reverts with `MaxGasLimitExceeded()`.

### Commitment Advancement (Gas Optimization)

Without `advanceProviderCommitment()`, each reveal must hash the provider's revelation `numHashes` times. As the provider's current commitment falls further behind the request sequence, `numHashes` grows, increasing gas cost per reveal.

Call `advanceProviderCommitment()` periodically to move the on-chain commitment forward, resetting `numHashes` for subsequent requests. This is especially important for high-throughput use cases.

### Storage Slot Pre-fill

The constructor accepts `prefillRequestStorage`. When `true`, all 32 primary request slots are pre-written with non-zero values. This ensures consistent gas costs for request allocation (no cold-to-warm storage slot penalty on first use). Recommended for production deployments.

---

## 11. Testing Guide

### Running Foundry Tests

```bash
cd contracts

# Run all tests
forge test

# Run with verbose output
forge test -vvv

# Run a specific test file
forge test --match-contract DiceEntropyFullTest

# Run a specific test
forge test --match-test test_RequestAndReveal_Single

# Generate gas report
forge test --gas-report
```

### Test Structure

The test suite is in `contracts/test/`:

| File | Description |
|------|-------------|
| `DiceEntropy.t.sol` | Core tests: registration, request/reveal, fee collection, error cases |
| `DiceEntropyFull.t.sol` | Full suite: concurrent requests, out-of-order reveals, admin functions, provider config, overflow, reentrancy |

### Test Categories

**Provider Registration:**
- New provider registration
- Commitment rotation
- Zero chain length reverts
- Unauthorized registration reverts

**Request + Reveal Flow:**
- Single request/reveal cycle
- Multiple sequential requests
- Concurrent requests (5 in-flight, revealed in order)
- Out-of-order reveals (reverse order)
- Double reveal reverts (`NoSuchRequest`)

**Fee Management:**
- Fee collection (single-fee model)
- Fee withdrawal to vault
- Insufficient fee reverts
- `setFee()` admin-only
- Per-provider fee functions always revert

**Reveal Edge Cases:**
- Incorrect provider contribution reverts
- Incorrect user contribution reverts
- Non-existent request reverts

**Admin Functions:**
- Propose and accept admin transfer
- Non-admin calls revert
- Set default provider

**Provider Configuration:**
- Set URI, max num hashes, default gas limit

**Constructor Validation:**
- Zero admin reverts
- Zero default provider reverts
- Zero vault reverts

**Out of Randomness:**
- Exhausting the hash chain reverts

**Commitment Advancement:**
- Successful advancement
- Too-old advancement reverts
- Wrong revelation reverts

**Request Overflow:**
- More than 32 concurrent requests (tests overflow mapping)

**Callback Handling:**
- Callback with gas limit set
- Callback revert handling
- Reentrancy during callback

### Writing Your Own Tests

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {DiceEntropy} from "@dice-protocol/DiceEntropy.sol";
import {DiceErrors} from "@dice-protocol/sdk/DiceErrors.sol";

contract MyConsumerTest is Test {
    DiceEntropy public dice;
    address admin = address(0xBEEF1);
    address provider = address(0xBEEF4);
    address vault = address(0xBEEF5);

    bytes32[] chain;

    function setUp() public {
        // Deploy with zero fee for testing
        dice = new DiceEntropy(admin, 0, provider, false, vault, bytes32(0), 0, new bytes(0));

        // Build a 100-value hash chain
        chain = new bytes32[](100);
        chain[99] = keccak256(abi.encodePacked("seed", block.timestamp));
        for (uint256 i = 99; i > 0; i--) {
            chain[i - 1] = keccak256(bytes.concat(chain[i]));
        }

        // Register provider (admin-only)
        vm.prank(admin);
        dice.registerFor(provider, 0, chain[0], "", 100, "");
    }

    function test_MyFlow() public {
        bytes32 userRandom = keccak256("my test random");
        uint64 seq = dice.requestV2{value: 0}(provider, userRandom, 0);

        vm.prank(provider);
        dice.revealWithCallback(provider, seq, userRandom, chain[seq]);
    }
}
```

### SDK Smoke Test

```bash
cd sdk
npm run build
node dist/test.js
```

This verifies the SDK can read from the mainnet contract (default provider, fees, provider info, utility functions).

---

## 12. Deployment Guide

### Mainnet Deployment (Already Complete)

The contract is deployed and verified on Robinhood Chain Mainnet:

| Property | Value |
|----------|-------|
| Contract Address | `0x777Af3fE41855Cb9E06Ae51ed7941F4A4241690F` |
| Chain ID | 4663 |
| RPC URL | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` |
| Solidity Version | 0.8.24 |
| Optimizer | Enabled (200 runs) |
| Fee | 0.000055 ETH (55,000,000,000,000 wei) |
| Vault | `0x918EAF0b2589710B0D85ef48C12a343E68263841` |
| Admin | `0x4ACD2C88a239a924E47Fc4995114ca1Bb0CA3CaD` |
| Default Provider | `0x8741b8a825644D9Ef18Faf2DAB5e9b47B900F2b6` |
| Hash Chain Length | 50,000 values |
| Default Gas Limit | 100,000 |

### Deploying a New Instance

If you need to deploy Dice Protocol to a new chain or environment:

#### 1. Build the Contracts

```bash
cd contracts
forge build
```

#### 2. Generate a Hash Chain

```typescript
import { DiceProtocol } from '@dice-protocol/sdk';
import crypto from 'crypto';

const seed = '0x' + crypto.randomBytes(32).toString('hex');
const chain = DiceProtocol.generateHashChain(seed, 50_000);

console.log('Commitment (x₀):', chain.commitment);
console.log('First reveal (x₁):', chain.revelations[0]);
console.log('Total reveals:', chain.revelations.length);
// Store the seed and revelations securely — you'll need them for the keeper service
```

#### 3. Deploy with Forge

```bash
forge create DiceEntropy \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    $ADMIN_ADDRESS \
    55000000000000 \
    $PROVIDER_ADDRESS \
    true \
    $VAULT_ADDRESS \
    $COMMITMENT_ROOT \
    50000 \
    0x \
  --verify \
  --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api
```

**Constructor arguments:**

| Position | Name | Example Value |
|----------|------|---------------|
| 1 | `admin` | `0x4ACD...` |
| 2 | `feeInWei` | `55000000000000` (0.000055 ETH) |
| 3 | `defaultProvider` | `0x8741...` |
| 4 | `prefillRequestStorage` | `true` |
| 5 | `vault` | `0x918E...` |
| 6 | `providerCommitment` | `0x3ee6b22e...` (hash chain root x₀) |
| 7 | `providerChainLength` | `50000` |
| 8 | `providerCommitmentMetadata` | `0x` (empty) |

If `providerChainLength > 0`, the provider is auto-registered in the constructor — no separate `registerFor()` transaction needed.

#### 4. Verify Deployment

```bash
# Check the contract is deployed
cast call $CONTRACT_ADDRESS "getDefaultProvider()" --rpc-url $RPC_URL

# Check the fee
cast call $CONTRACT_ADDRESS "getProtocolFee()" --rpc-url $RPC_URL

# Check provider info
cast call $CONTRACT_ADDRESS "getProviderInfoV2(address)(uint128,uint128,bytes32,uint64,bytes,bytes,uint64,uint64,bytes32,uint64,address,uint32,uint32)" \
  $PROVIDER_ADDRESS --rpc-url $RPC_URL
```

#### 5. Start the Keeper Service

The keeper service watches for `Requested` events and submits `revealWithCallback()` transactions. It needs:
- The provider's private key (hot wallet, funded with ETH for gas)
- The hash chain revelations (generated in step 2)
- The contract address and RPC URL

The keeper monitors `Requested` events, looks up the corresponding hash chain value for the sequence number, and submits the reveal transaction.

### Wallet Security Model

| Role | Address | Type | Purpose |
|------|---------|------|---------|
| Admin | `0x4ACD...` | Cold | Set fee, withdraw fees, transfer admin |
| Vault | `0x918E...` | Cold | Receive protocol fees (receive-only) |
| Provider/Keeper | `0x8741...` | Hot | Submit reveal transactions (needs ETH for gas) |

### Environment Variables

```env
# Contract
DICE_ENTROPY_ADDRESS=0x777Af3fE41855Cb9E06Ae51ed7941F4A4241690F
RH_CHAIN_RPC_MAINNET=https://rpc.mainnet.chain.robinhood.com
RH_CHAIN_WS_MAINNET=wss://ws.mainnet.chain.robinhood.com
RH_CHAIN_CHAIN_ID=4663

# Provider / Keeper
KEEPER_PRIVATE_KEY=0x...
PROVIDER_SECRET=<hash chain seed>

# Fee
DICE_FEE_WEI=55000000000000
DICE_VAULT_ADDRESS=0x918EAF0b2589710B0D85ef48C12a343E68263841
```

---

## Appendix: Quick Reference

### Contract Addresses

| Chain | Chain ID | Contract Address | Status |
|-------|----------|-----------------|--------|
| Robinhood Chain Mainnet | 4663 | `0x777Af3fE41855Cb9E06Ae51ed7941F4A4241690F` | ✅ Live |
| Robinhood Chain Testnet | 46630 | `0x777Af3fE41855Cb9E06Ae51ed7941F4A4241690F` | ✅ Live |

### Import Paths (Solidity)

```
@dice-protocol/DiceEntropy.sol              — Main contract
@dice-protocol/DiceState.sol                — Storage layout
@dice-protocol/sdk/IEntropy.sol             — Full interface
@dice-protocol/sdk/IEntropyV2.sol           — V2 interface
@dice-protocol/sdk/IEntropyConsumer.sol     — Consumer base contract
@dice-protocol/sdk/DiceStructsV2.sol        — Struct definitions
@dice-protocol/sdk/DiceErrors.sol           — Error definitions
@dice-protocol/sdk/DiceEventsV2.sol         — Event definitions
@dice-protocol/sdk/DiceStatusConstants.sol  — Callback status constants
@dice-protocol/sdk/PRNG.sol                 — PRNG utility
```

### SDK Import (TypeScript)

```typescript
import {
  DiceProtocol,
  ethers,
  type DiceProtocolConfig,
  type ProviderInfo,
  type RequestInfo,
  type RevealEvent,
  type RequestEvent,
} from '@dice-protocol/sdk';
```

### Common Workflows Cheat Sheet

```
Request randomness (on-chain):
  fee = dice.getFee(provider)
  seq = dice.requestV2{value: fee}(provider, userRandom, gasLimit)

Receive randomness (on-chain callback):
  function entropyCallback(uint64 seq, address provider, bytes32 randomNumber) internal override

Read a request:
  req = dice.getRequestV2(provider, seq)

Check provider health:
  info = dice.getProviderInfoV2(provider)
  remaining = info.endSequenceNumber - info.sequenceNumber

Withdraw fees (admin):
  dice.withdrawFees(amount)
```
