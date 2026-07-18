/**
 * Quick smoke test — verifies the SDK can read from the testnet contract.
 */
const { DiceProtocol, ethers } = require('./index');

async function main() {
  const dice = new DiceProtocol({
    rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
    contractAddress: '0x2AD7fc99e3D8A8Da72802936DD5145Bf672206b0',
  });

  console.log('Contract:', dice.getAddress());

  // Read default provider
  const defaultProvider = await dice.getDefaultProvider();
  console.log('Default Provider:', defaultProvider);

  // Read protocol fee
  const protocolFee = await dice.getProtocolFee();
  console.log('Protocol Fee:', protocolFee.toString(), 'wei');

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
  console.log('  Last (x_9 = seed):', chain.revelations[8]);

  console.log('\n✅ SDK smoke test passed');
}

main().catch(console.error);
