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

  test("preCheck returns description when proposal is Active", async () => {
    const mockGov = pharosMock.getGovernorContract();
    mockGov.state.mockResolvedValue(1);
    mockGov.hasVoted.mockResolvedValue(false);

    const result = await preCheck(
      "0x0000000000000000000000000000000000000001",
      "42",
      "0x0000000000000000000000000000000000000002",
      "atlantic-testnet"
    );

    expect(result).toBe("");
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
});
