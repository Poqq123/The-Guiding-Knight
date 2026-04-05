(() => {
  const { DEFAULT_SETTINGS } = globalThis.CBMS_SHARED_SETTINGS;
  const contentNamespace = globalThis.CBMS_CONTENT || (globalThis.CBMS_CONTENT = {});

  contentNamespace.state = {
    boardElement: null,
    overlayRoot: null,
    controlsElement: null,
    toggleButton: null,
    badgeElement: null,
    arrowElement: null,
    arrowHeadElement: null,
    secondaryArrowElement: null,
    secondaryArrowHeadElement: null,
    labelElement: null,
    destinationElement: null,
    lastSeenFen: "",
    lastAnalyzedFen: "",
    queuedPosition: null,
    analysisInFlight: false,
    lastBestMove: "",
    lastRenderedFen: "",
    lastAnalysisResult: null,
    overlayEnabled: DEFAULT_SETTINGS.overlayEnabled,
    autoAnalyzeEnabled: DEFAULT_SETTINGS.autoAnalyzeEnabled,
    myTurnOnly: DEFAULT_SETTINGS.myTurnOnly,
    showArrow: DEFAULT_SETTINGS.showArrow,
    showDestination: DEFAULT_SETTINGS.showDestination,
    showSecondCandidate: DEFAULT_SETTINGS.showSecondCandidate,
    autoDepth: DEFAULT_SETTINGS.autoDepth,
    controlsOpacity: DEFAULT_SETTINGS.controlsOpacity,
    moveOpacity: DEFAULT_SETTINGS.moveOpacity
  };
})();
