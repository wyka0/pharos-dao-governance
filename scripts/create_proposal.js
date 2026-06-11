const { ethers } = require("ethers");
const pharos = require("./pharos_rpc");

async function createProposal(governorAddress, targets, values, calldatas, description, network = "atlantic-testnet") {
  const gov = pharos.getGovernorContract(governorAddress, network);
  const wallet = pharos.getWallet(network);
  const govSigner = gov.connect(wallet);
  const proposer = wallet.address;

  // Pre-check: proposal threshold
  let threshold = "0";
  try { threshold = (await gov.proposalThreshold()).toString(); } catch (_) {}

  let power = "0";
  try {
    const tokenAddr = await gov.token();
    if (tokenAddr && tokenAddr !== ethers.constants.AddressZero) {
      const token = pharos.getGovernanceTokenContract(tokenAddr, network);
      try { power = (await token.getVotes(proposer)).toString(); } catch (_) {
        power = (await token.balanceOf(proposer)).toString();
      }
    }
  } catch (_) {}

  if (ethers.BigNumber.from(power).lt(ethers.BigNumber.from(threshold))) {
    return {
      skipped: true,
      message: `Insufficient voting power. Have ${pharos.formatRawVotes(power)}, need ${pharos.formatRawVotes(threshold)}`,
      proposer,
      power,
      threshold,
    };
  }

  const tx = await govSigner.propose(targets, values, calldatas, description);
  const receipt = await tx.wait();

  // Parse ProposalCreated event for the ID
  let proposalId = "unknown";
  // OZ Governor v4/v5 share same topic[0] signature; try parsing, fall back to topic-based extraction
  const OZ_EVENT_SIG = ethers.utils.id("ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)");
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== governorAddress.toLowerCase()) continue;
    const topic0 = log.topics[0];
    // OZ Governor v4/v5: proposalId is in topics[1]
    if (topic0 === OZ_EVENT_SIG) {
      try {
        const iface = new ethers.utils.Interface(pharos.loadABI("governor_abi"));
        const parsed = iface.parseLog(log);
        if (parsed.name === "ProposalCreated") {
          proposalId = parsed.args.proposalId.toString();
          break;
        }
      } catch (_) {}
    }
    // GovernorBravo: proposalId is in topics[1] too, but with different event sig
    // Attempt to read proposalId directly from topic[1] as fallback
    if (topic0 !== OZ_EVENT_SIG) {
      try {
        proposalId = ethers.BigNumber.from(log.topics[1]).toString();
        break;
      } catch (_) {}
    }
  }

  return {
    skipped: false,
    txHash: tx.hash,
    explorerLink: pharos.explorerUrl(tx.hash, network),
    blockNumber: receipt.blockNumber,
    proposalId,
    proposer,
    description: description.slice(0, 200),
    network,
  };
}

function encodeCalldata(abi, fnName, args) {
  const iface = new ethers.utils.Interface(abi);
  return iface.encodeFunctionData(fnName, args);
}

if (require.main === module) {
  const addr = process.argv[2];
  const target = process.argv[3];
  const valueEth = process.argv[4] || "0";
  const calldataHex = process.argv[5] || "0x";
  const description = process.argv[6] || "Proposal";
  const net = process.argv[7] || "atlantic-testnet";

  if (!addr || !target) {
    console.error(`Usage: node create_proposal.js <governor> <target_address> [value_in_phrs] [calldata_hex] ["description"] [network]

Examples:
  # Simple value transfer proposal
  node create_proposal.js \$GOVERNOR_ADDRESS 0xRecipient 0.01

  # Contract interaction proposal
  node create_proposal.js \$GOVERNOR_ADDRESS 0xContract 0 0xa9059cbb... "Transfer USDC"

  # Multi-action proposal (use encoded format from env or script)
`);
    process.exit(1);
  }

  const targets = [target];
  const values = [ethers.utils.parseEther(valueEth)];
  const calldatas = [calldataHex];

  createProposal(addr, targets, values, calldatas, description, net)
    .then((r) => {
      if (r.skipped) {
        console.log(`\n❌ ${r.message}`);
        return;
      }
      console.log(`\n✅ Proposal Created`);
      console.log(`ID:          ${r.proposalId}`);
      console.log(`Proposer:    ${r.proposer}`);
      console.log(`Description: ${r.description}`);
      console.log(`Network:     ${r.network}`);
      console.log(`Tx:          ${r.explorerLink}`);
      console.log(`\nNext steps:`);
      console.log(`  Check state:  node scripts/proposal_details.js ${addr} ${r.proposalId}`);
      console.log(`  Vote For:     node scripts/cast_vote.js ${addr} ${r.proposalId} 1`);
      console.log(`  Get results:  node scripts/get_results.js ${addr} ${r.proposalId}`);
    })
    .catch(console.error);
}

module.exports = { createProposal, encodeCalldata };
