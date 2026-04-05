(() => {
  const SETTINGS_KEYS = {
    suggestionMode: "suggestionMode",
    overlayEnabled: "overlayEnabled",
    autoAnalyzeEnabled: "autoAnalyzeEnabled",
    myTurnOnly: "myTurnOnly",
    showArrow: "showArrow",
    showDestination: "showDestination",
    showSecondCandidate: "showSecondCandidate",
    autoDepth: "autoDepth",
    controlsOpacity: "controlsOpacity",
    moveOpacity: "moveOpacity"
  };

  const DEFAULT_SETTINGS = {
    suggestionMode: "automatic",
    overlayEnabled: true,
    autoAnalyzeEnabled: true,
    myTurnOnly: false,
    showArrow: true,
    showDestination: true,
    showSecondCandidate: true,
    autoDepth: 10,
    controlsOpacity: 90,
    moveOpacity: 85
  };

  globalThis.CBMS_SHARED_SETTINGS = Object.freeze({
    SETTINGS_KEYS: Object.freeze(SETTINGS_KEYS),
    DEFAULT_SETTINGS: Object.freeze(DEFAULT_SETTINGS)
  });
})();
