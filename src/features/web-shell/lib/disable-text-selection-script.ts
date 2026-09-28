export const DISABLE_TEXT_SELECTION_SCRIPT = `
(function () {
  var styleId = "yieldai-disable-selection";

  function installStyle() {
    if (document.getElementById(styleId)) return;

    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      "* {",
      "  -webkit-touch-callout: none !important;",
      "  -webkit-user-select: none !important;",
      "  user-select: none !important;",
      "}",
      "input, textarea, [contenteditable], [data-allow-text-selection='true'] {",
      "  -webkit-touch-callout: default !important;",
      "  -webkit-user-select: text !important;",
      "  user-select: text !important;",
      "}"
    ].join("\\n");

    (document.head || document.documentElement).appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installStyle, { once: true });
  } else {
    installStyle();
  }

  true;
})();
true;
`;
