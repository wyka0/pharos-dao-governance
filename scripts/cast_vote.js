const { ethers } = require("ethers");
const pharos = require("./pharos_rpc");
const { simulateProposal } = require("./simulate_proposal");

const VOTE_TYPES = { 0: "Against", 1: "For", 2: "Abstain" };

async function preCheck(governorAddress, proposalId, voterAddress, network) {
  const gov = pharos.getGovernorContract(governorAddress, network);

  // state() — standard across all OZ Governor versions
  const stateCode = await gov.state(proposalId);
  if (stateCode !== 1) {
    const stateNames = { 0:"Pending",1:"Active",2:"Canceled",3:"Defeated",4:"Succeeded",5:"Queued",6:"Expired",7:"Executed" };
    throw new Error(`Proposal #${proposalId} is ${stateNames[stateCode] || `state ${stateCode}`} (not Active). Cannot vote.`);
  }

  // hasVoted() — standard in OZ Governor
  const voted = await gov.hasVoted(proposalId, voterAddress);
  if (voted) throw new Error(`Address ${voterAddress} has already voted on Proposal #${proposalId}.`);

  // Try to get description from ProposalCreated events (non-critical)
  let description = "";
  try {
    const events = await pharos.queryProposalCreatedEvents(gov);
    const match = events.find((e) => e.proposalId === String(proposalId));
    if (match) description = match.description;
  } catch (_) {}

  // Run execution simulation and check quorum
  const sim = await simulateProposal(governorAddress, proposalId, network);
  if (!sim.quorumMet) {
    console.warn(`⚠️ Quorum not met yet for Proposal #${proposalId}`);
  }

  return { stateCode, voted: false, description, simulation: sim };
}

async function castVote(governorAddress, proposalId, support, network = "atlantic-testnet", reason = "") {
  if (![0, 1, 2].includes(support)) throw new Error("support must be 0 (Against), 1 (For), or 2 (Abstain)");

  const gov = pharos.getGovernorContract(governorAddress, network);
  const wallet = pharos.getWallet(network);
  const govSigner = gov.connect(wallet);

  let tx;
  if (reason) {
    tx = await govSigner.castVoteWithReason(proposalId, support, reason);
  } else {
    tx = await govSigner.castVote(proposalId, support);
  }

  const receipt = await tx.wait();
  return {
    txHash: tx.hash,
    explorerLink: pharos.explorerUrl(tx.hash, network),
    blockNumber: receipt.blockNumber,
    proposalId,
    vote: VOTE_TYPES[support],
    network,
  };
}

async function dryRun(governorAddress, proposalId, support, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);
  const wallet = pharos.getWallet(network);
  const govSigner = gov.connect(wallet);

  const gasEstimate = await govSigner.estimateGas.castVote(proposalId, support);
  const feeData = await wallet.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
  const gasCost = gasPrice ? gasEstimate.mul(gasPrice) : ethers.BigNumber.from(0);

  return {
    proposalId,
    vote: VOTE_TYPES[support],
    estimatedGas: gasEstimate.toString(),
    estimatedCostWei: gasCost.toString(),
    estimatedCostEth: ethers.utils.formatEther(gasCost),
    network,
  };
}

if (require.main === module) {
  const addr = process.argv[2];
  const pid = process.argv[3];
  const support = parseInt(process.argv[4]);
  let net = process.argv[5] || "atlantic-testnet";
  if (net.startsWith("--")) net = "atlantic-testnet";
  const reason = process.argv[6] || "";
  const dryrun = process.argv.includes("--dry-run");

  if (!addr || !pid || isNaN(support)) {
    console.error("Usage: node cast_vote.js <governor> <proposal_id> <0|1|2> [network] [reason] [--dry-run]");
    console.error("  0 = Against, 1 = For, 2 = Abstain");
    process.exit(1);
  }

  const wallet = pharos.getWallet(net);
  const voter = wallet.address;

  simulateProposal(addr, pid, net)
    .then((sim) => {
      console.log(`\n📊 Proposal Simulation — #${pid}`);
      console.log(`State:   ${sim.state}`);
      console.log(`For:     ${pharos.formatRawVotes(sim.forVotes)}  (${sim.forPct.toFixed(1)}%)`);
      console.log(`Against: ${pharos.formatRawVotes(sim.againstVotes)}  (${sim.againstPct.toFixed(1)}%)`);
      console.log(`Quorum:  ${sim.quorumMet ? "✅ Met" : "❌ Not met"}`);
      return preCheck(addr, pid, voter, net).then(({ description }) => {
        console.log(`\n🗳️  Proposal #${pid}: ${(description || "?").slice(0, 100)}`);
        console.log(`Voter: ${voter}`);
        console.log(`Vote:  ${VOTE_TYPES[support]}`);
        console.log(`Network: ${net}`);

        if (dryrun) {
          return dryRun(addr, pid, support, net).then((d) => {
            console.log(`\n🔍 DRY RUN — No transaction sent`);
            console.log(`Estimated Gas: ${d.estimatedGas}`);
            console.log(`Estimated Cost: ${d.estimatedCostEth} ${pharos.getNetwork(net).nativeToken}`);
            console.log(`To execute: remove --dry-run flag`);
          });
        }

        console.log(`\nProceed? This will send an on-chain transaction.`);
        return castVote(addr, pid, support, net, reason).then((r) => {
          console.log(`\n✅ Vote cast! ${r.vote}`);
          console.log(`Tx: ${r.explorerLink}`);
        });
      });
    })
    .catch(console.error);
}

module.exports = { castVote, preCheck, dryRun, simulateProposal };
