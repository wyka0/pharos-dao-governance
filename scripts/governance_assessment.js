const pharos = require("./pharos_rpc");
const { ethers } = require("ethers");

const STATE_NAMES = { 0:"Pending",1:"Active",2:"Canceled",3:"Defeated",4:"Succeeded",5:"Queued",6:"Expired",7:"Executed" };
const QUORUM_ALERT_BLOCKS = 1000; // warn if < ~3h remain and quorum not met

function assessProposal(proposal, votes, blockNumber, quorumVotes) {
  const fVotes = votes.forVotes;
  const aVotes = votes.againstVotes;
  const totalVotes = fVotes.add(aVotes);

  const forPct = totalVotes.eq(0) ? 0 : fVotes.mul(100).div(totalVotes).toNumber();
  const againstPct = totalVotes.eq(0) ? 0 : aVotes.mul(100).div(totalVotes).toNumber();
  const quorumProb = totalVotes.eq(0) ? 0 : totalVotes.mul(100).div(quorumVotes).toNumber();

  let assessment = "REVIEW";
  let confidence = "Low";
  const reasoning = [];

  if (totalVotes.eq(0)) {
    reasoning.push("No votes cast yet.");
    assessment = "REVIEW";
    confidence = "Low";
  } else if (quorumProb < 50) {
    assessment = "FOR";
    confidence = "Low";
    reasoning.push(`Quorum probability is ${quorumProb.toFixed(0)}%.`);
  } else if (forPct >= 70) {
    assessment = "FOR";
    confidence = forPct >= 85 ? "High" : "Medium";
    reasoning.push(`Strong support: ${forPct.toFixed(1)}% FOR.`);
  } else if (againstPct >= 60) {
    assessment = "AGAINST";
    confidence = againstPct >= 75 ? "High" : "Medium";
    reasoning.push(`Strong opposition: ${againstPct.toFixed(1)}% AGAINST.`);
  } else {
    assessment = "REVIEW";
    confidence = "Medium";
    reasoning.push(`Vote split: ${forPct.toFixed(1)}% FOR, ${againstPct.toFixed(1)}% AGAINST.`);
  }

  const blocksLeft = proposal.endBlock - blockNumber;
  if (blocksLeft < 1000 && totalVotes.lt(quorumVotes)) {
    reasoning.push(`⚠️ QUORUM ALERT: Only ${blocksLeft} blocks left and quorum not met.`);
  }

  return { assessment, confidence, reasoning, forPct, againstPct, quorumProb };
}

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

const RISK_SELECTORS = {
  "0x8da5cb5b": { severity: "High", category: "Ownership Query" },
  "0x3659cfe6": { severity: "Critical", category: "Proxy Upgrade" },
  "0x153ab6b5": { severity: "Critical", category: "Emergency Pause" },
  "0xf2fde38b": { severity: "High",     category: "Transfer Ownership" },
  "0x8456cb59": { severity: "Critical", category: "Pause" },
  "0x3f4ba83a": { severity: "Critical", category: "Unpause" },
};

function assessRisk(proposal) {
  // Tier 1: calldata selector — overrides description keywords
  if (proposal.calldatas && Array.isArray(proposal.calldatas)) {
    for (const calldata of proposal.calldatas) {
      if (calldata && calldata.length >= 10) {
        const selector = calldata.slice(0, 10).toLowerCase();
        if (RISK_SELECTORS[selector]) {
          return RISK_SELECTORS[selector];
        }
      }
    }
  }
  // Tier 2: description keyword fallback
  const lower = (proposal.description || "").toLowerCase();
  for (const r of RISK_KEYWORDS) {
    for (const w of r.words) {
      if (lower.includes(w)) return { severity: r.severity, category: r.label };
    }
  }
  return { severity: "Low", category: "General Governance" };
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

  let quorumBN = ethers.BigNumber.from(0), quorumRaw = "0";
  try { quorumBN = await gov.quorum(startBlock || 0); quorumRaw = quorumBN.toString(); } catch (_) {}
  const quorumVal = quorumBN.toNumber();

  let tokenAddr, tokenSymbol = "VOTE", totalSupplyBN = ethers.BigNumber.from(0);
  try {
    tokenAddr = await gov.token();
    if (tokenAddr) {
      const t = pharos.getGovernanceTokenContract(tokenAddr, network);
      tokenSymbol = await t.symbol();
      totalSupplyBN = await t.totalSupply();
    }
  } catch (_) {}

  // --- Compute metrics (BigNumber-safe) ---

  const fVotesBN = votes.forVotes;
  const aVotesBN = votes.againstVotes;
  const abVotesBN = votes.abstainVotes;
  const totalVotesBN = fVotesBN.add(aVotesBN).add(abVotesBN);

  const blocksRemaining = deadlineBlock - currentBlock;
  const isActive = stateCode === 1;
  const hasEnded = stateCode !== 1 || blocksRemaining <= 0;

  // Quorum probability
  const quorumProb = quorumBN.gt(0) ? fVotesBN.mul(100).div(quorumBN).toNumber() : 100;
  const quorumMet = fVotesBN.gte(quorumBN);

  // Vote margin
  const marginBN = fVotesBN.sub(aVotesBN);
  const totalExAbstainBN = fVotesBN.add(aVotesBN);
  const forPct = totalExAbstainBN.eq(0) ? 0 : fVotesBN.mul(100).div(totalExAbstainBN).toNumber();

  // Risk assessment
  const { severity: risk, category } = assessRisk({
    description,
    calldatas: match?.calldatas || [],
  });

  // Participation rate
  const participationRate = totalSupplyBN.gt(0) ? totalVotesBN.mul(100).div(totalSupplyBN).toNumber() : 0;

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

    const marginDisplay = pharos.formatRawVotes(marginBN.abs().toString(), tokenSymbol);
    if (marginBN.gt(0) && quorumMet) {
      reasoning.push(`✅ Quorum met. For votes lead by ${marginDisplay}.`);
    } else if (marginBN.gt(0)) {
      reasoning.push(`📊 For votes lead by ${marginDisplay}, but quorum not yet met at ${quorumProb.toFixed(0)}%.`);
    } else if (fVotesBN.gt(0)) {
      reasoning.push(`Against votes lead by ${marginDisplay}.`);
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
      forVotes: votes.forVotes.toString(),
      againstVotes: votes.againstVotes.toString(),
      abstainVotes: votes.abstainVotes.toString(),
      totalVotes: votes.forVotes.add(votes.againstVotes).add(votes.abstainVotes).toString(),
      forPercentage: forPct.toFixed(1),
      margin: votes.forVotes.sub(votes.againstVotes).abs().toString(),
      quorum: quorumRaw,
      quorumProgress: quorumProb.toFixed(0),
      quorumMet,
      participationRate: participationRate.toFixed(1),
      blocksRemaining: Math.max(0, blocksRemaining),
      quorumAlert: isActive && !quorumMet && blocksRemaining > 0 && blocksRemaining < QUORUM_ALERT_BLOCKS,
    },
    assessment,
    confidence,
    confidenceScore,
    reasoning,
    tokenSymbol,
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

    const fmt = (v) => pharos.formatRawVotes(v);
    const sym = d.tokenSymbol || "VOTE";

    console.log(`\n🤖 AI Governance Assessment`);
    console.log(`Network: ${d.network}\n`);

    console.log(`Proposal #${d.proposalId}`);
    console.log(`State: ${d.state}`);
    console.log(`Description: ${d.description.slice(0, 120)}...`);
    console.log(`Category: ${d.category}  |  Risk: ${d.risk}\n`);

    console.log(`📊 Vote Analysis`);
    console.log(`  ✅ For:     ${`${fmt(d.metrics.forVotes)} ${sym}`.padStart(20)}  ${bar(d.metrics.forPercentage)} ${d.metrics.forPercentage}%`);
    console.log(`  ❌ Against: ${`${fmt(d.metrics.againstVotes)} ${sym}`.padStart(20)}  ${bar(100 - parseFloat(d.metrics.forPercentage))} ${(100 - parseFloat(d.metrics.forPercentage)).toFixed(1)}%`);
    console.log(`  ⬜ Abstain: ${`${fmt(d.metrics.abstainVotes)} ${sym}`.padStart(20)}`);
    console.log(`  ─────────────────────────────────────────────`);
    console.log(`  Total:     ${`${fmt(d.metrics.totalVotes)} ${sym}`.padStart(20)}`);
    console.log(`  Margin:    ${`${fmt(d.metrics.margin)} ${sym}`.padStart(20)}`);
    console.log(`  Turnout:   ${d.metrics.participationRate.padStart(11)}%  ${bar(d.metrics.participationRate)}\n`);

    console.log(`🎯 Quorum`);
    console.log(`  Required:    ${`${fmt(d.metrics.quorum)} ${sym}`.padStart(16)}`);
    console.log(`  Progress:    ${d.metrics.quorumProgress.padStart(7)}%  ${bar(d.metrics.quorumProgress)}`);
    console.log(`  Status:      ${d.metrics.quorumMet ? "✅ Met" : "❌ Not yet met"}`);
    if (d.metrics.blocksRemaining > 0) {
      console.log(`  ⏳ ${(d.metrics.blocksRemaining).toLocaleString()} blocks remaining`);
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
      const quorumBN = await gov.quorum(Number(ev.voteStart) || 0);
      const quorumVal = quorumBN.toNumber();
      const forVotes = votes.forVotes.toNumber();
      const blocksLeft = deadlineBlock - currentBlock;

      if (quorumBN.eq(0)) continue;
      if (votes.forVotes.gte(quorumBN)) continue;
      if (blocksLeft <= 0 || blocksLeft > QUORUM_ALERT_BLOCKS) continue;

      alerts.push({
        proposalId: ev.proposalId.toString(),
        description: ev.description.slice(0, 120),
        forVotes: pharos.formatRawVotes(votes.forVotes.toString()),
        quorumRequired: pharos.formatRawVotes(quorumBN.toString()),
        quorumProgress: votes.forVotes.mul(100).div(quorumBN).toNumber().toFixed(0),
        blocksRemaining: blocksLeft.toLocaleString(),
      });
    } catch (_) {}
  }

  return alerts;
}

module.exports = { governanceRecommendation, assessProposal, assessRisk, quorumAlertCheck };
