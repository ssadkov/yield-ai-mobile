const PRODUCTION_WEBVIEW_URL = "https://yieldai.app/";
const configuredWebviewUrl = process.env.EXPO_PUBLIC_MAIN_WEBVIEW_URL?.trim();
const configuredDevWebviewUrl = process.env.EXPO_PUBLIC_MAIN_WEBVIEW_URL_DEV?.trim();

function ensureTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

export function resolveWebViewUrl() {
  if (__DEV__) {
    if (!configuredDevWebviewUrl) {
      throw new Error(
        "Missing EXPO_PUBLIC_MAIN_WEBVIEW_URL_DEV. Set it to a reachable dev URL, e.g. http://192.168.x.x:3000/",
      );
    }

    return ensureTrailingSlash(configuredDevWebviewUrl);
  }

  return ensureTrailingSlash(configuredWebviewUrl || PRODUCTION_WEBVIEW_URL);
}
