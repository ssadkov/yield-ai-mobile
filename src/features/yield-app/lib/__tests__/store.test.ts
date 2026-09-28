import { DEMO_ADDRESS, useApp } from "../store";
import { computePortfolio } from "../portfolio";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

describe("app store", () => {
  beforeEach(() => useApp.getState().reset());

  it("keeps a real connected wallet when demo data is loaded", () => {
    useApp.getState().connect({ id: "seed-vault", name: "Seed Vault", address: "RealAddr" });
    useApp.getState().loadDemo();
    const s = useApp.getState();
    expect(s.wallet?.address).toBe("RealAddr");
    expect(s.events.length).toBeGreaterThan(0);
  });

  it("uses the demo wallet when nothing is connected", () => {
    useApp.getState().loadDemo();
    expect(useApp.getState().wallet?.address).toBe(DEMO_ADDRESS);
  });

  it("marks only the first deposit as first and counts it in the portfolio", () => {
    useApp.getState().connect({ id: "seed-vault", name: "Seed Vault", address: "A" });
    const a = useApp.getState().recordDeposit({ strategy: "flexible", amount: 100, txIds: ["s1"] });
    const b = useApp.getState().recordDeposit({ strategy: "fixed", amount: 50, txIds: ["s2"] });
    expect(a.first).toBe(true);
    expect(b.first).toBe(false);
    expect(b.unlockAt).toBeGreaterThan(b.ts);
    const p = computePortfolio(useApp.getState().events);
    expect(p.flexible).toBe(100);
    expect(p.fixedTotal).toBe(50);
    expect(useApp.getState().walletUsdc).toBe(1240 - 150);
  });
});
