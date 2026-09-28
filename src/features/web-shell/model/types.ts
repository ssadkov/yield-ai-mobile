export type BridgeEvent = {
  source: string;
  type: string;
  nonce: string;
  version?: number;
  payload?: Record<string, unknown>;
  ts?: number;
};

export type NativeCommand = {
  type: string;
  payload?: Record<string, unknown>;
};
