const pharos = require("./pharos_rpc");

const STATE_NAMES = { 0:"Pending",1:"Active",2:"Canceled",3:"Defeated",4:"Succeeded",5:"Queued",6:"Expired",7:"Executed" };
const BLOCKS_PER_DAY = 7200; // ~1 day at 12s blocks on Pharos

async function governanceActivity(governorAddress, network = "atlantic-testnet", days = 30) {
  const gov = pharos.getGovernorContract(governorAddress, network);
  const provider = pharos.getProvider(network);
  const currentBlock = await provider.getBlockNumber();
  const sinceBlock = currentBlock - (days * BLOCKS_PER_DAY);

  // Get all ProposalCreated events in the time window
  const events = await pharos.queryProposalCreatedEvents(gov, Math.max(0, sinceBlock));
  const recent = events.filter((e) => Number(e.logBlockNumber) >= sinceBlock);

  // Fetch state for each proposal
  const proposals = [];
  let activeCount = 0, passedCount = 0, failedCount = 0, pendingCount = 0, canceledCount = 0;

  for (const ev of recent) {
    try {
      const stateCode = await gov.state(ev.proposalId);
      const votes = await gov.proposalVotes(ev.proposalId);

      const entry = {
        id: ev.proposalId,
        proposer: ev.proposer,
        description: ev.description.slice(0, 150),
        state: STATE_NAMES[stateCode] || "Unknown",
        stateCode,
        forVotes: votes.forVotes.toString(),
        againstVotes: votes.againstVotes.toString(),
        createdBlock: ev.logBlockNumber,
      };
      proposals.push(entry);

      if (stateCode === 1) activeCount++;
      else if (stateCode === 4 || stateCode === 5 || stateCode === 7) passedCount++;
      else if (stateCode === 3) failedCount++;
      else if (stateCode === 0) pendingCount++;
      else if (stateCode === 2) canceledCount++;
    } catch (err) { console.warn("gov.state or gov.proposalVotes failed for", ev.proposalId, ":", err.message); }
  }

  // Most active voter (who created the most proposals)
  const voterCounts = {};
  for (const p of proposals) {
    const addr = p.proposer.toLowerCase();
    voterCounts[addr] = (voterCounts[addr] || 0) + 1;
  }
  const sortedVoters = Object.entries(voterCounts).sort((a, b) => b[1] - a[1]);
  const mostActiveProposer = sortedVoters.length > 0
    ? { address: sortedVoters[0][0], count: sortedVoters[0][1] }
    : null;

  // Largest delegate: find who has the most delegated voting power
  let largestDelegate = null;
  let tokenSymbol = "VOTE";
  try {
    const tokenAddr = await gov.token();
    if (tokenAddr) {
      const t = pharos.getGovernanceTokenContract(tokenAddr, network);
      tokenSymbol = await t.symbol();
    }
  } catch (err) { console.warn("gov.token() or token.symbol() failed:", err.message); }

  return {
    periodDays: days,
    fromBlock: Math.max(0, sinceBlock),
    toBlock: currentBlock,
    summary: {
      totalProposals: proposals.length,
      passed: passedCount,
      failed: failedCount,
      active: activeCount,
      pending: pendingCount,
      canceled: canceledCount,
    },
    mostActiveProposer,
    largestDelegate,
    tokenSymbol,
    proposals: proposals.reverse().slice(0, 20), // last 20
    network,
    governor: governorAddress,
  };
}

if (require.main === module) {
  const addr = process.argv[2];
  const net = process.argv[3] || "atlantic-testnet";
  const days = parseInt(process.argv[4] || "30");

  if (!addr) {
    console.error("Usage: node governance_activity.js <governor_address> [network] [days]");
    process.exit(1);
  }

  governanceActivity(addr, net, days).then((d) => {
    const s = d.summary;
    console.log(`\n📅 Governance Activity — Last ${d.periodDays} Days`);
    console.log(`Network: ${d.network}`);
    console.log(`Blocks: ${d.fromBlock.toLocaleString()} → ${d.toBlock.toLocaleString()}\n`);

    console.log(`📊 Summary`);
    console.log(`  Proposals Created:  ${s.totalProposals}`);
    console.log(`  ✅ Passed:          ${s.passed}`);
    console.log(`  ❌ Failed:          ${s.failed}`);
    console.log(`  🗳️  Active:          ${s.active}`);
    console.log(`  ⏳ Pending:         ${s.pending}`);
    console.log(`  🚫 Canceled:        ${s.canceled}`);

    const totalWithOutcome = s.passed + s.failed;
    const passRate = totalWithOutcome > 0 ? ((s.passed / totalWithOutcome) * 100).toFixed(1) : "N/A";
    console.log(`  Pass Rate:          ${passRate}${passRate !== "N/A" ? "%" : ""}\n`);

    if (d.mostActiveProposer) {
      console.log(`👤 Most Active Proposer`);
      console.log(`  ${d.mostActiveProposer.address}`);
      console.log(`  ${d.mostActiveProposer.count} proposals created\n`);
    }

    if (d.proposals.length > 0) {
      console.log(`📋 Recent Proposals`);
      for (const p of d.proposals) {
        const age = d.toBlock - Number(p.createdBlock);
        const ageDays = (age / 7200).toFixed(1);
        console.log(`  #${String(p.id).padEnd(6)} ${p.state.padEnd(12)} ${pharos.formatRawVotes(p.forVotes).padStart(12)} For  ${pharos.formatRawVotes(p.againstVotes).padStart(12)} Against  (${ageDays}d ago)`);
        console.log(`        ${p.description}`);
        console.log();
      }
    }
  }).catch(console.error);
}

module.exports = { governanceActivity };
