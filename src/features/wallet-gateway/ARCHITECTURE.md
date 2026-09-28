# Wallet Gateway - Architecture & Business Logic

## Overview

The wallet stack is split into four modules:

- **`wallet-gateway`** - WebView command routing, React composition, deeplink subscription
- **`core/wallet`** - chain-agnostic domain core (`ChainConnector`, `ConnectorRegistry`, `WalletService`)
- **`wallet-connection-solana`** - Solana connector implementation (Phantom deeplinks, MWA)
- **`wallet-connection-aptos`** - Aptos connector implementation (stub)

Closely related to `wallet-discovery`, which detects installed wallet apps.

---

## Data Flow

```
WebView (Web Layer)
    |  sends bridge commands (connect_wallet, sign_transaction, ...)
    v
createWebViewCommandHandler()   [wallet-gateway/lib/webview-command-handler.ts]
    |  validates payload, routes command
    v
WalletService                   [core/wallet/wallet-service.ts]
    |  business logic, base64 conversion
    v
ConnectorRegistry               [core/wallet/connector-registry.ts]
    |  finds connector by chain ("solana", "aptos")
    v
ChainConnector                  [wallet-connection-solana / wallet-connection-aptos]
    |  delegates to platform adapter
    v
Adapter                         [wallet-connection-solana/lib/*]
    |  calls native API (Linking / MWA protocol)
    v
Wallet App (Phantom, ...)
    |  deeplink back to app
    v
DeeplinkHandler                 [wallet-gateway/lib/deeplink-handler.ts]
    |  resolves chain and routes URL
    v
connector.handleDeeplink(url)   -> resolves pending Promise
    |
    v
WebView receives response ("wallet_connected", "transaction_signed", "transaction_submitted", ...)
```

---

## Folder Structure

```
src/
├── core/
│   └── wallet/
│       ├── index.ts
│       ├── types.ts
│       ├── connector-registry.ts
│       └── wallet-service.ts
│
└── features/
    ├── wallet-gateway/
    │   ├── index.ts
    │   ├── model/
    │   │   ├── use-wallet-gateway.ts
    │   │   ├── use-wallet-registry.ts
    │   │   ├── types.ts                 # Bridge command/response payloads
    │   │   ├── wallet-service.ts        # Core re-export (compatibility)
    │   │   └── connector-registry.ts    # Core re-export (compatibility)
    │   └── lib/
    │       ├── webview-command-handler.ts
    │       └── deeplink-handler.ts
    │
    ├── wallet-connection-solana/
    │   ├── model/solana-connector.ts
    │   └── lib/
    │       ├── phantom-deeplink.ts
    │       ├── phantom-service.ts
    │       └── mwa-adapter.ts
    │
    └── wallet-connection-aptos/
        └── model/aptos-connector.ts
```

---

## Dependency Graph

```
web-shell
  └──→ wallet-gateway
  └──→ wallet-discovery

wallet-gateway
  ├──→ core/wallet
  ├──→ wallet-connection-solana
  ├──→ wallet-connection-aptos
  └──→ wallet-discovery (DetectedWallet type / installed wallets payload)

wallet-connection-solana
  └──→ core/wallet

wallet-connection-aptos
  └──→ core/wallet

core/wallet
  └──→ (no feature dependencies)
```

Dependencies are unidirectional; `core/wallet` does not import from `features/*`.

---

## Key Core Types

### ChainConnector

```ts
interface ChainConnector {
  readonly chain: string
  connect(): Promise<WalletAccount>
  disconnect(): Promise<void>
  signAndSendTransaction(tx: Uint8Array): Promise<string>
  signTransaction(tx: Uint8Array): Promise<string>
  signMessage(message: Uint8Array): Promise<string>
  handleDeeplink?(url: string): void
  dispose(): void
}
```

### WalletAccount

```ts
interface WalletAccount {
  address: string
  chain: string
  walletId: string
}
```

### WalletConnectionError

```ts
class WalletConnectionError extends Error {
  code: string // CHAIN_NOT_SUPPORTED, INVALID_PAYLOAD, NOT_IMPLEMENTED, ...
}
```

---

## Wallet Gateway Layers

### 1. `webview-command-handler.ts`

Routes WebView commands to `WalletService` and maps results/errors back to bridge events.

Supported commands:

- `connect_wallet`
- `disconnect_wallet`
- `sign_transaction`
- `sign_and_submit_transaction`
- `sign_message`
- `get_installed_wallets`

Transaction responses:

- `sign_transaction` with `send: false` emits `transaction_signed` and returns a base64
  serialized signed transaction in `signedTransaction` / `transaction`. The legacy
  `signature` field is also populated with the same value for older web builds.
- `sign_transaction` with omitted `send` or `send: true` emits `transaction_submitted`
  and returns the Solana transaction id in `signature`.
- `sign_and_submit_transaction` always submits and emits `transaction_submitted`,
  ignoring any incoming `send: false`.
- If a deeplink wallet does not support its native `signAndSendTransaction`
  method, the Solana connector falls back to `signTransaction` and submits the
  signed base64 transaction through Solana JSON-RPC for the configured cluster.

Also emits `installed_wallets` proactively when wallet discovery data changes and the bridge is ready.

### 2. `use-wallet-registry.ts`

Creates one `ConnectorRegistry`, registers Solana and Aptos connectors, subscribes deeplink handler, disposes on unmount.

### 3. `use-wallet-gateway.ts`

Composes `useWalletRegistry` + `WalletService` + `createWebViewCommandHandler` into a single callback:

```ts
{ handleWalletCommandFromWeb }
```

### 4. `deeplink-handler.ts`

Subscribes to `Linking` URL events, resolves chain from URL path, forwards deeplink to connector's `handleDeeplink`.

---

## Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Adapter | `SolanaConnector` + `phantom-deeplink` / `mwa-adapter` | Platform abstraction (iOS/Android) |
| Registry | `ConnectorRegistry` | Multi-chain connector lookup |
| Composition | `useWalletGateway` | Single entry point for WebView wallet commands |
| Pending Promise | `PhantomDeeplinkAdapter` | Async request/response over deeplink channel |

---

## Error Handling

1. **Bridge layer (`wallet-gateway`)** validates payload and normalizes errors to `{ code, message }`.
2. **Core layer (`core/wallet`)** throws domain errors such as `CHAIN_NOT_SUPPORTED`.
3. **Connector layer (`wallet-connection-*`)** handles wallet-specific protocol errors.
4. Special cases:
   - No active wallet session -> connector throws "Wallet not connected"
   - Unsupported chain -> `WalletConnectionError("CHAIN_NOT_SUPPORTED", ...)`
