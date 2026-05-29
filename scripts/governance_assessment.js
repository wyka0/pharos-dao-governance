const pharos = require("./pharos_rpc");

const STATE_NAMES = { 0:"Pending",1:"Active",2:"Canceled",3:"Defeated",4:"Succeeded",5:"Queued",6:"Expired",7:"Executed" };
const QUORUM_ALERT_BLOCKS = 1000; // warn if < ~3h remain and quorum not met

// Risk keywords mapped to severity
const RISK_KEYWORDS = [
  { words: ["treasury","spend","allocate","transfer","grant","fund"], severity: "Medium", label: "Treasury Spend" },
  { words: ["upgrade","migrate","update","v2","v3","new implementation"], severity: "High", label: "Contract Upgrade" },
  { words: ["fee","interest","rate","parameter","configuration"], severity: "Medium", label: "Parameter Change" },
  { words: ["emergency","pause","freeze","halt","shutdown"], severity: "Critical", label: "Emergency Action" },
  { words: ["reward","incentive","emission","distribution","airdrop"], severity: "Low", label: "Token Distribution" },
  { words: ["salary","payroll","compensation","hire","team"], severity: "Low", label: "Team Operations" },
  { words: ["partnership","integration","collaboration","listing"], severity: "Low", label: "Partnership" },
  { words: ["burn","buyback","reduce supply"], severity: "Low", label: "Tokenomics" },
];

function assessRisk(description) {
  const lower = description.toLowerCase();
  for (const r of RISK_KEYWORDS) {
    for (const w of r.words) {
      if (lower.includes(w)) return { risk: r.severity, category: r.label };
    }
  }
  return { risk: "Low", category: "General Governance" };
}

async function governanceRecommendation(governorAddress, proposalId, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);
  const provider = pharos.getProvider(network);

  // --- Gather all data ---

  const stateCode = await gov.state(proposalId);
  const currentBlock = await provider.getBlockNumber();

  const votes = await gov.proposalVotes(proposalId);

  let startBlock = 0, deadlineBlock = 0, description = "";
  try {
    const events = await pharos.queryProposalCreatedEvents(gov);
    const match = events.find((e) => e.proposalId === String(proposalId));
    if (match) {
      description = match.description;
      startBlock = Number(match.voteStart);
      deadlineBlock = Number(match.voteEnd);
    }
  } catch (_) {}
  if (!startBlock) {
    try { startBlock = Number(await gov.proposalSnapshot(proposalId)); } catch (_) {}
  }
  if (!deadlineBlock) {
    try { deadlineBlock = Number(await gov.proposalDeadline(proposalId)); } catch (_) {}
  }

  let quorumVal = 0;
  try { quorumVal = Number(await gov.quorum(startBlock || 0)); } catch (_) {}

  let tokenAddr, tokenSymbol = "VOTE", totalSupply = 0;
  try {
    tokenAddr = await gov.token();
    if (tokenAddr) {
      const t = pharos.getGovernanceTokenContract(tokenAddr, network);
      tokenSymbol = await t.symbol();
      totalSupply = Number(await t.totalSupply());
    }
  } catch (_) {}

  // --- Compute metrics ---

  const fVotes = Number(votes.forVotes);
  const aVotes = Number(votes.againstVotes);
  const abVotes = Number(votes.abstainVotes);
  const totalVotes = fVotes + aVotes + abVotes;

  const blocksRemaining = deadlineBlock - currentBlock;
  const isActive = stateCode === 1;
  const hasEnded = stateCode !== 1 || blocksRemaining <= 0;

  // Quorum probability
  const quorumProb = quorumVal > 0 ? Math.min(100, (fVotes / quorumVal) * 100) : 100;
  const quorumMet = fVotes >= quorumVal;

  // Vote margin
  const margin = fVotes - aVotes;
  const totalExAbstain = fVotes + aVotes;
  const forPct = totalExAbstain > 0 ? (fVotes / totalExAbstain) * 100 : 0;

  // Risk assessment
  const { risk, category } = assessRisk(description);

  // Participation rate
  const participationRate = totalSupply > 0 ? (totalVotes / totalSupply) * 100 : 0;

  // --- Generate AI assessment ---

  let assessment, confidence, reasoning = [];

  if (!isActive && hasEnded) {
    if (stateCode === 4 || stateCode === 5 || stateCode === 7) {
      assessment = "PASSED";
      confidence = "High";
      reasoning.push(`Proposal ${STATE_NAMES[stateCode] || "ended"} — outcome already determined.`);
    } else if (stateCode === 3) {
      assessment = "DEFEATED";
      confidence = "High";
      reasoning.push(`Proposal was defeated on-chain.`);
    } else {
      assessment = "N/A";
      confidence = "N/A";
      reasoning.push(`Proposal is in ${STATE_NAMES[stateCode] || "unknown"} state. No action needed.`);
    }
  } else if (!isActive && stateCode === 0) {
    assessment = "NEUTRAL";
    confidence = "Medium";
    reasoning.push("Voting has not started yet. Revisit after voting delay.");
  } else {
    // Active proposal — generate data-driven assessment
    if (quorumProb < 50) {
      assessment = "FOR";
      confidence = "Low";
      reasoning.push(`Quorum probability is ${quorumProb.toFixed(0)}% — quorum not yet reached. Each additional For vote increases chance of passage.`);
    } else if (forPct >= 70) {
      assessment = "FOR";
      confidence = forPct >= 85 ? "High" : "Medium";
      reasoning.push(`On-chain sentiment shows ${forPct.toFixed(0)}% of votes in favor. Proposal has strong community alignment.`);
    } else if (forPct <= 40) {
      assessment = "AGAINST";
      confidence = "Medium";
      reasoning.push(`On-chain sentiment shows ${(100 - forPct).toFixed(0)}% of votes opposed. Proposal faces significant community pushback.`);
    } else if (forPct > 40 && forPct < 70) {
      assessment = "REVIEW";
      confidence = "Low";
      reasoning.push(`Vote split is narrow (${forPct.toFixed(0)}% For). No clear majority signal from on-chain data.`);
      reasoning.push(`Decision factors may not be fully captured by on-chain metrics. Manual review recommended.`);
    }

    if (risk === "Critical") {
      reasoning.push(`⚠️  CRITICAL category: ${category}. Proposals in this category carry contract-level risks.`);
      if (assessment !== "AGAINST") { assessment = "REVIEW"; confidence = "Low"; }
    } else if (risk === "High") {
      reasoning.push(`⚡ Risk factor flagged: ${category}. Higher scrutiny may be warranted.`);
    }

    if (margin > 0 && quorumMet) {
      reasoning.push(`✅ Quorum met. For votes lead by ${margin.toLocaleString()} ${tokenSymbol}.`);
    } else if (margin > 0) {
      reasoning.push(`📊 For votes lead by ${margin.toLocaleString()} ${tokenSymbol}, but quorum not yet met at ${quorumProb.toFixed(0)}%.`);
    } else if (fVotes > 0) {
      reasoning.push(`Against votes lead by ${Math.abs(margin).toLocaleString()} ${tokenSymbol}.`);
    }

    if (blocksRemaining > 0 && isActive) {
      reasoning.push(`⏳ ${blocksRemaining.toLocaleString()} blocks remain in voting window.`);
    }

    // Quorum alert: active proposal closing soon without quorum
    if (isActive && !quorumMet && blocksRemaining > 0 && blocksRemaining < QUORUM_ALERT_BLOCKS) {
      reasoning.push(`🚨 QUORUM ALERT: Only ${blocksRemaining} blocks remain and quorum is not yet met (${quorumProb.toFixed(0)}%). Votes urgently needed.`);
    }
  }

  // --- Weighted confidence (based on data signal strength, not certainty) ---
  const confidenceScore =
    assessment === "PASSED" || assessment === "DEFEATED" ? 95 :
    confidence === "High" ? 85 :
    confidence === "Medium" ? 65 :
    confidence === "Low" ? 45 : 0;

  return {
    proposalId: String(proposalId),
    description: description.slice(0, 300) || "(no description)",
    state: STATE_NAMES[stateCode] || `Unknown(${stateCode})`,
    category,
    risk,
    metrics: {
      forVotes: fVotes.toLocaleString(),
      againstVotes: aVotes.toLocaleString(),
      abstainVotes: abVotes.toLocaleString(),
      totalVotes: totalVotes.toLocaleString(),
      forPercentage: forPct.toFixed(1),
      margin: margin.toLocaleString(),
      quorum: quorumVal.toLocaleString(),
      quorumProgress: quorumProb.toFixed(0),
      quorumMet,
      participationRate: participationRate.toFixed(1),
      blocksRemaining: Math.max(0, blocksRemaining).toLocaleString(),
      quorumAlert: isActive && !quorumMet && blocksRemaining > 0 && blocksRemaining < QUORUM_ALERT_BLOCKS,
    },
    assessment,
    confidence,
    confidenceScore,
    reasoning,
    network,
  };
}

if (require.main === module) {
  const addr = process.argv[2];
  const pid = process.argv[3];
  const net = process.argv[4] || "atlantic-testnet";

  if (!addr || !pid) {
    console.error("Usage: node governance_assessment.js <governor_address> <proposal_id> [network]");
    process.exit(1);
  }

  governanceRecommendation(addr, pid, net).then((d) => {
    const bar = (v, w = 15) => {
      const filled = Math.round((Math.min(100, Math.max(0, v)) / 100) * w);
      return "█".repeat(filled) + "░".repeat(w - filled);
    };

    console.log(`\n🤖 AI Governance Recommendation`);
    console.log(`Network: ${d.network}\n`);

    console.log(`Proposal #${d.proposalId}`);
    console.log(`State: ${d.state}`);
    console.log(`Description: ${d.description.slice(0, 120)}...`);
    console.log(`Category: ${d.category}  |  Risk: ${d.risk}\n`);

    console.log(`📊 Vote Analysis`);
    console.log(`  ✅ For:     ${d.metrics.forVotes.padStart(14)}  ${bar(d.metrics.forPercentage)} ${d.metrics.forPercentage}%`);
    console.log(`  ❌ Against: ${d.metrics.againstVotes.padStart(14)}  ${bar(100 - parseFloat(d.metrics.forPercentage))} ${(100 - parseFloat(d.metrics.forPercentage)).toFixed(1)}%`);
    console.log(`  ⬜ Abstain: ${d.metrics.abstainVotes.padStart(14)}`);
    console.log(`  ─────────────────────────────────────────────`);
    console.log(`  Total:     ${d.metrics.totalVotes.padStart(14)}`);
    console.log(`  Margin:    ${d.metrics.margin.padStart(14)}`);
    console.log(`  Turnout:   ${d.metrics.participationRate.padStart(11)}%  ${bar(d.metrics.participationRate)}\n`);

    console.log(`🎯 Quorum`);
    console.log(`  Required:    ${d.metrics.quorum.padStart(12)}`);
    console.log(`  Progress:    ${d.metrics.quorumProgress.padStart(7)}%  ${bar(d.metrics.quorumProgress)}`);
    console.log(`  Status:      ${d.metrics.quorumMet ? "✅ Met" : "❌ Not yet met"}`);
    if (d.metrics.blocksRemaining > 0) {
      console.log(`  ⏳ ${d.metrics.blocksRemaining} blocks remaining`);
    }

    console.log(`\n🔮 AI Assessment: ${d.assessment}  (confidence: ${d.confidence} · ${d.confidenceScore}/100)`);
    console.log(`  (This is an automated data analysis, not financial or governance advice.)`);

    if (d.metrics.quorumAlert) {
      console.log(`\n🚨 QUORUM ALERT — Proposal may fail if quorum is not met soon!`);
    }

    console.log(`\n📋 Reasoning`);
    for (const r of d.reasoning) {
      console.log(`  • ${r}`);
    }
    console.log();
  }).catch(console.error);
}

async function quorumAlertCheck(governorAddress, network = "atlantic-testnet") {
  const provider = pharos.getProvider(network);
  const currentBlock = await provider.getBlockNumber();
  const gov = pharos.getGovernorContract(governorAddress, network);
  const alerts = [];

  let proposals;
  try { proposals = await pharos.queryProposalCreatedEvents(gov); } catch (_) { return []; }

  for (const ev of proposals) {
    try {
      const stateCode = await gov.state(ev.proposalId);
      if (stateCode !== 1) continue;
      const votes = await gov.proposalVotes(ev.proposalId);
      const deadlineBlock = Number(ev.voteEnd);
      const quorumVal = Number(await gov.quorum(Number(ev.voteStart) || 0));
      const forVotes = Number(votes.forVotes);
      const blocksLeft = deadlineBlock - currentBlock;

      if (!quorumVal) continue;
      if (forVotes >= quorumVal) continue;
      if (blocksLeft <= 0 || blocksLeft > QUORUM_ALERT_BLOCKS) continue;

      alerts.push({
        proposalId: ev.proposalId.toString(),
        description: ev.description.slice(0, 120),
        forVotes: forVotes.toLocaleString(),
        quorumRequired: quorumVal.toLocaleString(),
        quorumProgress: ((forVotes / quorumVal) * 100).toFixed(0),
        blocksRemaining: blocksLeft.toLocaleString(),
      });
    } catch (_) {}
  }

  return alerts;
}

module.exports = { governanceRecommendation, assessRisk, quorumAlertCheck };
