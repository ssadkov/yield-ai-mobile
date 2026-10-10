# Yield AI — USDC savings, flexible or fixed

A native Android app for Solana Mobile (Seeker) that puts USDC to work in one tap, without
giving up custody. The user picks a plan, approves one transaction in their wallet, and sees
exactly where the money is.

- **Flexible** — USDC supplied to Kamino. Variable APY, withdraw any time.
- **Fixed** — USDC converted into an Exponent principal token (PT) that matures on
  2027-01-10. The rate is locked at deposit; exiting before maturity sells at the market price.

Funds sit in a **Yield AI Safe**: an on-chain account owned by the user's wallet, managed by
the Yield AI Solana program (`yie1Jjq6y3rjsiGkgMYnwTveSgpSrSh4n41JHRNyBih` on mainnet). The
app never holds keys. Every action is a transaction the user signs in their own wallet.

## Built for the phone

- **Mobile Wallet Adapter + Seed Vault.** On Seeker the app connects to Seed Vault over MWA,
  so signing is the device's double-tap approval. Solflare, Backpack and Jupiter are opened
  directly over MWA as well.
- **Native screens, not a web wrapper.** React Native (Expo, new architecture): onboarding,
  home with balance and plans, strategy detail, deposit and withdraw sheets, activity.
- **Haptics and bottom sheets** throughout.
- **"Where is my money" is first-class.** Every operation links to its transaction in the
  explorer.

## How a deposit works

1. The app asks the Yield AI API for a transaction plan (create Safe, deposit, withdraw).
2. **Before signing**, the app checks the transaction itself (`src/features/yield-app/chain/tx.ts`):
   v0 message, ≤ 1232 bytes, the user is the only signer and fee payer, the blockhash comes
   from the plan, only allowlisted programs and Safe instructions. Network, program ID, USDC
   mint and genesis hash are pinned in the app; a plan for any other network is refused.
3. The wallet signs (`signTransaction`, no submit). The app verifies the ed25519 signature.
4. The signed bytes are written to a local journal **before** sending (`chain/journal.ts`).
   If the app is killed or the network drops, it re-checks the same signature on restart
   instead of signing a second transaction. An unresolved transfer blocks new operations
   until it is resolved.
5. The transaction is sent and tracked to finalization. Expired quotes or blockhashes are
   never sent: the user is told nothing left the wallet and can try again.

Signatures per action on mainnet:

| Action | Signatures |
| --- | --- |
| First deposit (creates the Safe) | +1, once |
| Flexible deposit (wallet → Safe → Kamino, atomic) | 1 |
| Flexible withdraw | 2 per position leg (redeem + return) |
| Fixed: first deposit (account setup) | +1, once |
| Fixed deposit | 1 |
| Fixed withdraw | 1 (market sale before maturity, USDC straight to the wallet) |

## Run it

Requirements: Node 20+, JDK 17+, Android SDK (Android Studio). An Android device or emulator
with an MWA wallet installed; on Seeker, Seed Vault works out of the box.

```bash
npm install
cp .env.example .env
```

Pick the network in `.env`:

```bash
EXPO_PUBLIC_YIELD_NETWORK=mainnet   # real USDC: Kamino + Exponent
# EXPO_PUBLIC_YIELD_NETWORK=devnet  # test USDC, idle Safe deposits only
# (unset)                            # demo mode with a mock wallet and portfolio
```

Everything else in `.env.example` is optional. Without `EXPO_PUBLIC_PRIVY_APP_ID` the
Google sign-in option is shown as "Soon"; without `EXPO_PUBLIC_WC_PROJECT_ID` WalletConnect
is off. Neither is needed for MWA wallets.

Development build on a connected device or emulator:

```bash
npx expo run:android
```

Release APK:

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. If the Gradle
daemon runs out of memory, add `"-Dorg.gradle.jvmargs=-Xmx4096m"`. EAS profiles `mainnet`,
`devnet` and `dapp-store` in `eas.json` build the same APK in the cloud.

To try mainnet you need about 0.02 SOL for rent and fees and 1–3 USDC in the wallet.

## Tests

```bash
npm test
```

22 suites, 230 tests: transaction validation, the signing journal, protocol plans, formatting,
wallet detection and connection.

## Layout

```
src/app/                       routes (expo-router)
src/features/yield-app/
  chain/                       API client, tx validation, journal, send engine, protocol plans
  screens/  sheets/  ui/       native UI
  wallet/                      MWA / Seed Vault driver, Privy, mock driver for demo mode
src/features/wallet-*          wallet discovery and connection (Solana, MWA)
modules/wallet-availability    native module: which wallet apps are installed
plugins/                       Expo config plugins (Android package queries for wallets)
docs/                          MAINNET.md, DEVNET_SEEKER.md — protocol flow and device test plans
```

The Safe program and the API live in
[ssadkov/yield-ai-os-sol](https://github.com/ssadkov/yield-ai-os-sol).

## Team and credits

- **Sergei Sadkov** ([@ssadkov](https://github.com/ssadkov)) — founder of Yield AI; product,
  the Solana Safe program and the API behind the app.
- **[@Vlad0n1m](https://github.com/Vlad0n1m)** — mobile development as a paid contributor.
  Not a member of the hackathon team.
