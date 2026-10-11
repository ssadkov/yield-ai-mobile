# Wallet Gateway - Architecture & Business Logic

## Overview

The wallet stack is split into four modules:

- **`wallet-gateway`** - connector registration (`useWalletRegistry`), deeplink subscription
- **`core/wallet`** - chain-agnostic domain core (`ChainConnector`, `ConnectorRegistry`, `WalletService`)
- **`wallet-connection-solana`** - Solana connector implementation (Phantom deeplinks, MWA)
- **`wallet-connection-aptos`** - Aptos connector implementation (stub)

Closely related to `wallet-discovery`, which detects installed wallet apps.

---

## Data Flow

```
Native screens (Connect sheet, deposit, withdraw)
    |  connect / sign through the wallet driver
    v
native-driver                   [yield-app/wallet/native-driver.ts]
    |  maps a Connect sheet row to a connector id
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
native-driver returns the account / signature to the screen
```

`WalletRuntime` (`yield-app/wallet/WalletRuntime.tsx`) mounts `useWalletRegistry` once in the root
layout and hands the `WalletService` to the screens through `useWalletEnv`.

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
    │   │   ├── use-wallet-registry.ts
    │   │   ├── types.ts                 # Core re-export (compatibility)
    │   │   ├── wallet-service.ts        # Core re-export (compatibility)
    │   │   └── connector-registry.ts    # Core re-export (compatibility)
    │   └── lib/
    │       ├── deeplink-handler.ts
    │       └── wallet-callback-url.ts
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
yield-app (WalletRuntime, native-driver)
  ├──→ wallet-gateway
  ├──→ wallet-discovery
  └──→ solana-device

wallet-gateway
  ├──→ core/wallet
  ├──→ wallet-connection-solana
  ├──→ wallet-connection-aptos
  └──→ wallet-discovery (DetectedWallet type)

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

### 1. `use-wallet-registry.ts`

Creates one `ConnectorRegistry`, registers Solana and Aptos connectors, subscribes deeplink handler, disposes on unmount.

- Android, regular phone: generic MWA plus one MWA connector per installed MWA wallet (Solflare, Backpack, Jupiter), aimed at its package.
- Android, Solana phone (Seeker): Seed Vault instead of generic MWA, plus Phantom when installed.
- iOS: one connector per installed Solana wallet with a supported transport (deeplink or WalletConnect); Phantom as fallback.

If a deeplink wallet does not support its native `signAndSendTransaction` method, the Solana
connector falls back to `signTransaction` and submits the signed transaction through Solana
JSON-RPC for the configured cluster.

### 2. `deeplink-handler.ts`

Subscribes to `Linking` URL events, resolves chain from URL path, forwards deeplink to connector's `handleDeeplink`.

---

## Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Adapter | `SolanaConnector` + `phantom-deeplink` / `mwa-adapter` | Platform abstraction (iOS/Android) |
| Registry | `ConnectorRegistry` | Multi-chain connector lookup |
| Composition | `WalletRuntime` | Mounts connectors once, exposes `WalletService` to screens |
| Pending Promise | `PhantomDeeplinkAdapter` | Async request/response over deeplink channel |

---

## Error Handling

1. **Driver layer (`yield-app/wallet/native-driver`)** maps errors to `WalletError` for the screens.
2. **Core layer (`core/wallet`)** throws domain errors such as `CHAIN_NOT_SUPPORTED`.
3. **Connector layer (`wallet-connection-*`)** handles wallet-specific protocol errors.
4. Special cases:
   - No active wallet session -> connector throws "Wallet not connected"
   - Unsupported chain -> `WalletConnectionError("CHAIN_NOT_SUPPORTED", ...)`
