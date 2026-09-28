const { withAndroidManifest } = require('expo/config-plugins');

// Keep in sync with src/features/wallet-discovery/model/wallet-registry.ts:
// Android 11+ hides other apps from getPackageInfo unless they are listed here.
const PACKAGES = [
  'app.phantom',
  'com.solflare.mobile',
  'app.backpack.mobile',
  'ag.jup.jupiter.android',
  'com.luma.wallet.prod',
  'com.luma.wallet',
  'io.glow.app',
  'com.aptoslabs.petra.wallet',
  'com.martianwallet.app',
  'io.metamask',
  'com.wallet.crypto.trustapp',
  'com.okinc.okex.gp',
  'com.okx.wallet',
  'com.bitkeep.wallet',
  'org.toshi',
  'me.rainbow',
  'com.uniswap.mobile',
];

const SCHEME_INTENTS = [
  { scheme: 'https', withDefault: false },
  { scheme: 'petra', withDefault: true },
];

function buildIntent({ scheme, withDefault }) {
  const categories = [
    ...(withDefault
      ? [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
      : []),
    { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
  ];

  return {
    action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
    category: categories,
    data: [{ $: { 'android:scheme': scheme } }],
  };
}

module.exports = function withAndroidWalletQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    const queries = manifest.queries?.[0] ?? {};
    const existingIntents = queries.intent ?? [];
    const existingPackages = queries.package ?? [];

    const newIntents = SCHEME_INTENTS.filter(
      ({ scheme }) =>
        !existingIntents.some((intent) =>
          intent.data?.some((d) => d.$?.['android:scheme'] === scheme),
        ),
    ).map(buildIntent);

    const newPackages = PACKAGES.filter(
      (name) =>
        !existingPackages.some((p) => p.$?.['android:name'] === name),
    ).map((name) => ({ $: { 'android:name': name } }));

    manifest.queries = [
      {
        intent: [...existingIntents, ...newIntents],
        package: [...existingPackages, ...newPackages],
      },
    ];

    return config;
  });
};
