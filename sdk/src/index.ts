/**
 * Dice Protocol SDK
 * Trustless RNG infrastructure for Robinhood Chain.
 *
 * Usage:
 *   import { DiceProtocol } from '@dice-protocol/sdk';
 *
 *   const dice = new DiceProtocol({
 *     rpcUrl: 'https://rpc.testnet.chain.robinhood.com/rpc',
 *     contractAddress: '0x777Af3fE41855Cb9E06Ae51ed7941F4A4241690F',
 *   });
 *
 *   // Request randomness
 *   const seq = await dice.requestRandom(providerAddress, userRandom, signer);
 *
 *   // Listen for reveals
 *   dice.onReveal((event) => {
 *     console.log('Random number:', event.randomNumber);
 *   });
 */

import { ethers, Contract, JsonRpcProvider, Wallet, EventLog, Interface } from 'ethers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const abi = require('./abi.json') as any[];

export interface DiceProtocolConfig {
  rpcUrl: string;
  contractAddress: string;
  chainId?: number;
}

export interface ProviderInfo {
  feeInWei: bigint;
  accruedFeesInWei: bigint;
  originalCommitment: string;
  originalCommitmentSequenceNumber: bigint;
  commitmentMetadata: string;
  uri: string;
  endSequenceNumber: bigint;
  sequenceNumber: bigint;
  currentCommitment: string;
  currentCommitmentSequenceNumber: bigint;
  feeManager: string;
  maxNumHashes: number;
  defaultGasLimit: number;
}

export interface RequestInfo {
  provider: string;
  sequenceNumber: bigint;
  numHashes: number;
  commitment: string;
  blockNumber: bigint;
  requester: string;
  useBlockhash: boolean;
  callbackStatus: number;
  gasLimit10k: number;
}

export interface RevealEvent {
  provider: string;
  caller: string;
  sequenceNumber: bigint;
  randomNumber: string;
  userContribution: string;
  providerContribution: string;
  callbackFailed: boolean;
  callbackReturnValue: string;
  callbackGasUsed: bigint;
}

export interface RequestEvent {
  provider: string;
  caller: string;
  sequenceNumber: bigint;
  userContribution: string;
  gasLimit: bigint;
}

export class DiceProtocol {
  private provider: JsonRpcProvider;
  private contract: Contract;
  private iface: Interface;

  constructor(config: DiceProtocolConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.contract = new Contract(config.contractAddress, abi, this.provider);
    this.iface = new Interface(abi);
  }

  /**
   * Get the contract address
   */
  getAddress(): string {
    return this.contract.target as string;
  }

  /**
   * Get the default provider address
   */
  async getDefaultProvider(): Promise<string> {
    return await this.contract.getDefaultProvider();
  }

  /**
   * Get the fee for a request
   * @param provider The provider address (optional, uses default)
   * @param gasLimit The gas limit for the callback (optional)
   */
  async getFee(provider?: string, gasLimit?: number): Promise<bigint> {
    const p = provider || (await this.getDefaultProvider());
    if (gasLimit !== undefined) {
      return await this.contract.getFeeV2(p, gasLimit);
    }
    return await this.contract.getFee(p);
  }

  /**
   * Get provider information
   */
  async getProviderInfo(provider: string): Promise<ProviderInfo> {
    const info = await this.contract.getProviderInfoV2(provider);
    return {
      feeInWei: info[0],
      accruedFeesInWei: info[1],
      originalCommitment: info[2],
      originalCommitmentSequenceNumber: info[3],
      commitmentMetadata: info[4],
      uri: info[5],
      endSequenceNumber: info[6],
      sequenceNumber: info[7],
      currentCommitment: info[8],
      currentCommitmentSequenceNumber: info[9],
      feeManager: info[10],
      maxNumHashes: Number(info[11]),
      defaultGasLimit: Number(info[12]),
    };
  }

  /**
   * Get a request by provider and sequence number
   */
  async getRequest(provider: string, sequenceNumber: bigint): Promise<RequestInfo> {
    const req = await this.contract.getRequestV2(provider, sequenceNumber);
    return {
      provider: req[0],
      sequenceNumber: req[1],
      numHashes: Number(req[2]),
      commitment: req[3],
      blockNumber: req[4],
      requester: req[5],
      useBlockhash: req[6],
      callbackStatus: Number(req[7]),
      gasLimit10k: Number(req[8]),
    };
  }

  /**
   * Get accrued treasury fees
   */
  async getAccruedTreasuryFees(): Promise<bigint> {
    return await this.contract.getAccruedTreasuryFees();
  }

  /**
   * Get the current treasury fee per request
   */
  async getTreasuryFee(): Promise<bigint> {
    return await this.contract.getTreasuryFee();
  }

  // ============================================================
  //                    WRITE OPERATIONS
  // ============================================================

  /**
   * Request a random number from a provider.
   * @param provider The provider address (optional, uses default)
   * @param userRandomNumber 32-byte random number (generate with crypto.getRandomValues)
   * @param gasLimit Gas limit for the callback (optional, 0 = provider default)
   * @param signer A Wallet or signer to submit the transaction
   * @returns The assigned sequence number
   */
  async requestRandom(
    signer: Wallet,
    provider: string | undefined,
    userRandomNumber: string,
    gasLimit: number = 0,
  ): Promise<bigint> {
    const connectedContract = new Contract(
      this.contract.target as string,
      abi,
      signer,
    );
    const p = provider || (await this.getDefaultProvider());
    const fee = await this.getFee(p, gasLimit);
    const tx = await connectedContract.requestV2(p, userRandomNumber, gasLimit, { value: fee });
    const receipt = await tx.wait();
    // Parse the Requested event to get the sequence number
    const logs = receipt.logs.map((log: any) => {
      try { return this.iface.parseLog(log); } catch { return null; }
    }).filter((e: any) => e && e.name === 'Requested');
    if (logs.length === 0) throw new Error('No Requested event in receipt');
    return (logs[0] as any).args.sequenceNumber;
  }

  /**
   * Reveal the provider's random number (called by the provider/keeper).
   * @param signer The provider's wallet
   * @param sequenceNumber The request sequence number
   * @param userRandomNumber The user's random number (from the request)
   * @param providerRevelation The provider's hash chain value for this sequence
   */
  async revealWithCallback(
    signer: Wallet,
    sequenceNumber: bigint,
    userRandomNumber: string,
    providerRevelation: string,
  ): Promise<string> {
    const connectedContract = new Contract(
      this.contract.target as string,
      abi,
      signer,
    );
    const provider = await signer.getAddress();
    const tx = await connectedContract.revealWithCallback(
      provider,
      sequenceNumber,
      userRandomNumber,
      providerRevelation,
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Register as a randomness provider.
   * @param signer The provider's wallet
   * @param feeInWei Per-request fee in wei
   * @param commitment The hash chain commitment (x_0)
   * @param chainLength Number of values in the hash chain
   * @param uri Optional URI for revelation retrieval
   */
  async registerProvider(
    signer: Wallet,
    feeInWei: bigint,
    commitment: string,
    chainLength: number,
    uri: string = '',
  ): Promise<string> {
    const connectedContract = new Contract(
      this.contract.target as string,
      abi,
      signer,
    );
    const tx = await connectedContract.register(feeInWei, commitment, '0x', chainLength, uri);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Withdraw accumulated provider fees.
   * @param signer The provider's wallet
   * @param amount Amount to withdraw in wei
   */
  async withdrawFees(signer: Wallet, amount: bigint): Promise<string> {
    const connectedContract = new Contract(
      this.contract.target as string,
      abi,
      signer,
    );
    const tx = await connectedContract.withdraw(amount);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  // ============================================================
  //                    EVENT LISTENERS
  // ============================================================

  /**
   * Listen for new randomness requests.
   */
  onRequest(callback: (event: RequestEvent) => void): void {
    this.contract.on('Requested', (provider, caller, sequenceNumber, userContribution, gasLimit) => {
      callback({
        provider,
        caller,
        sequenceNumber,
        userContribution,
        gasLimit,
      });
    });
  }

  /**
   * Listen for reveal events (random numbers delivered).
   */
  onReveal(callback: (event: RevealEvent) => void): void {
    this.contract.on('Revealed', (provider, caller, sequenceNumber, randomNumber, userContribution, providerContribution, callbackFailed, callbackReturnValue, callbackGasUsed) => {
      callback({
        provider,
        caller,
        sequenceNumber,
        randomNumber,
        userContribution,
        providerContribution,
        callbackFailed,
        callbackReturnValue,
        callbackGasUsed,
      });
    });
  }

  /**
   * Stop all event listeners.
   */
  removeAllListeners(): void {
    this.contract.removeAllListeners();
  }

  // ============================================================
  //                    UTILITY FUNCTIONS
  // ============================================================

  /**
   * Generate a random 32-byte value (for user contribution).
   */
  static generateUserRandom(): string {
    const crypto = require('crypto');
    return '0x' + crypto.randomBytes(32).toString('hex');
  }

  /**
   * Compute the user commitment from a random number.
   */
  static computeUserCommitment(userRandom: string): string {
    return ethers.keccak256(ethers.hexlify(userRandom));
  }

  /**
   * Construct a provider commitment from a revelation and the number of hashes.
   * Repeatedly hashes the revelation `numHashes` times.
   */
  static constructProviderCommitment(numHashes: number, revelation: string): string {
    let current = revelation;
    for (let i = 0; i < numHashes; i++) {
      current = ethers.keccak256(ethers.toBeHex(current));
    }
    return current;
  }

  /**
   * Generate a full hash chain from a seed.
   * @param seed The random seed (32 bytes hex)
   * @param length Number of values in the chain
   * @returns { commitment: x_0, revelations: [x_1, x_2, ...] }
   */
  static generateHashChain(seed: string, length: number): { commitment: string; revelations: string[] } {
    const revelations: string[] = [];
    let current = seed;
    // x_{length-1} = seed, x_i = hash(x_{i+1}), ..., x_0 = hash(x_1)
    for (let i = 0; i < length - 1; i++) {
      current = ethers.keccak256(ethers.hexlify(current));
      revelations.push(current);
    }
    // revelations is now [x_{length-2}, x_{length-3}, ..., x_1, x_0]
    // Wait, that's wrong. Let me fix the order.
    // x_{n-1} = seed (the last value)
    // x_{n-2} = hash(x_{n-1})
    // ...
    // x_0 = hash(x_1) — this is the commitment
    // x_1 is the first reveal, x_2 is the second, etc.
    revelations.reverse(); // now [x_0, x_1, ..., x_{n-2}]
    // Wait — we need to re-check. Actually:
    // We start with seed = x_{n-1}. We hash forward:
    // i=0: current = hash(seed) = x_{n-2}
    // i=1: current = hash(x_{n-2}) = x_{n-3}
    // ...
    // i=n-2: current = hash(x_1) = x_0
    // So revelations before reverse = [x_{n-2}, x_{n-3}, ..., x_0]
    // After reverse: [x_0, x_1, ..., x_{n-2}]
    // But x_0 is the commitment, and we reveal x_1, x_2, etc.
    // So commitment = revelations[0] after reverse = x_0 ✓
    // And reveal values are revelations[1] = x_1, revelations[2] = x_2, etc. ✓
    // But wait — we also need x_{n-1} which is the seed itself.
    // Actually, the reveal values should be x_1 through x_{n-1}.
    // x_{n-1} = seed, but we never pushed it to revelations.
    // Let me just simplify:

    return {
      commitment: revelations[0], // x_0
      revelations: revelations.slice(1).concat([seed]), // x_1, x_2, ..., x_{n-1} = seed
    };
  }

  /**
   * Combine user and provider random values.
   */
  static combineRandom(userRandom: string, providerRandom: string, blockHash: string = ethers.ZeroHash): string {
    return ethers.solidityPackedKeccak256(
      ['bytes32', 'bytes32', 'bytes32'],
      [userRandom, providerRandom, blockHash],
    );
  }
}

// Re-export ethers for convenience
export { ethers };