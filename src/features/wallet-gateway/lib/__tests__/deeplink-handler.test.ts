import { Linking } from "react-native";
import { createDeeplinkHandler } from "../deeplink-handler";
import { ConnectorRegistry } from "../../model/connector-registry";
import type { ChainConnector, WalletAccount } from "../../model/types";

jest.mock("react-native", () => ({
  Linking: {
    addEventListener: jest.fn(),
    getInitialURL: jest.fn(),
  },
}));

function makeConnector(
  chain: string,
  walletId: string,
): jest.Mocked<ChainConnector> {
  return {
    chain,
    walletId,
    connect: jest.fn<Promise<WalletAccount>, []>(),
    disconnect: jest.fn<Promise<void>, []>(),
    signAndSendTransaction: jest.fn<Promise<string>, [Uint8Array]>(),
    signTransaction: jest.fn<Promise<string>, [Uint8Array]>(),
    signMessage: jest.fn<Promise<string>, [Uint8Array]>(),
    handleDeeplink: jest.fn<void, [string]>(),
    dispose: jest.fn<void, []>(),
  };
}

describe("createDeeplinkHandler", () => {
  let registry: ConnectorRegistry;
  let solanaConnector: jest.Mocked<ChainConnector>;
  let aptosConnector: jest.Mocked<ChainConnector>;
  let mockRemove: jest.Mock;
  let capturedListener: ((event: { url: string }) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRemove = jest.fn();

    (Linking.addEventListener as jest.Mock).mockImplementation((_event, handler) => {
      capturedListener = handler;
      return { remove: mockRemove };
    });
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(null);

    registry = new ConnectorRegistry();
    solanaConnector = makeConnector("solana", "phantom");
    aptosConnector = makeConnector("aptos", "petra");
    registry.register(solanaConnector);
    registry.register(aptosConnector);
  });

  it("subscribes to Linking url events", () => {
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    expect(Linking.addEventListener).toHaveBeenCalledWith("url", expect.any(Function));
  });

  it("routes onConnect to solana connector", () => {
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    capturedListener!({ url: "testapp://onConnect?data=abc" });
    expect(solanaConnector.handleDeeplink).toHaveBeenCalledWith("testapp://onConnect?data=abc");
  });

  it("routes query-param walletCallback format to solana connector", () => {
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    capturedListener!({ url: "testapp:///?walletCallback=onConnect&data=abc" });
    expect(solanaConnector.handleDeeplink).toHaveBeenCalledWith(
      "testapp:///?walletCallback=onConnect&data=abc",
    );
  });

  it("routes onDisconnect to solana connector", () => {
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    capturedListener!({ url: "testapp://onDisconnect?nonce=xyz" });
    expect(solanaConnector.handleDeeplink).toHaveBeenCalledWith("testapp://onDisconnect?nonce=xyz");
  });

  it("routes onSignAndSendTransaction to solana connector", () => {
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    capturedListener!({ url: "testapp://onSignAndSendTransaction?data=tx" });
    expect(solanaConnector.handleDeeplink).toHaveBeenCalled();
  });

  it("routes /api/v1/connect to aptos connector", () => {
    registry.setActive("aptos", "petra");
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    capturedListener!({
      url: "testapp:///api/v1/connect?response=approved&data=abc",
    });
    expect(aptosConnector.handleDeeplink).toHaveBeenCalledWith(
      "testapp:///api/v1/connect?response=approved&data=abc",
    );
  });

  it("routes /api/v1/response to aptos connector", () => {
    registry.setActive("aptos", "petra");
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    capturedListener!({
      url: "testapp:///api/v1/response?response=approved&data=xyz",
    });
    expect(aptosConnector.handleDeeplink).toHaveBeenCalled();
  });

  it("ignores unknown deeplink paths", () => {
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    capturedListener!({ url: "testapp://someOtherPath?foo=bar" });
    expect(solanaConnector.handleDeeplink).not.toHaveBeenCalled();
  });

  it("calls getInitialURL on subscribe", () => {
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    expect(Linking.getInitialURL).toHaveBeenCalled();
  });

  it("routes cold-start deeplink from getInitialURL", async () => {
    (Linking.getInitialURL as jest.Mock).mockResolvedValue("testapp://onConnect?data=cold");
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    // Wait for the promise to resolve
    await Promise.resolve();
    expect(solanaConnector.handleDeeplink).toHaveBeenCalledWith("testapp://onConnect?data=cold");
  });

  it("routes cold-start deeplink from query-param callback", async () => {
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(
      "testapp:///?walletCallback=onConnect&data=cold",
    );
    const handler = createDeeplinkHandler(registry);
    handler.subscribe();
    await Promise.resolve();
    expect(solanaConnector.handleDeeplink).toHaveBeenCalledWith(
      "testapp:///?walletCallback=onConnect&data=cold",
    );
  });

  it("unsubscribe removes listener", () => {
    const handler = createDeeplinkHandler(registry);
    const unsubscribe = handler.subscribe();
    unsubscribe();
    expect(mockRemove).toHaveBeenCalled();
  });
});
