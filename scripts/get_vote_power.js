const { ethers } = require("ethers");
const pharos = require("./pharos_rpc");

async function getVotePower(governorAddress, voterAddress, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);

  let tokenAddr;
  try { tokenAddr = await gov.token(); } catch (_) { tokenAddr = null; }

  let votingPower = "0";
  let delegatedTo = null;
  let tokenSymbol = "";
  let totalSupply = "0";

  if (tokenAddr && tokenAddr !== ethers.constants.AddressZero) {
    const token = pharos.getGovernanceTokenContract(tokenAddr, network);
    try {
      const raw = await token.getVotes(voterAddress);
      votingPower = raw.toString();
    } catch (_) {
      try {
        const raw = await token.balanceOf(voterAddress);
        votingPower = raw.toString();
      } catch (_2) {}
    }
    try { delegatedTo = await token.delegates(voterAddress); } catch (_) {}
    try { tokenSymbol = await token.symbol(); } catch (_) { tokenSymbol = "VOTE"; }
    try { totalSupply = (await token.totalSupply()).toString(); } catch (_) {}
  }

  // Find active proposals the user can vote on (Governor-agnostic)
  let proposalCount;
  try { proposalCount = (await gov.proposalCount()).toNumber(); } catch (_) { proposalCount = 0; }

  const activeProposalStates = [];

  if (proposalCount > 0) {
    for (let i = Math.max(0, proposalCount - 20); i < proposalCount; i++) {
      try {
        const s = await gov.state(i);
        if (s === 1) activeProposalStates.push(i);
      } catch (_) {}
    }
  } else {
    // Fallback: search via ProposalCreated events
    try {
      const events = await pharos.queryProposalCreatedEvents(gov);
      const recent = events.slice(-20);
      for (const ev of recent) {
        try {
          const s = await gov.state(ev.proposalId);
          if (s === 1) activeProposalStates.push(ev.proposalId);
        } catch (_) {}
      }
    } catch (_) {}
  }

  return {
    voter: voterAddress,
    governanceToken: tokenAddr || "(not found)",
    tokenSymbol,
    votingPower,
    delegatedTo: delegatedTo || ethers.constants.AddressZero,
    isSelfDelegated: delegatedTo && delegatedTo.toLowerCase() === voterAddress.toLowerCase(),
    isDelegated: delegatedTo && delegatedTo !== ethers.constants.AddressZero,
    totalSupply,
    activeProposals: activeProposalStates,
    network,
    governor: governorAddress,
  };
}

async function hasVoted(governorAddress, proposalId, voterAddress, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);
  return gov.hasVoted(proposalId, voterAddress);
}

if (require.main === module) {
  const addr = process.argv[2];
  const voter = process.argv[3];
  const net = process.argv[4] || "atlantic-testnet";

  if (!addr || !voter) {
    console.error("Usage: node get_vote_power.js <governor_address> <voter_address> [network]");
    process.exit(1);
  }

  getVotePower(addr, voter, net).then((d) => {
    console.log(`\n🔋 Voting Power`);
    console.log(`Voter:  ${d.voter}`);
    console.log(`Token:  ${d.tokenSymbol} (${d.governanceToken})`);
    console.log(`Power:  ${d.votingPower}`);
    if (d.isSelfDelegated) {
      console.log(`Status: Self-delegated ✅`);
    } else if (d.isDelegated) {
      console.log(`Status: Delegated to ${d.delegatedTo}`);
    } else {
      console.log(`Status: Not delegated ⚠️  (use delegate script to activate voting power)`);
    }
    console.log(`Total Supply: ${d.totalSupply}`);
    console.log(`\nActive Proposals: ${d.activeProposals.length ? d.activeProposals.join(", ") : "none"}`);
    console.log(`Network: ${d.network}`);
  }).catch(console.error);
}

module.exports = { getVotePower, hasVoted };
