jest.mock("../../scripts/simulate_proposal", () => ({
  simulateProposal: jest.fn(() => Promise.resolve({
    state: "Active",
    quorumMet: true,
    execution: { willSucceed: true, reason: null },
  })),
}));

jest.mock("../../scripts/pharos_rpc", () => {
  const mockGov = {
    state: jest.fn(),
    hasVoted: jest.fn(),
  };
  return {
    getGovernorContract: jest.fn(() => mockGov),
    queryProposalCreatedEvents: jest.fn(() => Promise.resolve([])),
    getWallet: jest.fn(() => ({ address: "0x0000000000000000000000000000000000000001" })),
    getNetwork: jest.fn(() => ({ nativeToken: "XPLA" })),
    explorerUrl: jest.fn(() => "https://explorer.test/tx/0x"),
  };
});

describe("cast_vote", () => {
  let preCheck, pharosMock;

  beforeAll(() => {
    pharosMock = require("../../scripts/pharos_rpc");
    const mod = require("../../scripts/cast_vote");
    preCheck = mod.preCheck;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  test("preCheck returns object with description and simulation when Active", async () => {
    const mockGov = pharosMock.getGovernorContract();
    mockGov.state.mockResolvedValue(1);
    mockGov.hasVoted.mockResolvedValue(false);

    const result = await preCheck(
      "0x0000000000000000000000000000000000000001",
      "42",
      "0x0000000000000000000000000000000000000002",
      "atlantic-testnet"
    );

    expect(result.description).toBe("");
    expect(result.stateCode).toBe(1);
    expect(result.voted).toBe(false);
    expect(result.simulation).toBeDefined();
    expect(pharosMock.getGovernorContract).toHaveBeenCalledWith(
      "0x0000000000000000000000000000000000000001",
      "atlantic-testnet"
    );
  });

  test("preCheck throws when proposal is not Active", async () => {
    const mockGov = pharosMock.getGovernorContract();
    mockGov.state.mockResolvedValue(0);

    await expect(
      preCheck(
        "0x0000000000000000000000000000000000000001",
        "42",
        "0x0000000000000000000000000000000000000002",
        "atlantic-testnet"
      )
    ).rejects.toThrow("is Pending (not Active)");
  });

  test("preCheck throws when voter has already voted (double-vote rejection)", async () => {
    const mockGov = pharosMock.getGovernorContract();
    mockGov.state.mockResolvedValue(1);
    mockGov.hasVoted.mockResolvedValue(true);

    await expect(
      preCheck(
        "0x0000000000000000000000000000000000000001",
        "42",
        "0x0000000000000000000000000000000000000002",
        "atlantic-testnet"
      )
    ).rejects.toThrow("has already voted");
  });
});
