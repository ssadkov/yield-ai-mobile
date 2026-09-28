// projectId from Reown Cloud (cloud.reown.com). Kept in .env as EXPO_PUBLIC_*
// so it's bundled into the JS and can be read at runtime.
export const WC_PROJECT_ID = process.env.EXPO_PUBLIC_WC_PROJECT_ID ?? "";

export const WC_METADATA = {
  name: "YieldAI",
  description: "YieldAI Mobile",
  url: "https://yieldai.app",
  icons: ["https://yieldai.app/icon.png"],
  redirect: {
    native: "yieldaimobile://",
  },
};
