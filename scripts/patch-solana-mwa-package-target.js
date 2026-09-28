const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "@solana-mobile",
  "mobile-wallet-adapter-protocol",
  "android",
  "src",
  "main",
  "java",
  "com",
  "solanamobile",
  "mobilewalletadapter",
  "reactnative",
  "SolanaMobileWalletAdapterModule.kt",
);

if (!fs.existsSync(target)) {
  console.warn("[patch-solana-mwa-package-target] MWA Android module not found; skipping");
  process.exit(0);
}

const original = fs.readFileSync(target, "utf8");

if (
  original.includes('config?.hasKey("baseUri")') &&
  original.includes('config?.hasKey("walletPackageName")')
) {
  console.log("[patch-solana-mwa-package-target] MWA package targeting already patched");
  process.exit(0);
}

const safeUriPrefixBlock = [
  "                val uriPrefix =\n",
  '                    if (config?.hasKey("baseUri") == true && !config.isNull("baseUri")) {\n',
  '                        config.getString("baseUri")?.let { Uri.parse(it) }\n',
  "                    } else {\n",
  "                        null\n",
  "                    }\n",
].join("");

const walletPackageNameBlock = [
  "                val walletPackageName =\n",
  '                    if (config?.hasKey("walletPackageName") == true && !config.isNull("walletPackageName")) {\n',
  '                        config.getString("walletPackageName")\n',
  "                    } else {\n",
  "                        null\n",
  "                    }\n",
].join("");

let next = original.replace(
  '                val uriPrefix = config?.getString("baseUri")?.let { Uri.parse(it) }\n',
  safeUriPrefixBlock,
);

if (!next.includes('config?.hasKey("walletPackageName")')) {
  next = next.replace(
    safeUriPrefixBlock,
    safeUriPrefixBlock + walletPackageNameBlock,
  );
}

next = next.replace(
  [
    "                val intent =\n",
    "                    LocalAssociationIntentCreator.createAssociationIntent(\n",
    "                        uriPrefix,\n",
    "                        localAssociation.port,\n",
    "                        localAssociation.session\n",
    "                    )\n",
  ].join(""),
  [
    "                val intent =\n",
    "                    LocalAssociationIntentCreator.createAssociationIntent(\n",
    "                        uriPrefix,\n",
    "                        localAssociation.port,\n",
    "                        localAssociation.session\n",
    "                    ).apply {\n",
    "                        if (!walletPackageName.isNullOrBlank()) {\n",
    "                            setPackage(walletPackageName)\n",
    "                        }\n",
    "                    }\n",
  ].join(""),
);

if (next === original) {
  console.error("[patch-solana-mwa-package-target] Failed to patch MWA Android module");
  process.exit(1);
}

fs.writeFileSync(target, next);
console.log("[patch-solana-mwa-package-target] Patched MWA Android module");
