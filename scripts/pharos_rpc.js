const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

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

function assertValidAddress(address, label) {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid ${label}: "${address}". Expected a valid 0x-prefixed 40-hex-char address.`);
  }
  try {
    ethers.utils.getAddress(address);
  } catch (_) {
    throw new Error(`Invalid ${label}: bad checksum "${address}". Run it through ethers.utils.getAddress() to get the correct checksum.`);
  }
}

function getGovernorContract(governorAddress, network) {
  const checksummed = ethers.utils.getAddress(governorAddress);
  const abi = loadABI("governor_abi");
  const provider = getProvider(network);
  return new ethers.Contract(checksummed, abi, provider);
}

function getGovernanceTokenContract(tokenAddress, network) {
  const checksummed = ethers.utils.getAddress(tokenAddress);
  const abi = loadABI("governance_token_abi");
  const provider = getProvider(network);
  return new ethers.Contract(checksummed, abi, provider);
}

function getWallet(network) {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");
  const provider = getProvider(network);
  return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
}

function getSignerContract(governorAddress, network) {
  const abi = loadABI("governor_abi");
  const wallet = getWallet(network);
  return new ethers.Contract(ethers.utils.getAddress(governorAddress), abi, wallet);
}

function getTokenSignerContract(tokenAddress, network) {
  const abi = loadABI("governance_token_abi");
  const wallet = getWallet(network);
  return new ethers.Contract(ethers.utils.getAddress(tokenAddress), abi, wallet);
}

function explorerUrl(txHash, network) {
  const cfg = getNetwork(network);
  return `${cfg.explorerUrl}/tx/${txHash}`;
}

function explorerAddress(address, network) {
  const cfg = getNetwork(network);
  return `${cfg.explorerUrl}/address/${address}`;
}

const EVENT_SIG_PROPOSAL_CREATED_V4 = ethers.utils.id("ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)");
const EVENT_SIG_PROPOSAL_CREATED_V5 = ethers.utils.id("ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,uint256,string)");

function tryDecodeProposalCreated(log) {
  const topic0 = log.topics[0];

  try {
    if (topic0 === EVENT_SIG_PROPOSAL_CREATED_V4 || topic0 === EVENT_SIG_PROPOSAL_CREATED_V5) {
      const isV5 = topic0 === EVENT_SIG_PROPOSAL_CREATED_V5;
      const proposalId = ethers.BigNumber.from(log.topics[1]).toString();
      const proposer = ethers.utils.getAddress(ethers.utils.hexZeroPad(log.topics[2], 32).slice(12));

      const data = log.data === "0x" ? "0x" : log.data;
      if (!data || data === "0x") {
        return {
          proposalId,
          proposer,
          voteStart: "0",
          voteEnd: "0",
          description: "",
          calldatas: [],
          logBlockNumber: log.blockNumber,
        };
      }

      let voteStart, voteEnd, description, calldatas;

      if (isV5) {
        // OZ v5: (targets,values,signatures,calldatas,description,snapshot,duration)
        // layout: [offset_target, offset_value, offset_sig, offset_calldata, offset_desc] + [targets, values, sigs, calldatas] + [snapshot, duration, desc]
        const decoded = ethers.utils.defaultAbiCoder.decode(
          ["uint256[]", "uint256[]", "string[]", "bytes[]", "uint256", "uint256", "string"],
          ethers.utils.hexZeroPad(data, 320)
        );
        voteStart = decoded[4].toString();
        voteEnd = (decoded[4].add(decoded[5])).toString();
        description = decoded[6];
        calldatas = decoded[3];
      } else {
        // OZ v4: (targets,values,signatures,calldatas,description,startBlock,endBlock)
        const decoded = ethers.utils.defaultAbiCoder.decode(
          ["uint256[]", "uint256[]", "string[]", "bytes[]", "uint256", "uint256", "string"],
          ethers.utils.hexZeroPad(data, 320)
        );
        voteStart = decoded[5].toString();
        voteEnd = decoded[6].toString();
        description = decoded[4];
        calldatas = decoded[3];
      }

      return {
        proposalId,
        proposer,
        voteStart,
        voteEnd,
        description: description || "",
        calldatas: calldatas || [],
        logBlockNumber: log.blockNumber,
      };
    }
  } catch (err) {
    // Fall through to null return
  }
  return null;
}

async function queryProposalCreatedEvents(gov, fromBlock, _toBlock) {
  const provider = gov.provider || gov.signer?.provider;
  const currentBlock = await provider.getBlockNumber();
  const RANGE = 1000;
  const MAX_CHUNKS_FWD = 250;
  const MAX_CHUNKS_BWD = 50;
  const results = [];

  if (fromBlock !== undefined) {
    const endAt = _toBlock !== undefined ? _toBlock : currentBlock;
    let cursor = Math.max(0, fromBlock);
    let chunks = 0;
    while (cursor < endAt && chunks < MAX_CHUNKS_FWD) {
      const chunkEnd = Math.min(endAt, cursor + RANGE);
      try {
        const logs = await withRetry(() => provider.getLogs({
          address: gov.address,
          topics: [null],
          fromBlock: cursor,
          toBlock: chunkEnd,
        }));
        for (const log of logs) {
          const decoded = tryDecodeProposalCreated(log);
          if (decoded) results.push(decoded);
        }
      } catch (err) {
        console.warn(`[RPC Error] ProposalCreated forward scan aborted at block ${cursor}: ${err.message}`);
        throw err;
      }
      cursor = chunkEnd + 1;
      chunks++;
    }
  } else {
    let endBlock = currentBlock;
    let chunks = 0;
    while (endBlock > 0 && chunks < MAX_CHUNKS_BWD) {
      const startBlock = Math.max(0, endBlock - RANGE + 1);
      try {
        const logs = await withRetry(() => provider.getLogs({
          address: gov.address,
          topics: [null],
          fromBlock: startBlock,
          toBlock: endBlock,
        }));
        for (const log of logs) {
          const decoded = tryDecodeProposalCreated(log);
          if (decoded) results.push(decoded);
        }
        if (logs.length > 0) break;
      } catch (err) {
        console.warn(`[RPC Error] ProposalCreated backward scan aborted at block ${startBlock}: ${err.message}`);
        throw err;
      }
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
  const results = [];

  if (fromBlock !== undefined) {
    const endAt = _toBlock !== undefined ? _toBlock : currentBlock;
    let cursor = Math.max(0, fromBlock);
    let chunks = 0;
    while (cursor < endAt && chunks < MAX_CHUNKS_FWD) {
      const chunkEnd = Math.min(endAt, cursor + RANGE);
      try {
        const logs = await withRetry(() => provider.getLogs({
          address: tokenAddress, topics: [eventTopic],
          fromBlock: cursor, toBlock: chunkEnd,
        }));
        for (const log of logs) {
          results.push({
            delegator: ethers.utils.getAddress(ethers.utils.hexZeroPad(log.topics[1], 32).slice(12)),
            fromDelegate: ethers.utils.getAddress(ethers.utils.hexZeroPad(log.topics[2], 32).slice(12)),
            toDelegate: ethers.utils.getAddress(ethers.utils.hexZeroPad(log.topics[3], 32).slice(12)),
            blockNumber: log.blockNumber,
          });
        }
      } catch (err) {
        console.warn(`[RPC Error] DelegateChanged forward scan aborted at block ${cursor}: ${err.message}`);
        throw err;
      }
      cursor = chunkEnd + 1;
      chunks++;
    }
  } else {
    let endBlock = currentBlock;
    let chunks = 0;
    while (endBlock > 0 && chunks < MAX_CHUNKS_BWD) {
      const startBlock = Math.max(0, endBlock - RANGE + 1);
      try {
        const logs = await withRetry(() => provider.getLogs({
          address: tokenAddress, topics: [eventTopic],
          fromBlock: startBlock, toBlock: endBlock,
        }));
        for (const log of logs) {
          results.push({
            delegator: ethers.utils.getAddress(ethers.utils.hexZeroPad(log.topics[1], 32).slice(12)),
            fromDelegate: ethers.utils.getAddress(ethers.utils.hexZeroPad(log.topics[2], 32).slice(12)),
            toDelegate: ethers.utils.getAddress(ethers.utils.hexZeroPad(log.topics[3], 32).slice(12)),
            blockNumber: log.blockNumber,
          });
        }
        if (logs.length > 0) break;
      } catch (err) {
        console.warn(`[RPC Error] DelegateChanged backward scan aborted at block ${startBlock}: ${err.message}`);
        throw err;
      }
      endBlock = startBlock - 1;
      chunks++;
    }
  }

  return results;
}

function formatTokenAmount(amount, decimals = 18) {
  const divisor = ethers.BigNumber.from(10).pow(decimals);
  const quotient = amount.div(divisor);
  const remainder = amount.mod(divisor);
  const remainderStr = remainder.toString().padStart(decimals, "0").slice(0, 4);
  const intPart = quotient.toNumber().toLocaleString("en-US");
  const trimmed = remainderStr.replace(/0+$/, "");
  return trimmed ? `${intPart}.${trimmed}` : intPart;
}

function formatTokenDisplay(amount, symbol, decimals = 18) {
  return `${formatTokenAmount(amount, decimals)} ${symbol}`;
}

function formatRawVotes(amountStr, symbol = "", decimals = 18) {
  const amount = ethers.BigNumber.from(amountStr);
  return symbol ? formatTokenDisplay(amount, symbol, decimals) : formatTokenAmount(amount, decimals);
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
  formatTokenAmount,
  formatTokenDisplay,
  formatRawVotes,
};