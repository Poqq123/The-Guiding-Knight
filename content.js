(() => {
  const AUTO_ANALYZE_HOSTS = ["chess.com"];
  const AUTO_ANALYZE_INTERVAL_MS = 1400;
  const { SETTINGS_KEYS, DEFAULT_SETTINGS } = globalThis.CBMS_SHARED_SETTINGS;
  const {
    clampDepth,
    clampOpacity,
    safeStorageGet,
    safeStorageSet,
    getChangedValue
  } = globalThis.CBMS_SHARED_HELPERS;
  const contentNamespace = globalThis.CBMS_CONTENT;
  const autoSuggestState = contentNamespace.state;
  const { extractPositionFromPage } = contentNamespace.detection;
  const {
    findPrimaryBoardElement,
    ensureOverlay,
    applyOverlayVisibility,
    applyOverlayAppearance,
    clearArrow,
    setOverlayStatus,
    renderSuggestedMoves,
    buildOverlayReadyText,
    isUsersTurn
  } = contentNamespace.overlay;

  bootAutoSuggest();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "GET_PAGE_POSITION") {
      return false;
    }

    try {
      const position = extractPositionFromPage();

      if (!position) {
        sendResponse({
          ok: false,
          error: "No FEN string was found on this page."
        });
        return true;
      }

      sendResponse({
        ok: true,
        position
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error.message
      });
    }

    return true;
  });

  function bootAutoSuggest() {
    if (!AUTO_ANALYZE_HOSTS.some((host) => location.hostname.includes(host))) {
      return;
    }

    loadSettings();
    chrome.storage.onChanged.addListener(handleStorageChange);
    window.setInterval(syncAutoSuggest, AUTO_ANALYZE_INTERVAL_MS);
    window.addEventListener("resize", () => {
      if (autoSuggestState.lastAnalysisResult?.bestMove && autoSuggestState.overlayEnabled) {
        renderSuggestedMoves(autoSuggestState.lastAnalysisResult);
      }
    });
    syncAutoSuggest();
  }

  function syncAutoSuggest() {
    try {
      const boardElement = findPrimaryBoardElement();
      if (!boardElement) {
        return;
      }

      ensureOverlay(boardElement, handleOverlayToggle);
      applyOverlayVisibility();

      if (!autoSuggestState.overlayEnabled) {
        setOverlayStatus("Overlay hidden", "idle");
        clearArrow();
        return;
      }

      const position = extractPositionFromPage();
      if (!position?.fen) {
        setOverlayStatus("Scanning board", "idle");
        return;
      }

      if (!autoSuggestState.autoAnalyzeEnabled) {
        setOverlayStatus("Auto-analyze off", "idle");
        clearArrow();
        return;
      }

      if (autoSuggestState.myTurnOnly && !isUsersTurn(position.fen)) {
        setOverlayStatus("Waiting for your turn", "idle");
        clearArrow();
        return;
      }

      if (position.fen === autoSuggestState.lastSeenFen) {
        return;
      }

      autoSuggestState.lastSeenFen = position.fen;
      queueAnalysis(position);
    } catch (error) {
      setOverlayStatus(error.message || "Overlay error", "error");
    }
  }

  function loadSettings() {
    safeStorageGet(Object.values(SETTINGS_KEYS)).then((store) => {
      applySettings({
        ...DEFAULT_SETTINGS,
        ...store
      });
      applyOverlayVisibility();
    });
  }

  function persistOverlayPreference() {
    return safeStorageSet({
      [SETTINGS_KEYS.overlayEnabled]: autoSuggestState.overlayEnabled
    });
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local") {
      return;
    }

    const nextSettings = {
      overlayEnabled: getChangedValue(changes, SETTINGS_KEYS.overlayEnabled, autoSuggestState.overlayEnabled),
      autoAnalyzeEnabled: getChangedValue(changes, SETTINGS_KEYS.autoAnalyzeEnabled, autoSuggestState.autoAnalyzeEnabled),
      myTurnOnly: getChangedValue(changes, SETTINGS_KEYS.myTurnOnly, autoSuggestState.myTurnOnly),
      showArrow: getChangedValue(changes, SETTINGS_KEYS.showArrow, autoSuggestState.showArrow),
      showDestination: getChangedValue(changes, SETTINGS_KEYS.showDestination, autoSuggestState.showDestination),
      showSecondCandidate: getChangedValue(changes, SETTINGS_KEYS.showSecondCandidate, autoSuggestState.showSecondCandidate),
      autoDepth: getChangedValue(changes, SETTINGS_KEYS.autoDepth, autoSuggestState.autoDepth),
      controlsOpacity: getChangedValue(changes, SETTINGS_KEYS.controlsOpacity, autoSuggestState.controlsOpacity),
      moveOpacity: getChangedValue(changes, SETTINGS_KEYS.moveOpacity, autoSuggestState.moveOpacity)
    };

    applySettings(nextSettings);
    applyOverlayAppearance();
    applyOverlayVisibility();

    if (!autoSuggestState.overlayEnabled || !autoSuggestState.autoAnalyzeEnabled) {
      clearArrow();
    } else if (autoSuggestState.lastAnalysisResult?.bestMove) {
      renderSuggestedMoves(autoSuggestState.lastAnalysisResult);
    }

    autoSuggestState.lastSeenFen = "";
    syncAutoSuggest();
  }

  function applySettings(settings) {
    autoSuggestState.overlayEnabled = settings.overlayEnabled;
    autoSuggestState.autoAnalyzeEnabled = settings.autoAnalyzeEnabled;
    autoSuggestState.myTurnOnly = settings.myTurnOnly;
    autoSuggestState.showArrow = settings.showArrow;
    autoSuggestState.showDestination = settings.showDestination;
    autoSuggestState.showSecondCandidate = settings.showSecondCandidate;
    autoSuggestState.autoDepth = clampDepth(settings.autoDepth);
    autoSuggestState.controlsOpacity = clampOpacity(settings.controlsOpacity, DEFAULT_SETTINGS.controlsOpacity);
    autoSuggestState.moveOpacity = clampOpacity(settings.moveOpacity, DEFAULT_SETTINGS.moveOpacity);
  }

  function queueAnalysis(position) {
    autoSuggestState.queuedPosition = position;
    flushQueuedAnalysis();
  }

  async function flushQueuedAnalysis() {
    if (
      autoSuggestState.analysisInFlight ||
      !autoSuggestState.overlayEnabled
    ) {
      return;
    }

    const position = autoSuggestState.queuedPosition;
    if (!position?.fen) {
      return;
    }

    if (position.fen === autoSuggestState.lastAnalyzedFen) {
      autoSuggestState.queuedPosition = null;
      return;
    }

    autoSuggestState.queuedPosition = null;
    autoSuggestState.analysisInFlight = true;
    autoSuggestState.lastAnalyzedFen = position.fen;
    setOverlayStatus(`Analyzing depth ${autoSuggestState.autoDepth}`, "busy");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_FEN",
        fen: position.fen,
        depth: autoSuggestState.autoDepth
      });

      autoSuggestState.analysisInFlight = false;

      if (!response?.ok) {
        setOverlayStatus(response?.error || "Analysis failed", "error");
        flushQueuedAnalysis();
        return;
      }

      const result = response.result;
      autoSuggestState.lastBestMove = result?.bestMove || "";
      autoSuggestState.lastRenderedFen = position.fen;
      autoSuggestState.lastAnalysisResult = result ?? null;

      if (!autoSuggestState.overlayEnabled) {
        clearArrow();
        setOverlayStatus("Overlay hidden", "idle");
      } else if (!result?.bestMove || result.bestMove === "(none)") {
        clearArrow();
        setOverlayStatus("No legal move", "ready");
      } else {
        renderSuggestedMoves(result);
        setOverlayStatus(buildOverlayReadyText(result), "ready");
      }
    } catch (error) {
      autoSuggestState.analysisInFlight = false;
      setOverlayStatus(error.message || "Analysis failed", "error");
    }

    flushQueuedAnalysis();
  }

  function handleOverlayToggle() {
    autoSuggestState.overlayEnabled = !autoSuggestState.overlayEnabled;
    persistOverlayPreference();
    applyOverlayVisibility();

    if (!autoSuggestState.overlayEnabled) {
      clearArrow();
      setOverlayStatus("Overlay hidden", "idle");
      return;
    }

    setOverlayStatus("Scanning board", "idle");
    autoSuggestState.lastSeenFen = "";
    syncAutoSuggest();
  }
})();
