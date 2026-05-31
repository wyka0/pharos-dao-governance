const pharos = require("./pharos_rpc");
const { ethers } = require("ethers");

async function simulateProposal(governorAddress, proposalId, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);
  const provider = pharos.getProvider(network);

  const stateCode = await gov.state(proposalId);
  const stateNames = { 0:"Pending",1:"Active",2:"Canceled",3:"Defeated",4:"Succeeded",5:"Queued",6:"Expired",7:"Executed" };

  let proposer = "unknown";
  try { proposer = await gov.proposalProposer(proposalId); } catch (_) {}

  let proposalThreshold;
  try { proposalThreshold = await gov.proposalThreshold(); } catch (_) { proposalThreshold = ethers.BigNumber.from(0); }

  let votes;
  try { votes = await gov.proposalVotes(proposalId); } catch (_) {
    votes = { forVotes: ethers.BigNumber.from(0), againstVotes: ethers.BigNumber.from(0), abstainVotes: ethers.BigNumber.from(0) };
  }

  const currentBlock = await provider.getBlockNumber();

  let startBlock, endBlock;
  try { startBlock = Number(await gov.proposalSnapshot(proposalId)); } catch (_) { startBlock = 0; }
  try { endBlock = Number(await gov.proposalDeadline(proposalId)); } catch (_) { endBlock = 0; }

  const blocksRemaining = Math.max(0, endBlock - currentBlock);
  const totalVotes = votes.forVotes.add(votes.againstVotes).add(votes.abstainVotes);
  const forPct = totalVotes.eq(0) ? 0 : votes.forVotes.mul(10000).div(totalVotes).toNumber() / 100;
  const againstPct = totalVotes.eq(0) ? 0 : votes.againstVotes.mul(10000).div(totalVotes).toNumber() / 100;
  const quorum = await gov.quorum(Math.max(0, startBlock));
  const quorumMet = votes.forVotes.gte(quorum);

  return {
    proposalId: proposalId.toString(),
    state: stateNames[stateCode] || "Unknown",
    stateCode: Number(stateCode),
    proposer,
    currentBlock,
    startBlock,
    endBlock,
    blocksRemaining,
    forVotes: votes.forVotes.toString(),
    againstVotes: votes.againstVotes.toString(),
    abstainVotes: votes.abstainVotes.toString(),
    forPct,
    againstPct,
    quorum: quorum.toString(),
    quorumMet,
    proposalThreshold: proposalThreshold.toString(),
    network,
    governor: governorAddress,
  };
}

module.exports = { simulateProposal };

if (require.main === module) {
  const addr = process.argv[2];
  const pid = process.argv[3];
  const net = process.argv[4] || "atlantic-testnet";
  if (!addr || !pid) {
    console.error("Usage: node simulate_proposal.js <governor_address> <proposal_id> [network]");
    process.exit(1);
  }
  simulateProposal(addr, pid, net).then((d) => {
    console.log(`\n📊 Proposal Simulation — #${d.proposalId}`);
    console.log(`Network: ${d.network}`);
    console.log(`State:   ${d.state} (code: ${d.stateCode})`);
    console.log(`Proposer: ${d.proposer}`);
    console.log(`\n📅 Timeline`);
    console.log(`  Current Block: ${d.currentBlock}`);
    console.log(`  Start Block:   ${d.startBlock}`);
    console.log(`  End Block:     ${d.endBlock}`);
    console.log(`  Remaining:     ${d.blocksRemaining} blocks`);
    console.log(`\n🗳️  Votes`);
    console.log(`  For:     ${pharos.formatRawVotes(d.forVotes)}`);
    console.log(`  Against: ${pharos.formatRawVotes(d.againstVotes)}`);
    console.log(`  Abstain: ${pharos.formatRawVotes(d.abstainVotes)}`);
    console.log(`  For %:   ${d.forPct.toFixed(1)}%`);
    console.log(`\n🎯 Quorum`);
    console.log(`  Required: ${pharos.formatRawVotes(d.quorum)}`);
    console.log(`  Met:      ${d.quorumMet ? "✅ Yes" : "❌ No"}`);
    console.log(`  Threshold: ${pharos.formatRawVotes(d.proposalThreshold)}`);
  }).catch(console.error);
}
