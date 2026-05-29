const pharos = require("./pharos_rpc");

const STATE_MAP = {
  0: "Pending", 1: "Active", 2: "Canceled",
  3: "Defeated", 4: "Succeeded", 5: "Queued",
  6: "Expired", 7: "Executed",
};

async function proposalDetails(governorAddress, proposalId, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);

  // Strategy A: Try GovernorBravo proposals() (returns full struct)
  let prop, stateCode, votes, startBlock, endBlock, proposer;

  try {
    prop = await gov.proposals(proposalId);
    stateCode = await gov.state(proposalId);
    if (prop.voteStart !== undefined || prop.forVotes === undefined) {
      // OZ v5 — proposals() returns (proposer, voteStart, voteEnd) or doesn't exist
      throw new Error("not GovernorBravo");
    }
    // GovernorBravo format
    startBlock = (prop.startBlock || "0").toString();
    endBlock = (prop.endBlock || "0").toString();
    proposer = prop.proposer || "unknown";
    votes = { forVotes: prop.forVotes, againstVotes: prop.againstVotes, abstainVotes: prop.abstainVotes };
  } catch (_) {
    // Strategy B: OZ v5 individual getters + events
    stateCode = await gov.state(proposalId);
    votes = await gov.proposalVotes(proposalId);

    try { proposer = await gov.proposalProposer(proposalId); } catch (_) { proposer = "unknown"; }
    try { startBlock = (await gov.proposalSnapshot(proposalId)).toString(); } catch (_) { startBlock = "0"; }
    try { endBlock = (await gov.proposalDeadline(proposalId)).toString(); } catch (_) { endBlock = "0"; }
  }

  const total = Number(votes.forVotes) + Number(votes.againstVotes) + Number(votes.abstainVotes);
  const pct = (v) => total ? ((Number(v) / total) * 100).toFixed(1) : "0.0";

  // Try to get description from ProposalCreated events
  let description = "";
  try {
    const events = await pharos.queryProposalCreatedEvents(gov);
    const match = events.find((e) => e.proposalId === String(proposalId));
    if (match) description = match.description;
  } catch (_) {}

  // quorum()
  let quorumVal = "0";
  try { quorumVal = (await gov.quorum(startBlock || 0)).toString(); } catch (_) {}

  // token()
  let tokenAddr = "";
  try { tokenAddr = await gov.token(); } catch (_) {}

  return {
    id: String(proposalId),
    proposer,
    startBlock,
    endBlock,
    forVotes: votes.forVotes.toString(),
    againstVotes: votes.againstVotes.toString(),
    abstainVotes: votes.abstainVotes.toString(),
    totalVotes: String(total),
    forPct: pct(votes.forVotes),
    againstPct: pct(votes.againstVotes),
    abstainPct: pct(votes.abstainVotes),
    state: STATE_MAP[stateCode] || `Unknown(${stateCode})`,
    stateCode,
    description: description || "(no description — check explorer)",
    quorum: quorumVal,
    quorumMet: Number(quorumVal) > 0 && Number(votes.forVotes) >= Number(quorumVal),
    governanceToken: tokenAddr || "(not found)",
    network,
  };
}

if (require.main === module) {
  const addr = process.argv[2];
  const pid = process.argv[3];
  const net = process.argv[4] || "atlantic-testnet";

  if (!addr || !pid) {
    console.error("Usage: node proposal_details.js <governor_address> <proposal_id> [network]");
    process.exit(1);
  }

  proposalDetails(addr, pid, net).then((d) => {
    console.log(`\nProposal #${d.id}`);
    console.log(`Network: ${d.network}`);
    console.log(`State: ${d.state}`);
    console.log(`\nDescription: ${d.description}`);
    console.log(`Proposer: ${d.proposer}`);
    console.log(`Voting: Block ${d.startBlock} -> ${d.endBlock}`);
    console.log(`\nVote Tally:`);
    console.log(`  FOR:      ${d.forVotes.padStart(16)}  (${d.forPct}%)`);
    console.log(`  AGAINST:  ${d.againstVotes.padStart(16)}  (${d.againstPct}%)`);
    console.log(`  ABSTAIN:  ${d.abstainVotes.padStart(16)}  (${d.abstainPct}%)`);
    console.log(`  TOTAL:    ${d.totalVotes.padStart(16)}`);
    console.log(`  QUORUM:   ${d.quorum.padStart(16)}  ${d.quorumMet ? "Met" : "Not met"}`);
    if (d.governanceToken) console.log(`\nToken: ${d.governanceToken}`);
    console.log(`\nGovernor: ${pharos.explorerAddress(addr, d.network)}`);
  }).catch(console.error);
}

module.exports = { proposalDetails };
