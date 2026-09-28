# Petra Mobile Deeplink: "Encryption key does not match" — Investigation Handoff

**Purpose:** Hand this document to Codex (or another agent) to continue debugging.  
**Last updated:** 2026-06-03  
**Status:** Unresolved in production testing on Solana Seeker (Android), Petra **keyless** account.

---

## 1. Symptom

When the user initiates an Aptos transfer (or swap) from the YieldAI **mobile WebView**, Petra opens for signing but shows:

> **Encryption key does not match. Please Reconnect**

The error appears **inside Petra** before transaction parsing — it is a deeplink encryption/session mismatch, not an on-chain simulation error.

---

## 2. Architecture (what we are testing)

| Layer | Repo | Role |
|-------|------|------|
| Native shell | `yieldai-mobile` (`main`) | Expo app, WebView, `YieldAIBridge` ↔ `WalletService` ↔ `PetraDeeplinkAdapter` |
| Web app | `yield-ai` branch `feature/tools_sign_message` | Next.js on Vercel preview; transfer/swap call `signAndSubmitAptosTransaction` when `__YIELDAI_NATIVE_APP__` |
| Wallet | Petra Android app | Mobile2mobile deeplink: `petra:///api/v1/connect`, `signAndSubmit`, `disconnect` |
| Redirect | `yieldaimobile:///api/v1/...` | App receives connect/sign/disconnect callbacks |

**WebView URL in dev:** `EXPO_PUBLIC_MAIN_WEBVIEW_URL_DEV` → Vercel preview  
`https://yield-ai-git-feature-toolssignmessage-edbiz.vercel.app/`  
(Native Metro port does **not** load the web UI.)

**Reference implementation:** [aptos-labs/mobile2mobile-example](https://github.com/aptos-labs/mobile2mobile-example)  
**Spec:** [Petra mobile deeplinks](https://petra.app/docs/mobile-deeplinks)

---

## 3. Does Metro port 8081 vs 8082 matter?

**For Petra encryption: effectively no**, given current setup.

| Question | Answer |
|----------|--------|
| What does port 8082 carry? | Only the **React Native / Expo native shell** JS bundle (dev client). |
| What does WebView load? | **Remote HTTPS** Vercel preview (see log: `[WebView] Using dev URL: https://yield-ai-git-...vercel.app/`). |
| Could 8081 vs 8082 break Petra crypto? | Not directly — Petra never talks to Metro. |
| What **does** break sessions? | **Metro fast refresh / rebundle** (`Android Bundled …` in logs) while Petra sign UI is open; duplicate `connect_wallet` with a **new** `dappEncryptionPublicKey` while Petra still holds an older pairing. |

**Recommendation for testers:** Free port 8081 for consistency (`npx kill-port 8081` or stop other Expo), but treat **hot reload (`r`) and file-save rebundles** as the real hazard during Petra flows.

---

## 4. Key open questions for Codex

### A. Session / key lifecycle

1. After `connect`, is `sharedSecret = nacl.box.before(petraPublicEncryptedKey, dAppSecretKey)` correct for **keyless** Petra accounts (`type: "keyless"` in connect response), or does Petra expect `nacl.box.open` on an encrypted blob instead of `box.before` on raw hex?
2. When the native app **rebundles** (Metro) mid-sign, can `Linking.getInitialURL()` replay an **old** `/connect?response=approved` while `connect()` already generated a **new** `dAppKeyPair`?
3. Does Petra allow multiple concurrent dApp encryption keys for the same `appInfo.domain`, or does a new connect without disconnect invalidate the previous key on Petra’s side?

### B. Payload / transaction shape

4. Does Petra mobile `signAndSubmit` support `0x1::primary_fungible_store::transfer` with `type_arguments: ["0x1::fungible_asset::Metadata"]`, or only simple `0x1::coin::transfer` + `AptosCoin` (as in the official example)?
5. Are numeric `arguments` (e.g. `2947`) required vs string `"2947"` inside the encrypted JSON?
6. Is our double encoding identical to Petra’s expectation?  
   Official: `payload = btoa(JSON.stringify(entry_function))` → encrypt `JSON.stringify(payload)` with `nacl.box.after`.  
   Our code: `encryptPayload()` in `petra-service.ts` — verify byte-for-byte against a captured Petra-approved payload.

### C. App / bridge behavior

7. Why does `connect_wallet { chain: "all" }` fire again immediately after Metro rebundle (user may not intend reconnect)?
8. Is persisted session (`petra-session-store.ts` + AsyncStorage) restored **before** web sends `connect_wallet`, or does web always force a new native connect?
9. Should we **mandate** `disconnect` in Petra before every new `dAppKeyPair` (official example clears keys on disconnect)?

### D. Environment

10. Does the issue reproduce on **non-keyless** Petra (seed/import wallet) vs **keyless** (Google)?
11. Does it reproduce on the standalone **mobile2mobile-example** APK on the same device with the same Petra account?
12. Network: mobile config uses `mainnet` in `AptosConnector` — mismatch if Petra is on testnet?

---

## 5. How we test (repro checklist)

### Prerequisites

- Device: Android (Solana Seeker reported).
- Apps: YieldAI dev build (`npm run android`), Petra installed.
- Web: Vercel preview on branch `feature/tools_sign_message` (commits through `f9381314` web, `3e349de` mobile).
- Metro: optional 8081 or 8082; **avoid pressing `r` during Petra sign.**

### Steps (minimal)

1. Kill stale Metro on 8081 if needed; run `npm run android` (note dev client URL `http://<LAN>:8082` is OK).
2. In Petra: disconnect dApp **YieldAI** once (settings / connected apps).
3. Open YieldAI → Connect wallet (native) → approve in Petra → return to app.
4. Confirm log: `[Mobile → Web] wallet_connected` with `walletId: "petra"`.
5. Open Transfer → select **APT** (not FA token) → small amount → recipient → Confirm.
6. Petra should open; user approves.
7. **Expected:** tx hash back to web. **Actual:** Encryption key error in Petra.

### Steps (FA token — often used in logs)

- Token transfer uses `0x1::primary_fungible_store::transfer` + FA metadata type arg.
- Logged base64 decodes to numeric amount e.g. `2947`.

### What to capture in logs

```
[Petra] connect URL: ... dappEncryptionPublicKey in connect envelope
[Petra] signAndSubmit URL (pubkey prefix): <first 16 hex chars>
[Mobile ← Web] sign_and_submit_transaction
[Mobile ← Web] disconnect_wallet   # should NOT appear between sign open and result
Android Bundled ...                # should NOT appear between sign open and result
[Petra] restored persisted session # after fix 3e349de, on cold start
[Petra] Ignoring stale connect deeplink
```

**Rule:** `dappEncryptionPublicKey` on **signAndSubmit** must match the key from the **same** successful `connect` handshake (prefix log is a quick check).

---

## 6. Log analysis (available capture)

> Note: User referenced `terminals/2.txt` lines 924–1070; current file is shorter (~141 lines). Below is the latest contiguous session.

### Timeline A — failure with rebundle

| Step | Log evidence |
|------|----------------|
| Connect | `dappEncryptionPublicKey` … `c6437833…` (from connect URL) |
| Sign FA | `signAndSubmit` pubkey prefix `c64378336677d37e` (matches) |
| **Metro rebundle** | `Android Bundled 149ms` immediately after sign URL |
| Re-connect | `connect_wallet` → new key `0fec4ba77…` |
| Sign APT | `coin::transfer`, pubkey prefix `0fec4ba77a5ca576` (matches new connect) |
| User report | Still encryption error in Petra |

### Timeline B — after full rebuild on 8082

| Step | Log evidence |
|------|----------------|
| Metro | Port 8082 (`8081` in use) — dev client `192.168.1.68:8082` |
| WebView | Vercel preview URL (not localhost) |
| Connect | `ff719eb5…` connect key |
| Connect ack | `petraPublicEncryptedKey: 0x79cd770b…`, `type: "keyless"` |
| Sign FA | `primary_fungible_store::transfer`, pubkey prefix `ff719eb5f2634d12` (matches) |
| No `disconnect_wallet` in snippet | Good |
| User report | **Same encryption error** |

**Conclusion from logs:** Pubkey prefix often **matches** within one session; error still happens → suspect Petra-side session state, payload type (FA), keyless account, or stale pairing not visible in prefix-only log.

---

## 7. Fixes already attempted (commits)

### `yieldai-mobile` (`main`)

| Commit | Summary |
|--------|---------|
| `cafb926` | Bind `dAppKeyPair` to `PetraSession`; sign uses session key + secret |
| `d52a7ee` | Dedupe in-flight connect; skip reconnect if session exists |
| `162aa22` | Block `disconnect` during in-flight sign |
| `3e349de` | Persist session AsyncStorage; ignore stale connect deeplink; keep Aptos connector on unmount; normalize entry_function payload |

**Key files:**

- `src/features/wallet-connection-aptos/model/petra-deeplink-adapter.ts`
- `src/features/wallet-connection-aptos/lib/petra-service.ts`
- `src/features/wallet-connection-aptos/lib/petra-session-store.ts`
- `src/core/wallet/wallet-service.ts`
- `src/features/wallet-gateway/model/use-wallet-registry.ts`

### `yield-ai` (`feature/tools_sign_message`)

| Commit | Summary |
|--------|---------|
| `c4fe3caa` / `7739f98c` | Native transfer path, injected Aptos address |
| `0d4fbf22` | Block disconnect during sign; `coin::transfer` for native APT; numeric args |
| `f9381314` | Block `connect_wallet` while native sign pending |

**Key files:**

- `src/lib/mobile/nativeBridge.ts`
- `src/lib/mobile/submitAptosTransaction.ts`
- `src/components/ui/transfer-modal.tsx`
- `src/components/WalletSelector.tsx`

**Unit tests:** `yieldai-mobile` Jest — 138 passed (includes Petra adapter tests).

---

## 8. Suggested next experiments (for Codex)

1. **Isolation app:** Run official `mobile2mobile-example` on same device/account; if it works, diff URL builders byte-for-byte with ours.
2. **APT-only test:** Force `0x1::coin::transfer` + `AptosCoin` only (disable FA path in transfer modal for one build).
3. **Full key logging (dev only):** Log full `dappEncryptionPublicKey` connect vs sign (not only prefix) + hash of `sharedSecret` to detect silent mismatch.
4. **Forced disconnect before connect:** Always open Petra `disconnect` before `connect` when web requests `connect_wallet` and persisted session older than N minutes.
5. **Keyless vs seed:** Repro matrix with two Petra account types.
6. **No Metro:** Test release APK (`expo run:android --variant release` or EAS build) to eliminate rebundle class of bugs.
7. **Petra support / aptos-labs:** Ask if `primary_fungible_store::transfer` is supported via mobile deeplink encryption envelope.

---

## 9. Crypto reference (signAndSubmit)

Official pattern (from Petra docs / mobile2mobile-example):

```javascript
const payload = btoa(JSON.stringify({
  type: "entry_function_payload",
  function: "0x1::coin::transfer",
  type_arguments: ["0x1::aptos_coin::AptosCoin"],
  arguments: [recipientAddress, amountNumber],
}));

const nonce = nacl.randomBytes(24);
const encrypted = nacl.box.after(
  Buffer.from(JSON.stringify(payload)),
  nonce,
  sharedSecretFromConnect,
);

// Outer URL data (base64 JSON):
// { appInfo, payload: hex(encrypted), redirectLink, dappEncryptionPublicKey: hex(dAppPublicKey), nonce: hex(nonce) }
```

Connect:

```javascript
sharedSecret = nacl.box.before(
  Buffer.from(petraPublicEncryptedKey.slice(2), "hex"),
  dAppSecretKey,
);
```

---

## 10. Repos and branches

| Repo | URL | Branch | Latest relevant SHAs |
|------|-----|--------|----------------------|
| yieldai-mobile | https://github.com/Sergey231/yieldai-mobile | `main` | `3e349de` |
| yield-ai | https://github.com/ssadkov/yield-ai | `feature/tools_sign_message` | `f9381314` |

Local worktrees:

- Mobile: `C:\work\yieldai-mobile`
- Web: `C:\work\yield-ai-tools-sign` (branch `feature/tools_sign_message`)

---

## 11. Success criteria

- [ ] User can complete **APT** `coin::transfer` via Petra from WebView transfer modal.
- [ ] Logs show no `disconnect_wallet` / no `Android Bundled` between `signAndSubmit URL` and Petra callback.
- [ ] `dappEncryptionPublicKey` stable across connect + sign for that attempt.
- [ ] Optional: FA `primary_fungible_store::transfer` works or is documented as unsupported with deeplink fallback to browser adapter.

---

## 12. Contact / context

- User wallet in logs: `0xbde46a40b4511c2d999c96af2a8ac363315ed6a17e6c98d5a2bdad82e368e590`
- Petra connect response includes `"type":"keyless"`
- `petraPublicEncryptedKey` often `0x79cd770b5fc2b28178003539cb05c6f88ecbd53d27e50f9cc4384ea7c09efb38` across sessions (Petra side stable; dApp keys rotate)

---

*End of handoff.*
