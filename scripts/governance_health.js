const { ethers } = require("ethers");
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
  } catch (err) { console.warn("proposalCount failed:", err.message); totalCount = 0; }

  if (totalCount > 0) {
    const CHUNK_SIZE = 20;
    for (let chunkStart = 0; chunkStart < totalCount; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(totalCount, chunkStart + CHUNK_SIZE);
      const results = await Promise.all(
        Array.from({ length: chunkEnd - chunkStart }, (_, j) => {
          const i = chunkStart + j;
          return Promise.all([
            Promise.resolve(i),
            gov.proposals(i).catch((err) => { console.warn("proposal fetch failed for id", i, ":", err.message); return null; }),
            gov.state(i).catch((err) => { console.warn("state failed for id", i, ":", err.message); return null; }),
          ]).then(([id, p, s]) => {
            if (!p || s === null) return null;
            return { id, state: s, forVotes: p.forVotes || ethers.BigNumber.from(0), againstVotes: p.againstVotes || ethers.BigNumber.from(0), startBlock: ethers.BigNumber.from(p.startBlock || 0) };
          });
        })
      );
      for (const r of results) { if (r) proposals.push(r); }
      if (chunkEnd < totalCount) await new Promise((r) => setTimeout(r, 150));
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
          proposals.push({ id: ev.proposalId, state: s, forVotes: votes.forVotes || ethers.BigNumber.from(0), againstVotes: votes.againstVotes || ethers.BigNumber.from(0), voteStart: ethers.BigNumber.from(ev.voteStart || 0) });
        } catch (err) {
          console.warn("event proposal fetch failed for", ev.proposalId, ":", err.message);
          proposals.push({ id: ev.proposalId, state: -1, forVotes: ethers.BigNumber.from(0), againstVotes: ethers.BigNumber.from(0) });
        }
      }
    } catch (err) { console.warn("queryProposalCreatedEvents failed:", err.message); }
  }

  totalProposals = proposals.length;

  // 2. Governor parameters
  let votingDelay = 0, votingPeriod = 0, proposalThreshold = 0;
  try { votingDelay = (await gov.votingDelay()).toNumber(); } catch (err) { console.warn("votingDelay failed:", err.message); }
  try { votingPeriod = (await gov.votingPeriod()).toNumber(); } catch (err) { console.warn("votingPeriod failed:", err.message); }
  try { proposalThreshold = (await gov.proposalThreshold()).toString(); } catch (err) { console.warn("proposalThreshold failed:", err.message); }

  let quorumBN = ethers.BigNumber.from(0), quorumVal = 0, quorumRaw = "0";
  try {
    const currentBlock = await provider.getBlockNumber();
    const qBN = await gov.quorum(currentBlock);
    quorumBN = qBN;
    quorumVal = Number(qBN);
    quorumRaw = qBN.toString();
  } catch (err) { console.warn("quorum() failed:", err.message); }

  // 3. Token / delegation info
  let tokenAddr;
  try { tokenAddr = await gov.token(); } catch (err) { console.warn("gov.token() failed:", err.message); tokenAddr = null; }

  let totalSupplyRaw = "0", tokenSymbol = "VOTE";
  if (tokenAddr) {
    try {
      const t = pharos.getGovernanceTokenContract(tokenAddr, network);
      tokenSymbol = await t.symbol();
      const tsBN = await t.totalSupply();
      totalSupplyRaw = tsBN.toString();
    } catch (err) { console.warn("token totalSupply failed:", err.message); }
  }

  // 4. Governance metrics
  const totalVotesCast = proposals.reduce((s, p) => s.add(p.forVotes).add(p.againstVotes), ethers.BigNumber.from(0));
  const succeeded = proposals.filter((p) => p.state === 4 || p.state === 5 || p.state === 7).length;
  const defeated = proposals.filter((p) => p.state === 3).length;
  const executed = proposals.filter((p) => p.state === 7).length;
  const active = proposals.filter((p) => p.state === 1).length;
  const canceled = proposals.filter((p) => p.state === 2).length;

  const quorumMetCount = proposals.filter((p) => {
    if (quorumBN.eq(0)) return true;
    return p.forVotes.gte(quorumBN);
  }).length;

  // --- Compute scores ---

  // Participation rate: % of proposals that had votes > 0
  const proposalsWithVotes = proposals.filter((p) => p.forVotes.add(p.againstVotes).gt(0)).length;
  const participationRate = totalProposals > 0 ? (proposalsWithVotes / totalProposals) * 100 : 0;

  // Quorum success rate
  const quorumSuccessRate = proposals.length > 0 ? (quorumMetCount / proposals.length) * 100 : 0;

  // Proposal success rate (% of completed proposals that passed)
  const completed = succeeded + defeated;
  const proposalSuccessRate = completed > 0 ? (succeeded / completed) * 100 : 0;

  // Voter participation: total voting power used vs potential
  const supplyBN = ethers.BigNumber.from(totalSupplyRaw || "0");
  const voterParticipationRate = supplyBN.gt(0) ? Math.min(100, totalVotesCast.mul(100).div(supplyBN).toNumber()) : 0;

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
