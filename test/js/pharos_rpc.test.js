const { ethers } = require("ethers");

jest.mock("fs");
jest.mock("dotenv", () => ({ config: jest.fn() }));

describe("pharos_rpc", () => {
  let pharos, mockFs;

  beforeAll(() => {
    mockFs = require("fs");
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
      if (filePath.endsWith("governor_abi.json")) return "[]";
      if (filePath.endsWith("governance_token_abi.json")) return "[]";
      return "{}";
    });
    pharos = require("../../scripts/pharos_rpc");
  });

  afterAll(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  test("getProvider returns an ethers Provider for a known network", () => {
    const provider = pharos.getProvider("atlantic-testnet");
    expect(provider).toBeInstanceOf(ethers.providers.StaticJsonRpcProvider);
    expect(provider.connection.url).toBe("https://rpc.atlantic.pharos.network");
  });

  test("getGovernorContract returns a Contract instance", () => {
    const contract = pharos.getGovernorContract(
      "0x0000000000000000000000000000000000000001",
      "atlantic-testnet"
    );
    expect(contract).toBeInstanceOf(ethers.Contract);
    expect(contract.address).toBe("0x0000000000000000000000000000000000000001");
  });

  test("formatRawVotes formats BigNumber votes to human-readable", () => {
    const result = pharos.formatRawVotes("1000000000000000000", "VOTE");
    expect(result).toBe("1 VOTE");
  });
});
