const { ethers } = require("ethers");
const pharos = require("./pharos_rpc");

const STATE_MAP = {
  0: "Pending", 1: "Active", 2: "Canceled",
  3: "Defeated", 4: "Succeeded", 5: "Queued",
  6: "Expired", 7: "Executed",
};

async function getResults(governorAddress, proposalId, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);

  const votes = await gov.proposalVotes(proposalId);
  const stateCode = await gov.state(proposalId);
  const totalBN = votes.forVotes.add(votes.againstVotes).add(votes.abstainVotes);
  const pct = (v) => totalBN.gt(0) ? (v.mul(10000).div(totalBN).toNumber() / 100).toFixed(1) : "0.0";

  let currentBlock;
  try {
    const provider = pharos.getProvider(network);
    currentBlock = await provider.getBlockNumber();
  } catch (_) { currentBlock = 0; }

  // Get deadline and startBlock from events or OZ v5 getters
  let startBlock = 0, deadlineBlock = 0;
  try { deadlineBlock = Number(await gov.proposalDeadline(proposalId)); } catch (_) {}
  try { startBlock = Number(await gov.proposalSnapshot(proposalId)); } catch (_) {}

  if (!deadlineBlock || !startBlock) {
    try {
      const events = await pharos.queryProposalCreatedEvents(gov);
      const match = events.find((e) => e.proposalId === String(proposalId));
      if (match) {
        if (!startBlock) startBlock = Number(match.voteStart);
        if (!deadlineBlock) deadlineBlock = Number(match.voteEnd);
      }
    } catch (_) {}
  }

  const blocksRemaining = deadlineBlock - currentBlock;

  let quorumVal = "0";
  try { quorumVal = (await gov.quorum(startBlock || 0)).toString(); } catch (_) {}
  const quorumBN = ethers.BigNumber.from(quorumVal || "0");

  let description = "";
  try {
    const events = await pharos.queryProposalCreatedEvents(gov);
    const match = events.find((e) => e.proposalId === String(proposalId));
    if (match) description = match.description;
  } catch (_) {}

  return {
    id: String(proposalId),
    description: description.slice(0, 300),
    state: STATE_MAP[stateCode] || `Unknown(${stateCode})`,
    stateCode,
    forVotes: votes.forVotes.toString(),
    againstVotes: votes.againstVotes.toString(),
    abstainVotes: votes.abstainVotes.toString(),
    totalVotes: totalBN.toString(),
    forPct: pct(votes.forVotes),
    againstPct: pct(votes.againstVotes),
    abstainPct: pct(votes.abstainVotes),
    quorum: quorumVal,
    quorumPct: quorumBN.gt(0) ? (votes.forVotes.mul(10000).div(quorumBN).toNumber() / 100).toFixed(1) : "0.0",
    quorumMet: quorumBN.gt(0) && votes.forVotes.gte(quorumBN),
    currentBlock,
    deadlineBlock,
    blocksRemaining: Math.max(0, blocksRemaining),
    votingEnded: stateCode !== 1 || blocksRemaining <= 0,
    network,
    governor: governorAddress,
  };
}

if (require.main === module) {
  const addr = process.argv[2];
  const pid = process.argv[3];
  const net = process.argv[4] || "atlantic-testnet";

  if (!addr || !pid) {
    console.error("Usage: node get_results.js <governor_address> <proposal_id> [network]");
    process.exit(1);
  }

  getResults(addr, pid, net).then((d) => {
    console.log(`\n📊 Vote Results — Proposal #${d.id}`);
    console.log(`Network: ${d.network}`);
    console.log(`State: ${d.state}`);
    if (d.description) console.log(`\n${d.description}`);

    console.log(`\n  ✅ For:      ${String(pharos.formatRawVotes(d.forVotes)).padStart(16)}  (${d.forPct}%)`);
    console.log(`  ❌ Against:  ${String(pharos.formatRawVotes(d.againstVotes)).padStart(16)}  (${d.againstPct}%)`);
    console.log(`  ⬜ Abstain:  ${String(pharos.formatRawVotes(d.abstainVotes)).padStart(16)}  (${d.abstainPct}%)`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  Total:       ${String(pharos.formatRawVotes(d.totalVotes)).padStart(16)}`);
    console.log(`  Quorum:      ${String(pharos.formatRawVotes(d.quorum)).padStart(16)}  (${d.quorumPct}% filled) ${d.quorumMet ? "✅" : "❌"}`);

    if (d.votingEnded) {
      console.log(`\n  ⏰ Voting has ended.`);
    } else {
      console.log(`\n  ⏳ ${d.blocksRemaining.toLocaleString()} blocks remaining (current: ${d.currentBlock.toLocaleString()}, deadline: ${d.deadlineBlock.toLocaleString()})`);
    }
  }).catch(console.error);
}

module.exports = { getResults };
