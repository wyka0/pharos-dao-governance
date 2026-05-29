const pharos = require("./pharos_rpc");

const STATE_MAP = {
  0: "Pending", 1: "Active", 2: "Canceled",
  3: "Defeated", 4: "Succeeded", 5: "Queued",
  6: "Expired", 7: "Executed",
};

async function getProposals(governorAddress, network = "atlantic-testnet", limit = 10) {
  const gov = pharos.getGovernorContract(governorAddress, network);
  let total = null;
  let proposals = [];

  // Strategy A: Try proposalCount() (GovernorBravo style)
  try {
    const count = await gov.proposalCount();
    total = count.toNumber();
    const start = Math.max(0, total - limit);

    for (let i = start; i < total; i++) {
      try {
        const prop = await gov.proposals(i);
        const stateCode = await gov.state(i);
        proposals.push({
          id: prop.proposalId.toString(),
          proposer: prop.proposer,
          startBlock: prop.startBlock.toString(),
          endBlock: prop.endBlock.toString(),
          forVotes: prop.forVotes.toString(),
          againstVotes: prop.againstVotes.toString(),
          abstainVotes: prop.abstainVotes.toString(),
          state: STATE_MAP[stateCode] || `Unknown(${stateCode})`,
          stateCode,
          source: "direct",
        });
      } catch (e) {
        proposals.push({ id: String(i), error: e.message });
      }
    }
  } catch (_) {
    // Strategy B: proposalCount() not available → use ProposalCreated events (OZ Governor v5)
    const events = await pharos.queryProposalCreatedEvents(gov);
    total = events.length;

    if (events.length === 0) {
      return { total: 0, network, governor: governorAddress, proposals: [] };
    }

    const seen = new Set();
    for (const ev of events.slice(-limit)) {
      const pid = ev.proposalId;
      if (seen.has(pid)) continue;
      seen.add(pid);
      try {
        const stateNum = await gov.state(pid);
        const stateCode = typeof stateNum === "object" ? stateNum.toNumber() : stateNum;
        const votes = await gov.proposalVotes(pid);
        let proposer = ev.proposer;
        try { proposer = await gov.proposalProposer(pid); } catch (_) {}
        proposals.push({
          id: pid,
          proposer,
          voteStart: ev.voteStart,
          voteEnd: ev.voteEnd,
          forVotes: votes.forVotes.toString(),
          againstVotes: votes.againstVotes.toString(),
          abstainVotes: votes.abstainVotes.toString(),
          state: STATE_MAP[stateCode] || `Unknown(${stateCode})`,
          stateCode,
          description: ev.description.slice(0, 200),
          source: "oz-v5",
        });
      } catch (_) {
        proposals.push({
          id: pid,
          description: ev.description.slice(0, 200),
          state: "Unknown",
          proposer: ev.proposer || "?",
          voteStart: ev.voteStart,
          voteEnd: ev.voteEnd,
          source: "event-only",
        });
      }
    }
  }

  return { total, network, governor: governorAddress, proposals: proposals.reverse() };
}

if (require.main === module) {
  const addr = process.argv[2];
  const net = process.argv[3] || "atlantic-testnet";
  const lim = parseInt(process.argv[4] || "10");

  if (!addr) {
    console.error("Usage: node get_proposals.js <governor_address> [network] [limit]");
    process.exit(1);
  }

  getProposals(addr, net, lim).then((res) => {
    console.log(`\nDAO: ${res.governor.slice(0, 10)}...${res.governor.slice(-6)}`);
    console.log(`Network: ${res.network}`);
    console.log(`Total Proposals: ${res.total}  (showing last ${res.proposals.length})\n`);

    for (const p of res.proposals) {
      if (p.error) {
        console.log(`  #${p.id} — Error: ${p.error}`);
        continue;
      }
      const sum = Number(p.forVotes || 0) + Number(p.againstVotes || 0) + Number(p.abstainVotes || 0);
      const pct = sum ? ((Number(p.forVotes || 0) / sum) * 100).toFixed(1) : "?";
      const desc = p.description || "(no description available)";
      const stateTag = p.state || "?";
      const forTag = p.forVotes || "?";
      const shortId = p.id.length > 16 ? p.id.slice(0, 16) + "..." : p.id;
      console.log(`  #${shortId.padEnd(20)} ${stateTag.padEnd(12)} ${forTag.padStart(12)} For  ${pct}%`);
      console.log(`        ${desc}`);
      console.log();
    }
  }).catch(console.error);
}

module.exports = { getProposals };
