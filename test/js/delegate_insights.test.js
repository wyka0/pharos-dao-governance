jest.mock("../../scripts/pharos_rpc", () => ({
  getGovernorContract: jest.fn(),
  getGovernanceTokenContract: jest.fn(),
  getProvider: jest.fn(),
  formatRawVotes: jest.fn(),
}));

describe("delegate_insights", () => {
  let calculateHHI, calculateNakamoto;

  beforeAll(() => {
    const mod = require("../../scripts/delegate_insights");
    calculateHHI = mod.calculateHHI;
    calculateNakamoto = mod.calculateNakamoto;
  });

  afterAll(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  test("calculateHHI returns normalized HHI for concentrated distribution", () => {
    const delegates = [
      { percentage: 60 },
      { percentage: 25 },
      { percentage: 10 },
      { percentage: 5 },
    ];
    const hhi = calculateHHI(delegates);
    expect(hhi).toBeGreaterThan(0);
    expect(hhi).toBeLessThanOrEqual(100);
  });

  test("calculateNakamoto returns 2 when top 2 delegates exceed 51%", () => {
    const delegates = [
      { percentage: 30 },
      { percentage: 25 },
      { percentage: 20 },
      { percentage: 15 },
      { percentage: 10 },
    ];
    const naka = calculateNakamoto(delegates, 51);
    expect(naka).toBe(2);
  });
});
