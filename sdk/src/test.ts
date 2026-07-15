/**
 * Quick smoke test — verifies the SDK can read from the testnet contract.
 */
const { DiceProtocol, ethers } = require('./index');

async function main() {
  const dice = new DiceProtocol({
    rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
    contractAddress: '0x777Af3fE41855Cb9E06Ae51ed7941F4A4241690F',
  });

  console.log('Contract:', dice.getAddress());

  // Read default provider
  const defaultProvider = await dice.getDefaultProvider();
  console.log('Default Provider:', defaultProvider);

  // Read treasury fee
  const treasuryFee = await dice.getTreasuryFee();
  console.log('Treasury Fee:', treasuryFee.toString(), 'wei');

  // Read provider info
  const info = await dice.getProviderInfo(defaultProvider);
  console.log('Provider Info:');
  console.log('  Fee:', info.feeInWei.toString(), 'wei');
  console.log('  Sequence:', info.sequenceNumber.toString());
  console.log('  End Sequence:', info.endSequenceNumber.toString());
  console.log('  Commitment:', info.currentCommitment);
  console.log('  Chain remaining:', (info.endSequenceNumber - info.sequenceNumber).toString());

  // Read accrued treasury fees
  const accrued = await dice.getAccruedTreasuryFees();
  console.log('Accrued Treasury Fees:', accrued.toString(), 'wei');

  // Test utility functions
  const userRandom = DiceProtocol.generateUserRandom();
  console.log('\nGenerated user random:', userRandom);
  const commitment = DiceProtocol.computeUserCommitment(userRandom);
  console.log('User commitment:', commitment);

  // Test hash chain generation
  const chain = DiceProtocol.generateHashChain('0x' + 'ab'.repeat(32), 10);
  console.log('\nHash chain (10 values):');
  console.log('  Commitment (x_0):', chain.commitment);
  console.log('  First reveal (x_1):', chain.revelations[0]);
  console.log('  Last (x_9 = seed):', chain.revelations[9]);

  console.log('\n✅ SDK smoke test passed');
}

main().catch(console.error);
