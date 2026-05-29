const { ethers } = require("ethers");
const pharos = require("./pharos_rpc");

const BLOCKS_30_DAYS = 216000; // 7200 blocks/day × 30

async function delegateInsights(governorAddress, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);
  const provider = pharos.getProvider(network);

  // Discover governance token
  let tokenAddr, tokenSymbol = "VOTE", totalSupply = 0;
  try {
    tokenAddr = await gov.token();
    if (!tokenAddr || tokenAddr === ethers.constants.AddressZero) {
      return { error: "Governor does not expose a governance token address via token().", network, governor: governorAddress };
    }
    const t = pharos.getGovernanceTokenContract(tokenAddr, network);
    tokenSymbol = await t.symbol();
    totalSupply = Number(await t.totalSupply());
  } catch (_) {
    return { error: "Could not discover governance token. Governor may not implement token().", network, governor: governorAddress };
  }

  const govToken = pharos.getGovernanceTokenContract(tokenAddr, network);

  // Query DelegateChanged events for the last 30 days + some buffer
  const currentBlock = await provider.getBlockNumber();
  const sinceBlock = Math.max(0, currentBlock - BLOCKS_30_DAYS * 3); // 90 day buffer for coverage
  const events = await pharos.queryDelegateChangedEvents(tokenAddr, network, sinceBlock);

  // Extract unique active delegates (addresses currently receiving delegation)
  const delegateSet = new Set();
  const zeroAddr = ethers.constants.AddressZero.toLowerCase();

  for (const ev of events) {
    const to = ev.toDelegate.toLowerCase();
    const from = ev.fromDelegate.toLowerCase();
    if (to !== zeroAddr) delegateSet.add(ev.toDelegate);
    if (from !== zeroAddr) delegateSet.delete(ev.fromDelegate); // no longer a delegate
    // Re-add if someone is still delegating to them (handled by checking all events)
  }

  // Also scan more broadly: check events in the full history
  const allEvents = await pharos.queryDelegateChangedEvents(tokenAddr, network);
  const allDelegates = new Set();
  for (const ev of allEvents) {
    if (ev.toDelegate.toLowerCase() !== zeroAddr) allDelegates.add(ev.toDelegate);
  }

  // Query voting power for each delegate
  const delegatePower = [];
  for (const addr of allDelegates) {
    try {
      const power = Number(await govToken.getVotes(addr));
      if (power > 0) {
        delegatePower.push({
          address: addr,
          votingPower: power,
          percentage: totalSupply > 0 ? (power / totalSupply) * 100 : 0,
        });
      }
    } catch (_) {}
  }

  // Sort by voting power descending
  delegatePower.sort((a, b) => b.votingPower - a.votingPower);

  // Calculate concentration metrics
  const totalVotingPower = delegatePower.reduce((s, d) => s + d.votingPower, 0);
  const top1 = delegatePower[0]?.percentage || 0;
  const top3 = delegatePower.slice(0, 3).reduce((s, d) => s + d.percentage, 0);
  const top5 = delegatePower.slice(0, 5).reduce((s, d) => s + d.percentage, 0);
  const top10 = delegatePower.slice(0, 10).reduce((s, d) => s + d.percentage, 0);

  // Herfindahl-Hirschman Index approximation (sum of squared shares)
  const hhi = delegatePower.reduce((s, d) => s + Math.pow(d.votingPower / totalVotingPower, 2), 0);
  const normalizedHhi = ((hhi - 1 / delegatePower.length) / (1 - 1 / delegatePower.length)) * 100;

  // Concentration classification
  let concentration, concentrationColor;
  if (top1 >= 50) {
    concentration = "Very High";
    concentrationColor = "🔴";
  } else if (top3 >= 66) {
    concentration = "High";
    concentrationColor = "🟠";
  } else if (top5 >= 66) {
    concentration = "Medium";
    concentrationColor = "🟡";
  } else {
    concentration = "Low";
    concentrationColor = "🟢";
  }

  // Nakamoto coefficient: number of delegates needed to reach 51%
  let cumulative = 0, nakamoto = 0;
  for (const d of delegatePower) {
    cumulative += d.percentage;
    nakamoto++;
    if (cumulative >= 51) break;
  }

  return {
    tokenAddress: tokenAddr,
    tokenSymbol,
    totalSupply: totalSupply.toLocaleString(),
    totalDelegates: delegatePower.length,
    totalVotingPower: totalVotingPower.toLocaleString(),
    topDelegates: delegatePower.slice(0, 15),
    concentration,
    concentrationColor,
    normalizedHhi: normalizedHhi.toFixed(1),
    nakamotoCoefficient: nakamoto,
    metrics: {
      top1Share: top1.toFixed(1),
      top3Share: top3.toFixed(1),
      top5Share: top5.toFixed(1),
      top10Share: top10.toFixed(1),
    },
    network,
    governor: governorAddress,
  };
}

if (require.main === module) {
  const addr = process.argv[2];
  const net = process.argv[3] || "atlantic-testnet";

  if (!addr) {
    console.error("Usage: node delegate_insights.js <governor_address> [network]");
    process.exit(1);
  }

  delegateInsights(addr, net).then((d) => {
    if (d.error) {
      console.log(`\n❌ ${d.error}`);
      return;
    }

    const bar = (v, w = 20) => {
      const filled = Math.round((Math.min(100, Math.max(0, v)) / 100) * w);
      return "█".repeat(filled) + "░".repeat(w - filled);
    };

    console.log(`\n🏛️  Delegate Insights — Governance Concentration Analysis`);
    console.log(`Network: ${d.network}`);
    console.log(`Token:   ${d.tokenSymbol} (${d.tokenAddress})\n`);

    console.log(`📊 Overview`);
    console.log(`  Total Supply:       ${d.totalSupply} ${d.tokenSymbol}`);
    console.log(`  Total Voting Power: ${d.totalVotingPower} ${d.tokenSymbol}`);
    console.log(`  Total Delegates:    ${d.totalDelegates}`);
    console.log(`  Nakamoto Coeff.:    ${d.nakamotoCoefficient} delegates to reach 51%\n`);

    console.log(`📈 Concentration`);
    console.log(`  Top 1 Delegate:    ${d.metrics.top1Share.padStart(6)}%  ${bar(parseFloat(d.metrics.top1Share))}`);
    console.log(`  Top 3 Delegates:   ${d.metrics.top3Share.padStart(6)}%  ${bar(parseFloat(d.metrics.top3Share))}`);
    console.log(`  Top 5 Delegates:   ${d.metrics.top5Share.padStart(6)}%  ${bar(parseFloat(d.metrics.top5Share))}`);
    console.log(`  Top 10 Delegates:  ${d.metrics.top10Share.padStart(6)}%  ${bar(parseFloat(d.metrics.top10Share))}`);
    console.log(`\n  ${d.concentrationColor} Governance Concentration: ${d.concentration}`);
    console.log(`  Normalized HHI:     ${d.normalizedHhi}/100`);
    console.log(`  (HHI < 30 = Low · 30–60 = Medium · > 60 = High)\n`);

    if (d.topDelegates.length > 0) {
      console.log(`👑 Top Delegates`);
      for (let i = 0; i < Math.min(10, d.topDelegates.length); i++) {
        const del = d.topDelegates[i];
        const rank = (i + 1).toString().padEnd(3);
        const addr = `${del.address.slice(0, 8)}...${del.address.slice(-4)}`.padEnd(17);
        const pct = del.percentage.toFixed(1).padStart(6);
        const cumulativePct = d.topDelegates.slice(0, i + 1).reduce((s, x) => s + x.percentage, 0).toFixed(1).padStart(6);
        console.log(`  ${rank} ${addr}  ${pct}%  [cumulative: ${cumulativePct}%]  ${bar(del.percentage, 15)}`);
      }
    }

    console.log();
  }).catch(console.error);
}

module.exports = { delegateInsights };
