const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  "react-native",
  "browser",
  "require",
  "import",
  "default",
];

const defaultResolveRequest = config.resolver.resolveRequest;
const path = require("path");

const browserFieldPackages = ["uint8arrays", "multiformats"];
const browserMaps = new Map(
  browserFieldPackages
    .map((pkg) => {
      try {
        const browser = require(
          path.resolve(__dirname, `node_modules/${pkg}/package.json`),
        ).browser;
        return browser && typeof browser === "object" ? [pkg, browser] : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean),
);

function resolveViaBrowserField(moduleName) {
  for (const [pkg, browser] of browserMaps) {
    if (moduleName !== pkg && !moduleName.startsWith(pkg + "/")) continue;
    const tail = moduleName === pkg ? "" : moduleName.slice(pkg.length + 1);
    const tailNoExt = tail.replace(/\.js$/, "");
    const candidates = moduleName === pkg
      ? ["."]
      : [`./${tail}`, `./${tailNoExt}`];
    for (const key of candidates) {
      const target = browser[key];
      if (target) {
        return path.resolve(__dirname, `node_modules/${pkg}`, target);
      }
    }
  }
  return null;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Web only: the "import" condition above sends @babel/runtime helpers to their
  // ESM files, which the CJS output calls as plain functions (undefined on web).
  if (platform === "web" && moduleName.startsWith("@babel/runtime/")) {
    const ctx = { ...context, unstable_conditionNames: ["browser", "require", "default"] };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  // Privy's Expo setup: isows/jose (used by viem and Privy) and zustand inside
  // @privy-io must resolve without package exports, or Metro picks their
  // browser/ESM builds. Scoped so the app's own zustand import is untouched.
  if (
    /^(isows|jose)(\/|$)/.test(moduleName) ||
    (/^zustand(\/|$)/.test(moduleName) &&
      (context.originModulePath || "").includes("/node_modules/@privy-io/"))
  ) {
    const ctx = { ...context, unstable_enablePackageExports: false };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  // @noble/hashes exports "./crypto" but lacks a "require" condition, so Metro
  // falls back to file-based resolution and warns. Resolve directly to the file
  // to bypass the exports-map validation.
  if (
    moduleName === "@noble/hashes/crypto" ||
    moduleName === "@noble/hashes/crypto.js"
  ) {
    return {
      filePath: path.resolve(
        __dirname,
        "node_modules/@noble/hashes/crypto.js",
      ),
      type: "sourceFile",
    };
  }
  // Packages that ship both an "exports" map and a legacy top-level "browser"
  // map pointing at different files (esm vs cjs) trigger a Metro warning: it
  // applies the browser redirect first, then validates the rewritten path
  // against exports, which doesn't list the cjs subpath. Mirror the browser
  // map ourselves so resolution skips the exports validation.
  const browserMapped = resolveViaBrowserField(moduleName);
  if (browserMapped) {
    return { filePath: browserMapped, type: "sourceFile" };
  }
  // MWA package exports lack a "." key — Metro may miss the react-native condition.
  // Force resolution to the native entry on Android.
  if (
    moduleName === "@solana-mobile/mobile-wallet-adapter-protocol" &&
    platform === "android"
  ) {
    return {
      filePath: path.resolve(
        __dirname,
        "node_modules/@solana-mobile/mobile-wallet-adapter-protocol/lib/cjs/index.native.js",
      ),
      type: "sourceFile",
    };
  }
  // tslib's exports map has no "require" key, so Metro picks the ESM entry when
  // WalletConnect packages do `require("tslib")`. The ESM entry re-imports the
  // CJS file as a default import, which Metro returns as `undefined`, causing
  // `tslib_1.__extends of undefined` at runtime. Force tslib to its CJS entry.
  if (moduleName === "tslib") {
    const origin = context.originModulePath || "";
    const nestedMatch = origin.match(/(.*\/node_modules\/@walletconnect\/[^/]+)\//);
    const nestedTslib = nestedMatch
      ? path.join(nestedMatch[1], "node_modules/tslib/tslib.js")
      : null;
    const rootTslib = path.resolve(__dirname, "node_modules/tslib/tslib.js");
    const fs = require("fs");
    const filePath = nestedTslib && fs.existsSync(nestedTslib) ? nestedTslib : rootTslib;
    return { filePath, type: "sourceFile" };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
