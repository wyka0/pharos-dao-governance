const pharos = require("./pharos_rpc");
const { governanceHealth } = require("./governance_health");
const { delegateInsights } = require("./delegate_insights");
const { governanceActivity } = require("./governance_activity");
const { proposalDetails } = require("./proposal_details");

const RISK_LEVELS = [
  { max: 30, label: "Low", color: "🟢" },
  { max: 50, label: "Medium", color: "🟡" },
  { max: 70, label: "High", color: "🟠" },
  { max: 100, label: "Critical", color: "🔴" },
];

function classifyRisk(score) {
  for (const r of RISK_LEVELS) {
    if (score <= r.max) return { level: r.label, color: r.color };
  }
  return { level: "Critical", color: "🔴" };
}

async function governanceRiskReport(governorAddress, network = "atlantic-testnet") {
  const findings = [];
  let riskScore = 0;

  // Fetch all data in parallel
  const [delegateData, health, activity60, activity30, activity90] = await Promise.allSettled([
    delegateInsights(governorAddress, network),
    governanceHealth(governorAddress, network),
    governanceActivity(governorAddress, network, 60),
    governanceActivity(governorAddress, network, 30),
    governanceActivity(governorAddress, network, 90),
  ]);

  const dd = delegateData.status === "fulfilled" ? delegateData.value : null;
  const h = health.status === "fulfilled" ? health.value : null;
  const a60 = activity60.status === "fulfilled" ? activity60.value : null;
  const a30 = activity30.status === "fulfilled" ? activity30.value : null;
  const a90 = activity90.status === "fulfilled" ? activity90.value : null;

  // --- 1. Delegation concentration ---
  if (dd && !dd.error) {
    const top3 = parseFloat(dd.metrics.top3Share);
    const top1 = parseFloat(dd.metrics.top1Share);
    if (top3 >= 66) {
      findings.push({ severity: "high", category: "Centralization", detail: `Top 3 delegates control ${top3}% of voting power — governance can be captured by a small group.` });
      riskScore += 25;
    } else if (top3 >= 50) {
      findings.push({ severity: "medium", category: "Centralization", detail: `Top 3 delegates control ${top3}% of voting power. Moderate concentration risk.` });
      riskScore += 15;
    } else {
      findings.push({ severity: "low", category: "Centralization", detail: `Top 3 delegates control ${top3}% — power is reasonably distributed.` });
    }
    if (top1 >= 50) {
      findings.push({ severity: "critical", category: "Single-Point Control", detail: `Single address controls ${top1}% of voting power. Governance dominated by one entity.` });
      riskScore += 30;
    }
  } else {
    findings.push({ severity: "medium", category: "Data Gap", detail: "Could not analyze delegate concentration. Token may not support delegation." });
    riskScore += 10;
  }

  // --- 2. Participation trend ---
  if (a60 && a30 && a60.summary.totalProposals > 0 && a30.summary.totalProposals > 0) {
    const olderRate = ((a60.summary.passed + a60.summary.failed) / a60.summary.totalProposals) * 100;
    const recentRate = ((a30.summary.passed + a30.summary.failed) / a30.summary.totalProposals) * 100;
    if (recentRate < olderRate * 0.8 && olderRate > 0) {
      findings.push({ severity: "medium", category: "Declining Participation", detail: `Voter participation declined ~${((olderRate - recentRate) / olderRate * 100).toFixed(0)}% in the last 30 days compared to the prior period.` });
      riskScore += 15;
    } else {
      findings.push({ severity: "low", category: "Participation", detail: "Voter participation is stable or growing. No decline detected." });
    }
  }

  // --- 3. Quorum health ---
  if (h) {
    const quorumRate = parseFloat(h.rates.quorumSuccessRate);
    if (quorumRate < 60) {
      findings.push({ severity: "high", category: "Quorum Risk", detail: `Quorum reached in only ${quorumRate}% of recent proposals. Proposals risk failing due to low turnout.` });
      riskScore += 20;
    } else if (quorumRate < 80) {
      findings.push({ severity: "medium", category: "Quorum Risk", detail: `Quorum reached in ${quorumRate}% of proposals. Room for improvement in voter turnout.` });
      riskScore += 10;
    } else {
      findings.push({ severity: "low", category: "Quorum", detail: `Quorum consistently met (${quorumRate}% success rate). Healthy voter turnout.` });
    }
  }

  // --- 4. Delegate stagnation ---
  if (dd && !dd.error) {
    const nakamoto = dd.nakamotoCoefficient;
    if (nakamoto <= 2) {
      findings.push({ severity: "high", category: "Delegate Stagnation", detail: `Only ${nakamoto} delegates needed for majority (Nakamoto coefficient = ${nakamoto}). No rotation pressure.` });
      riskScore += 15;
    } else if (nakamoto >= 10) {
      findings.push({ severity: "low", category: "Delegate Diversity", detail: `Nakamoto coefficient is ${nakamoto} — power is distributed across many delegates.` });
    } else {
      findings.push({ severity: "low", category: "Delegate Distribution", detail: `Nakamoto coefficient is ${nakamoto}. Moderate delegate diversity.` });
    }
  }

  // --- 5. Proposal success rate ---
  if (a90) {
    const total = a90.summary.passed + a90.summary.failed;
    if (total > 0) {
      const passRate = (a90.summary.passed / total) * 100;
      if (passRate < 50) {
        findings.push({ severity: "high", category: "Proposal Success", detail: `Only ${passRate.toFixed(0)}% of proposals pass. Governance may be fragmented or contentious.` });
        riskScore += 15;
      } else if (passRate >= 80) {
        findings.push({ severity: "low", category: "Proposal Success", detail: `${passRate.toFixed(0)}% of proposals pass. Healthy proposal lifecycle.` });
      } else {
        findings.push({ severity: "low", category: "Proposal Success", detail: `${passRate.toFixed(0)}% pass rate. Normal governance operation.` });
      }
    }
  }

  // --- 6. Active proposal health check ---
  try {
    let latestId;
    try {
      const gov = pharos.getGovernorContract(governorAddress, network);
      const count = await gov.proposalCount();
      latestId = count.toNumber() - 1;
    } catch (_) {}
    if (latestId !== undefined && latestId >= 0) {
      const detail = await proposalDetails(governorAddress, latestId, network);
      if (detail.state === "Active" && Number(detail.againstVotes) > Number(detail.forVotes) * 1.5) {
        findings.push({ severity: "medium", category: "Contentious Proposal", detail: `Latest proposal #${detail.id} has strong opposition (${detail.againstPct}% Against). May indicate governance friction.` });
        riskScore += 10;
      }
    }
  } catch (_) {}

  // --- Final score ---
  riskScore = Math.min(100, riskScore);
  const { level, color } = classifyRisk(riskScore);

  findings.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] || 99) - (order[b.severity] || 99);
  });

  return {
    riskScore,
    riskLevel: level,
    riskColor: color,
    findings,
    summary: {
      totalFindings: findings.length,
      criticalFindings: findings.filter((f) => f.severity === "critical").length,
      highFindings: findings.filter((f) => f.severity === "high").length,
      mediumFindings: findings.filter((f) => f.severity === "medium").length,
      lowFindings: findings.filter((f) => f.severity === "low").length,
    },
    network,
    governor: governorAddress,
  };
}

if (require.main === module) {
  const addr = process.argv[2];
  const net = process.argv[3] || "atlantic-testnet";

  if (!addr) {
    console.error("Usage: node governance_risk_report.js <governor_address> [network]");
    process.exit(1);
  }

  governanceRiskReport(addr, net).then((d) => {
    const bar = (v, w = 20) => {
      const filled = Math.round((Math.min(100, Math.max(0, v)) / 100) * w);
      return "█".repeat(filled) + "░".repeat(w - filled);
    };

    console.log(`\n🚨 Governance Risk Report`);
    console.log(`Network: ${d.network}\n`);

    console.log(`  Risk Score: ${d.riskScore}/100`);
    console.log(`  ${bar(d.riskScore)} ${d.riskColor} ${d.riskLevel}\n`);

    console.log(`📋 Findings (${d.summary.totalFindings})`);
    console.log(`  ${"🔴".repeat(d.summary.criticalFindings)}${"🟠".repeat(d.summary.highFindings)}${"🟡".repeat(d.summary.mediumFindings)}${"🟢".repeat(d.summary.lowFindings)}`);
    console.log(`  Critical: ${d.summary.criticalFindings}  ·  High: ${d.summary.highFindings}  ·  Medium: ${d.summary.mediumFindings}  ·  Low: ${d.summary.lowFindings}\n`);

    for (const f of d.findings) {
      const icon = f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : f.severity === "medium" ? "🟡" : "🟢";
      console.log(`  ${icon} [${f.category}] ${f.detail}`);
    }

    console.log(`\n📊 Risk Factor Breakdown`);
    console.log(`  Delegation Centralization`);
    console.log(`  Participation Trend`);
    console.log(`  Quorum Health`);
    console.log(`  Delegate Diversity`);
    console.log(`  Proposal Success Rate`);
    console.log(`  Active Proposal Health\n`);

    console.log(`ℹ️  This report analyzes on-chain governance data only.`);
    console.log(`   Off-chain factors (forum discussions, social sentiment) are not reflected.\n`);
  }).catch(console.error);
}

module.exports = { governanceRiskReport };
