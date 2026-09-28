// Handles commands that come from web (web -> native) via the WebView bridge.
// Kept in shared so bridge transport and feature handlers use one explicit contract.
export type BridgeCommandFromWebHandler = (
  commandType: string,
  commandPayload?: Record<string, unknown>,
) => void;
