const { ethers } = require("ethers");
const pharos = require("./pharos_rpc");

async function delegateVotes(governorAddress, delegateAddress, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);

  // Discover governance token via token() — standard in OZ Governor
  let tokenAddr;
  try { tokenAddr = await gov.token(); } catch (_) {
    throw new Error(
      "Could not auto-discover governance token. " +
      "The Governor contract may not expose token(). " +
      "Provide the governance token address manually:\n" +
      "  node delegate_votes.js <governor> <delegate> <network> <token_address>"
    );
  }

  if (!tokenAddr || tokenAddr === ethers.constants.AddressZero) {
    throw new Error("Governor token() returned zero address. Cannot delegate.");
  }

  const token = pharos.getGovernanceTokenContract(tokenAddr, network);
  const wallet = pharos.getWallet(network);
  const voterAddress = wallet.address;
  const tokenSigner = token.connect(wallet);

  // Check current delegation
  let currentDelegate;
  try { currentDelegate = await token.delegates(voterAddress); } catch (_) {
    currentDelegate = ethers.constants.AddressZero;
  }

  if (currentDelegate.toLowerCase() === delegateAddress.toLowerCase()) {
    return {
      skipped: true,
      message: `Voting power already delegated to ${delegateAddress}`,
      voterAddress,
      delegateAddress,
      tokenAddress: tokenAddr,
    };
  }

  const tx = await tokenSigner.delegate(delegateAddress);
  const receipt = await tx.wait();

  let tokenSymbol = "";
  try { tokenSymbol = await token.symbol(); } catch (_) { tokenSymbol = "VOTE"; }

  return {
    skipped: false,
    txHash: tx.hash,
    explorerLink: pharos.explorerUrl(tx.hash, network),
    blockNumber: receipt.blockNumber,
    voterAddress,
    delegateAddress,
    previousDelegate: currentDelegate,
    tokenSymbol,
    tokenAddress: tokenAddr,
    network,
  };
}

if (require.main === module) {
  const addr = process.argv[2];
  const delegateAddr = process.argv[3];
  const net = process.argv[4] || "atlantic-testnet";
  const manualTokenAddr = process.argv[5]; // optional override

  if (!addr || !delegateAddr) {
    console.error("Usage: node delegate_votes.js <governor_address> <delegate_address> [network] [token_address_override]");
    console.error("  Delegate to yourself: node delegate_votes.js <governor> <your_address>");
    process.exit(1);
  }

  // Override token address if provided
  if (manualTokenAddr) {
    const { ethers } = require("ethers");
    const pharos2 = require("./pharos_rpc");
    const token = pharos2.getGovernanceTokenContract(manualTokenAddr, net);
    const wallet = pharos2.getWallet(net);

    token.connect(wallet).delegate(delegateAddr).then((tx) => {
      return tx.wait();
    }).then((receipt) => {
      console.log(`\n✅ Delegation successful (manual token override)`);
      console.log(`Tx: ${pharos2.explorerUrl(receipt.transactionHash, net)}`);
    }).catch(console.error);
    return;
  }

  delegateVotes(addr, delegateAddr, net)
    .then((d) => {
      if (d.skipped) {
        console.log(`\nℹ️  ${d.message}`);
        return;
      }
      console.log(`\n✅ Delegation Successful`);
      console.log(`From:    ${d.voterAddress}`);
      console.log(`To:      ${d.delegateAddress}`);
      console.log(`Token:   ${d.tokenSymbol} (${d.tokenAddress})`);
      console.log(`Network: ${d.network}`);
      console.log(`Tx:      ${d.explorerLink}`);
    })
    .catch(console.error);
}

module.exports = { delegateVotes };
