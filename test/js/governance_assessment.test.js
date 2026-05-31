const { ethers } = require("ethers");

jest.mock("fs");
jest.mock("dotenv", () => ({ config: jest.fn() }));

describe("governance_assessment", () => {
  let assessProposal, assessRisk;

  beforeAll(() => {
    const mockFs = require("fs");
    const networksJson = JSON.stringify({
      networks: [
        {
          name: "atlantic-testnet",
          chainId: 543210,
          rpcUrl: "https://rpc.atlantic.pharos.network",
          explorerUrl: "https://explorer.atlantic.pharos.network",
          nativeToken: "XPLA",
        },
      ],
    });
    mockFs.readFileSync.mockImplementation((filePath) => {
      if (filePath.endsWith("networks.json")) return networksJson;
      return "[]";
    });
    const mod = require("../../scripts/governance_assessment");
    assessProposal = mod.assessProposal;
    assessRisk = mod.assessRisk;
  });

  afterAll(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  test("assessProposal returns FOR with High confidence when forPct >= 85", () => {
    const proposal = { endBlock: 1000 };
    const votes = {
      forVotes: ethers.BigNumber.from("850"),
      againstVotes: ethers.BigNumber.from("150"),
    };
    const blockNumber = 100;
    const quorumVotes = ethers.BigNumber.from("500");

    const result = assessProposal(proposal, votes, blockNumber, quorumVotes);
    expect(result.assessment).toBe("FOR");
    expect(result.confidence).toBe("High");
    expect(result.forPct).toBeGreaterThanOrEqual(85);
  });

  test("assessRisk with calldata selector overrides description keywords", () => {
    const proposal = {
      calldatas: ["0x3659cfe60000000000000000000000000000000000000000000000000000000000000000"],
      description: "regular maintenance",
    };
    const result = assessRisk(proposal);
    expect(result.severity).toBe("Critical");
    expect(result.category).toBe("Proxy Upgrade");
  });

  test("assessRisk with description only falls back to keywords", () => {
    const proposal = {
      calldatas: [],
      description: "emergency pause requested",
    };
    const result = assessRisk(proposal);
    expect(result.severity).toBe("Critical");
    expect(result.category).toBe("Emergency Action");
  });

  test("assessProposal handles BigNumber values exceeding Number.MAX_SAFE_INTEGER", () => {
    const big = "9007199254740993";
    const proposal = { endBlock: 2000 };
    const votes = {
      forVotes: ethers.BigNumber.from(big),
      againstVotes: ethers.BigNumber.from("1"),
    };
    const blockNumber = 100;
    const quorumVotes = ethers.BigNumber.from("500");

    const result = assessProposal(proposal, votes, blockNumber, quorumVotes);
    expect(result.forPct).toBeGreaterThanOrEqual(99);
    expect(result.quorumProb).toBeGreaterThan(0);
    expect(result.assessment).toBe("FOR");
  });

  test("assessProposal triggers quorum alert when blocks left < 1000 and quorum not met", () => {
    const proposal = { endBlock: 500 };
    const votes = {
      forVotes: ethers.BigNumber.from("10"),
      againstVotes: ethers.BigNumber.from("5"),
    };
    const blockNumber = 400;
    const quorumVotes = ethers.BigNumber.from("100");

    const result = assessProposal(proposal, votes, blockNumber, quorumVotes);
    expect(result.reasoning.some(r => r.includes("QUORUM ALERT"))).toBe(true);
  });

  test("assessProposal does NOT trigger quorum alert when quorum is met", () => {
    const proposal = { endBlock: 500 };
    const votes = {
      forVotes: ethers.BigNumber.from("200"),
      againstVotes: ethers.BigNumber.from("50"),
    };
    const blockNumber = 400;
    const quorumVotes = ethers.BigNumber.from("100");

    const result = assessProposal(proposal, votes, blockNumber, quorumVotes);
    expect(result.reasoning.some(r => r.includes("QUORUM ALERT"))).toBe(false);
  });
});
