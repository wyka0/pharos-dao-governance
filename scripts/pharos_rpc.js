const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

function getNetwork(network = "atlantic-testnet") {
  const networks = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../references/networks.json"), "utf-8")
  );
  const entry = networks.networks.find((n) => n.name === network);
  if (!entry) throw new Error(`Unknown network: ${network}. Supported: ${networks.networks.map(n => n.name).join(", ")}`);
  return entry;
}

function getProvider(network = "atlantic-testnet") {
  const cfg = getNetwork(network);
  const url = process.env.RPC_URL || cfg.rpcUrl;
  return new ethers.providers.StaticJsonRpcProvider(url, {
    chainId: cfg.chainId,
    name: "pharos",
  });
}

function loadABI(name) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `../references/${name}.json`), "utf-8")
  );
}

function getGovernorContract(governorAddress, network) {
  const abi = loadABI("governor_abi");
  const provider = getProvider(network);
  return new ethers.Contract(governorAddress, abi, provider);
}

function getGovernanceTokenContract(tokenAddress, network) {
  const abi = loadABI("governance_token_abi");
  const provider = getProvider(network);
  return new ethers.Contract(tokenAddress, abi, provider);
}

function getWallet(network) {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");
  const provider = getProvider(network);
  return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
}

function getSignerContract(governorAddress, network) {
  const abi = loadABI("governor_abi");
  const wallet = getWallet(network);
  return new ethers.Contract(governorAddress, abi, wallet);
}

function getTokenSignerContract(tokenAddress, network) {
  const abi = loadABI("governance_token_abi");
  const wallet = getWallet(network);
  return new ethers.Contract(tokenAddress, abi, wallet);
}

function explorerUrl(txHash, network) {
  const cfg = getNetwork(network);
  return `${cfg.explorerUrl}/tx/${txHash}`;
}

function explorerAddress(address, network) {
  const cfg = getNetwork(network);
  return `${cfg.explorerUrl}/address/${address}`;
}

async function queryProposalCreatedEvents(gov, fromBlock, _toBlock) {
  const eventTopic = ethers.utils.id("ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)");
  const provider = gov.provider || gov.signer?.provider;
  const currentBlock = await provider.getBlockNumber();
  const RANGE = 1000;
  const MAX_CHUNKS_FWD = 250; // handles up to 250k blocks (~35 days)
  const MAX_CHUNKS_BWD = 50;  // handles up to 50k blocks (~7 days)
  const iface = new ethers.utils.Interface(loadABI("governor_abi"));
  const results = [];

  if (fromBlock !== undefined) {
    // Forward from fromBlock to toBlock (or currentBlock)
    const endAt = _toBlock !== undefined ? _toBlock : currentBlock;
    let cursor = Math.max(0, fromBlock);
    let chunks = 0;
    while (cursor < endAt && chunks < MAX_CHUNKS_FWD) {
      const chunkEnd = Math.min(endAt, cursor + RANGE);
      try {
        const logs = await provider.getLogs({
          address: gov.address, topics: [eventTopic],
          fromBlock: cursor, toBlock: chunkEnd,
        });
        for (const log of logs) {
          const parsed = iface.parseLog(log);
          results.push({
            proposalId: parsed.args.proposalId.toString(),
            proposer: parsed.args.proposer,
            voteStart: (parsed.args.voteStart || parsed.args.startBlock).toString(),
            voteEnd: (parsed.args.voteEnd || parsed.args.endBlock).toString(),
            description: parsed.args.description,
            logBlockNumber: log.blockNumber,
          });
        }
      } catch (_) { break; }
      cursor = chunkEnd + 1;
      chunks++;
    }
  } else {
    // Backward from currentBlock, stop after finding events or hitting MAX_CHUNKS_BWD
    let endBlock = currentBlock;
    let chunks = 0;
    while (endBlock > 0 && chunks < MAX_CHUNKS_BWD) {
      const startBlock = Math.max(0, endBlock - RANGE + 1);
      try {
        const logs = await provider.getLogs({
          address: gov.address, topics: [eventTopic],
          fromBlock: startBlock, toBlock: endBlock,
        });
        for (const log of logs) {
          const parsed = iface.parseLog(log);
          results.push({
            proposalId: parsed.args.proposalId.toString(),
            proposer: parsed.args.proposer,
            voteStart: (parsed.args.voteStart || parsed.args.startBlock).toString(),
            voteEnd: (parsed.args.voteEnd || parsed.args.endBlock).toString(),
            description: parsed.args.description,
            logBlockNumber: log.blockNumber,
          });
        }
        // Stop early if we found events in this latest chunk (assumes all proposals are recent)
        if (logs.length > 0) break;
      } catch (_) { break; }
      endBlock = startBlock - 1;
      chunks++;
    }
  }

  return results;
}

async function queryDelegateChangedEvents(tokenAddress, network, fromBlock, _toBlock) {
  const eventTopic = ethers.utils.id("DelegateChanged(address,address,address)");
  const provider = getProvider(network);
  const currentBlock = await provider.getBlockNumber();
  const RANGE = 1000;
  const MAX_CHUNKS_FWD = 250;
  const MAX_CHUNKS_BWD = 50;
  const iface = new ethers.utils.Interface(loadABI("governance_token_abi"));
  const results = [];

  if (fromBlock !== undefined) {
    const endAt = _toBlock !== undefined ? _toBlock : currentBlock;
    let cursor = Math.max(0, fromBlock);
    let chunks = 0;
    while (cursor < endAt && chunks < MAX_CHUNKS_FWD) {
      const chunkEnd = Math.min(endAt, cursor + RANGE);
      try {
        const logs = await provider.getLogs({
          address: tokenAddress, topics: [eventTopic],
          fromBlock: cursor, toBlock: chunkEnd,
        });
        for (const log of logs) {
          const parsed = iface.parseLog(log);
          results.push({
            delegator: parsed.args.delegator,
            fromDelegate: parsed.args.fromDelegate,
            toDelegate: parsed.args.toDelegate,
            blockNumber: log.blockNumber,
          });
        }
      } catch (_) { break; }
      cursor = chunkEnd + 1;
      chunks++;
    }
  } else {
    let endBlock = currentBlock;
    let chunks = 0;
    while (endBlock > 0 && chunks < MAX_CHUNKS_BWD) {
      const startBlock = Math.max(0, endBlock - RANGE + 1);
      try {
        const logs = await provider.getLogs({
          address: tokenAddress, topics: [eventTopic],
          fromBlock: startBlock, toBlock: endBlock,
        });
        for (const log of logs) {
          const parsed = iface.parseLog(log);
          results.push({
            delegator: parsed.args.delegator,
            fromDelegate: parsed.args.fromDelegate,
            toDelegate: parsed.args.toDelegate,
            blockNumber: log.blockNumber,
          });
        }
        if (logs.length > 0) break;
      } catch (_) { break; }
      endBlock = startBlock - 1;
      chunks++;
    }
  }

  return results;
}

module.exports = {
  getNetwork,
  getProvider,
  loadABI,
  getGovernorContract,
  getGovernanceTokenContract,
  getWallet,
  getSignerContract,
  getTokenSignerContract,
  explorerUrl,
  explorerAddress,
  queryProposalCreatedEvents,
  queryDelegateChangedEvents,
};
