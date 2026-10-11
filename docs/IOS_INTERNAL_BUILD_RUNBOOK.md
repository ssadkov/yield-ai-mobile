# YieldAI Mobile — iOS internal build & EAS Updates

Working process for running YieldAI Mobile on iPhone via EAS internal builds and publishing JS updates without a new IPA.

## Current setup

- Apple Developer membership: Sergey Sadkov
- Apple Team ID: `RY26UXEX58`
- Expo owner: `sadkovs-team`
- EAS project: `@sadkovs-team/yieldai`
- EAS project ID: `d29f82e7-7767-44bf-9282-273a09e8ac3c`
- iOS bundle identifier: `com.yieldai.mobile`
- Internal iOS build: EAS profile `preview`
- OTA updates: EAS Update channels `preview` and `production`

## Repo configuration

- `app.json`
  - `expo.owner`: `sadkovs-team`
  - `expo.ios.bundleIdentifier`: `com.yieldai.mobile`
  - `expo.ios.appleTeamId`: `RY26UXEX58`
  - `expo.extra.eas.projectId`: `d29f82e7-7767-44bf-9282-273a09e8ac3c`
  - `expo.updates.url`: `https://u.expo.dev/d29f82e7-7767-44bf-9282-273a09e8ac3c`
  - `expo.runtimeVersion.policy`: `appVersion`
- `eas.json`
  - `build.preview`: internal distribution, channel `preview`
  - `build.production`: channel `production`

`EXPO_PUBLIC_WC_PROJECT_ID` is still optional for early iPhone builds. Without it, Jupiter / WalletConnect flows can fail at runtime. Petra and Phantom do not depend on it.

## Windows setup

From the repo root:

```powershell
cd C:\work\yieldai-mobile
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest whoami
```

Expected context:

- user: `sadkov`
- account/team: `sadkovs-team`

The project is already linked to EAS. Re-running `eas init` is usually unnecessary.

## Register iPhones for internal distribution

Every test iPhone must be registered before an ad hoc / internal install will work:

```powershell
npx.cmd eas-cli@latest device:create
```

CLI choices:

- Expo account: `sadkovs-team`
- Apple team: `Sergey Sadkov (RY26UXEX58)`
- registration method: website / QR link

Open the generated link on each iPhone and install the device profile. Prefer registering all test devices before building.

List devices:

```powershell
npx.cmd eas-cli@latest device:list
```

If a new iPhone is added after a build, the old `.ipa` may not install. Rebuild `preview` (or re-sign) so the new UDID is in the ad hoc profile.

## Build and install

Internal iOS build (includes EAS Update channel wiring):

```powershell
npx.cmd eas-cli@latest build -p ios --profile preview
```

When EAS asks for Apple credentials, use managed credentials:

- Apple team: `Sergey Sadkov (RY26UXEX58)`
- credentials/provisioning: let EAS manage
- distribution: internal / ad hoc

After the build finishes, open the install link from EAS on a registered iPhone.

## Developer Mode on iPhone

On iOS 16+ internal builds require Developer Mode:

1. Open `Settings`
2. `Privacy & Security`
3. `Developer Mode`
4. Enable, reboot, confirm with passcode

If `Developer Mode` is missing, install the internal build / device profile first, then check Settings again.

## Publish OTA updates (no new IPA)

Use this for JS/TS and asset changes that do **not** require native code, new native modules, permission changes, or `appVersion` bumps.

Preview channel (matches internal builds):

```powershell
npx.cmd eas-cli@latest update --channel preview --message "describe the change"
```

Production channel (matches production builds):

```powershell
npx.cmd eas-cli@latest update --channel production --message "describe the change"
```

Rebuild a full IPA when you change:

- native modules / autolinking
- `app.json` iOS entitlements, permissions, plugins, or `appleTeamId`
- `expo.version` / `runtimeVersion` (policy is `appVersion`)
- anything that must ship inside the binary

## Smoke test checklist

On a registered iPhone with the latest internal build:

1. App opens on the native onboarding screen
2. Connect Phantom and run a minimal transaction flow
3. Connect Petra and run a minimal transaction flow
4. Confirm return from wallet deeplink into YieldAI Mobile
5. Confirm cancel / timeout does not leave a stuck pending signing state
6. After an OTA publish to `preview`, relaunch the app and confirm the update is applied

## Related docs

- Expo internal distribution: https://docs.expo.dev/build/internal-distribution/
- EAS Build: https://docs.expo.dev/build/
- EAS Update: https://docs.expo.dev/eas-update/introduction/
- EAS managed credentials: https://docs.expo.dev/app-signing/managed-credentials/
- iOS Developer Mode: https://docs.expo.dev/guides/ios-developer-mode/
