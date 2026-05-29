const pharos = require("./pharos_rpc");

const STATE_MAP = { 0:"Pending",1:"Active",2:"Canceled",3:"Defeated",4:"Succeeded",5:"Queued",6:"Expired",7:"Executed" };

async function governanceHealth(governorAddress, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);
  const provider = pharos.getProvider(network);

  // --- Gather raw data ---

  // 1. Proposal stats (via events if no proposalCount)
  let proposals = [];
  let totalProposals = 0;
  let totalCount = 0;

  try {
    totalCount = (await gov.proposalCount()).toNumber();
  } catch (_) { totalCount = 0; }

  if (totalCount > 0) {
    for (let i = 0; i < totalCount; i++) {
      try {
        const p = await gov.proposals(i);
        const s = await gov.state(i);
        proposals.push({ id: i, state: s, forVotes: Number(p.forVotes || 0), againstVotes: Number(p.againstVotes || 0), startBlock: Number(p.startBlock || 0) });
      } catch (_) {}
    }
  } else {
    // Fallback: events (OZ Governor)
    try {
      const events = await pharos.queryProposalCreatedEvents(gov);
      totalCount = events.length;
      for (const ev of events.slice(-50)) {
        try {
          const s = await gov.state(ev.proposalId);
          const votes = await gov.proposalVotes(ev.proposalId);
          proposals.push({ id: ev.proposalId, state: s, forVotes: Number(votes.forVotes || 0), againstVotes: Number(votes.againstVotes || 0), voteStart: Number(ev.voteStart || 0) });
        } catch (_) {
          proposals.push({ id: ev.proposalId, state: -1, forVotes: 0, againstVotes: 0 });
        }
      }
    } catch (_) {}
  }

  totalProposals = proposals.length;

  // 2. Governor parameters
  let votingDelay = 0, votingPeriod = 0, proposalThreshold = 0;
  try { votingDelay = (await gov.votingDelay()).toNumber(); } catch (_) {}
  try { votingPeriod = (await gov.votingPeriod()).toNumber(); } catch (_) {}
  try { proposalThreshold = (await gov.proposalThreshold()).toString(); } catch (_) {}

  let quorumVal = 0, quorumRaw = "0";
  try {
    const currentBlock = await provider.getBlockNumber();
    const qBN = await gov.quorum(currentBlock);
    quorumVal = Number(qBN);
    quorumRaw = qBN.toString();
  } catch (_) {}

  // 3. Token / delegation info
  let tokenAddr;
  try { tokenAddr = await gov.token(); } catch (_) { tokenAddr = null; }

  let totalSupply = 0, totalSupplyRaw = "0", tokenSymbol = "VOTE";
  if (tokenAddr) {
    try {
      const t = pharos.getGovernanceTokenContract(tokenAddr, network);
      tokenSymbol = await t.symbol();
      const tsBN = await t.totalSupply();
      totalSupply = Number(tsBN);
      totalSupplyRaw = tsBN.toString();
    } catch (_) {}
  }

  // 4. Governance metrics
  const totalVotesCast = proposals.reduce((s, p) => s + p.forVotes + p.againstVotes, 0);
  const succeeded = proposals.filter((p) => p.state === 4 || p.state === 5 || p.state === 7).length;
  const defeated = proposals.filter((p) => p.state === 3).length;
  const executed = proposals.filter((p) => p.state === 7).length;
  const active = proposals.filter((p) => p.state === 1).length;
  const canceled = proposals.filter((p) => p.state === 2).length;

  const quorumMetCount = proposals.filter((p) => {
    if (!quorumVal) return true;
    return p.forVotes >= quorumVal;
  }).length;

  // --- Compute scores ---

  // Participation rate: % of proposals that had votes > 0
  const proposalsWithVotes = proposals.filter((p) => p.forVotes + p.againstVotes > 0).length;
  const participationRate = totalProposals > 0 ? (proposalsWithVotes / totalProposals) * 100 : 0;

  // Quorum success rate
  const quorumSuccessRate = proposals.length > 0 ? (quorumMetCount / proposals.length) * 100 : 0;

  // Proposal success rate (% of completed proposals that passed)
  const completed = succeeded + defeated;
  const proposalSuccessRate = completed > 0 ? (succeeded / completed) * 100 : 0;

  // Voter participation: total voting power used vs potential
  const voterParticipationRate = totalSupply > 0 ? Math.min(100, (totalVotesCast / totalSupply) * 100) : 0;

  // Composite health score (weighted)
  const healthScore = Math.round(
    (participationRate * 0.25) +
    (quorumSuccessRate * 0.25) +
    (proposalSuccessRate * 0.20) +
    (voterParticipationRate * 0.30)
  );

  return {
    healthScore: Math.min(100, Math.max(0, healthScore)),
    metrics: {
      totalProposals,
      active,
      succeeded,
      executed,
      defeated,
      canceled,
    },
    rates: {
      participationRate: participationRate.toFixed(1),
      quorumSuccessRate: quorumSuccessRate.toFixed(1),
      proposalSuccessRate: proposalSuccessRate.toFixed(1),
      voterParticipationRate: voterParticipationRate.toFixed(1),
    },
    config: {
      tokenSymbol,
      totalSupply: totalSupplyRaw,
      votingDelay,
      votingPeriod,
      proposalThreshold,
      quorum: quorumRaw,
      governanceToken: tokenAddr || "N/A",
    },
    network,
    governor: governorAddress,
  };
}

if (require.main === module) {
  const addr = process.argv[2];
  const net = process.argv[3] || "atlantic-testnet";

  if (!addr) {
    console.error("Usage: node governance_health.js <governor_address> [network]");
    process.exit(1);
  }

  governanceHealth(addr, net).then((d) => {
    const bar = (pct, w = 20) => {
      const filled = Math.round((pct / 100) * w);
      return "█".repeat(filled) + "░".repeat(w - filled);
    };
    const pct = (v) => `${v}%`;

    console.log(`\n🏛️  DAO Governance Health Report`);
    console.log(`Network: ${d.network}`);
    console.log(`Governor: ${d.governor.slice(0, 10)}...${d.governor.slice(-6)}\n`);

    console.log(`  OVERALL HEALTH: ${d.healthScore}/100`);
    console.log(`  ${bar(d.healthScore)} ${d.healthScore >= 80 ? "✅ Excellent" : d.healthScore >= 60 ? "⚠️  Fair" : "❌ Needs improvement"}\n`);

    console.log(`📊 Metrics`);
    console.log(`  Total Proposals: ${d.metrics.totalProposals}`);
    console.log(`  Active: ${d.metrics.active}  |  Executed: ${d.metrics.executed}  |  Succeeded: ${d.metrics.succeeded}`);
    console.log(`  Defeated: ${d.metrics.defeated}  |  Canceled: ${d.metrics.canceled}\n`);

    console.log(`📈 Rates`);
    console.log(`  Participation:      ${pct(d.rates.participationRate).padStart(6)}  ${bar(parseFloat(d.rates.participationRate))}`);
    console.log(`  Quorum Success:     ${pct(d.rates.quorumSuccessRate).padStart(6)}  ${bar(parseFloat(d.rates.quorumSuccessRate))}`);
    console.log(`  Proposal Success:   ${pct(d.rates.proposalSuccessRate).padStart(6)}  ${bar(parseFloat(d.rates.proposalSuccessRate))}`);
    console.log(`  Voter Participation:${pct(d.rates.voterParticipationRate).padStart(6)}  ${bar(parseFloat(d.rates.voterParticipationRate))}\n`);

    console.log(`⚙️  Config`);
    const fmt = (v) => pharos.formatRawVotes(v);
    console.log(`  Token: ${d.config.tokenSymbol} (${d.config.governanceToken})`);
    console.log(`  Total Supply: ${fmt(d.config.totalSupply)} ${d.config.tokenSymbol}`);
    console.log(`  Quorum: ${fmt(d.config.quorum)} ${d.config.tokenSymbol}`);
    console.log(`  Voting Period: ${d.config.votingPeriod.toLocaleString()} blocks`);
    console.log(`  Proposal Threshold: ${fmt(d.config.proposalThreshold)} ${d.config.tokenSymbol}`);
  }).catch(console.error);
}

module.exports = { governanceHealth };
