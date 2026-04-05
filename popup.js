const { SETTINGS_KEYS, DEFAULT_SETTINGS } = globalThis.CBMS_SHARED_SETTINGS;
const { clampDepth, clampOpacity, isLikelyFen } = globalThis.CBMS_SHARED_HELPERS;

const state = {
  lastSource: "none",
  suggestionMode: "automatic",
  lastPosition: null
};

const elements = {
  automaticModeButton: document.getElementById("automaticModeButton"),
  manualModeButton: document.getElementById("manualModeButton"),
  modeDescription: document.getElementById("modeDescription"),
  automaticSummary: document.getElementById("automaticSummary"),
  manualControls: document.getElementById("manualControls"),
  fenInput: document.getElementById("fenInput"),
  depthInput: document.getElementById("depthInput"),
  settingsDepthInput: document.getElementById("settingsDepthInput"),
  detectButton: document.getElementById("detectButton"),
  analyzeButton: document.getElementById("analyzeButton"),
  overlayToggle: document.getElementById("overlayToggle"),
  autoAnalyzeToggle: document.getElementById("autoAnalyzeToggle"),
  myTurnOnlyToggle: document.getElementById("myTurnOnlyToggle"),
  showArrowToggle: document.getElementById("showArrowToggle"),
  showDestinationToggle: document.getElementById("showDestinationToggle"),
  showSecondCandidateToggle: document.getElementById("showSecondCandidateToggle"),
  controlsOpacityInput: document.getElementById("controlsOpacityInput"),
  controlsOpacityValue: document.getElementById("controlsOpacityValue"),
  moveOpacityInput: document.getElementById("moveOpacityInput"),
  moveOpacityValue: document.getElementById("moveOpacityValue"),
  statusBadge: document.getElementById("statusBadge"),
  statusText: document.getElementById("statusText"),
  detectionConfidenceBadge: document.getElementById("detectionConfidenceBadge"),
  sourceText: document.getElementById("sourceText"),
  detectionSummaryText: document.getElementById("detectionSummaryText"),
  diagnosticsList: document.getElementById("diagnosticsList"),
  warningList: document.getElementById("warningList"),
  bestMove: document.getElementById("bestMove"),
  evalText: document.getElementById("evalText"),
  scoreText: document.getElementById("scoreText"),
  pvText: document.getElementById("pvText"),
  candidateList: document.getElementById("candidateList")
};

boot();

async function boot() {
  bindEvents();
  setStatus("idle", "Ready", "The background engine will start when analysis begins.");
  await restoreSettings();
  await restoreLastPosition();
  await restoreLastAnalysis();
}

function bindEvents() {
  chrome.storage.onChanged.addListener(handleStorageChange);
  elements.automaticModeButton.addEventListener("click", () => handleSuggestionModeChange("automatic"));
  elements.manualModeButton.addEventListener("click", () => handleSuggestionModeChange("manual"));
  elements.detectButton.addEventListener("click", handleDetectPosition);
  elements.analyzeButton.addEventListener("click", handleAnalyzePosition);
  elements.overlayToggle.addEventListener("change", () => saveBooleanSetting("overlayEnabled", elements.overlayToggle.checked));
  elements.autoAnalyzeToggle.addEventListener("change", () => saveBooleanSetting("autoAnalyzeEnabled", elements.autoAnalyzeToggle.checked));
  elements.myTurnOnlyToggle.addEventListener("change", () => saveBooleanSetting("myTurnOnly", elements.myTurnOnlyToggle.checked));
  elements.showArrowToggle.addEventListener("change", () => saveBooleanSetting("showArrow", elements.showArrowToggle.checked));
  elements.showDestinationToggle.addEventListener("change", () => saveBooleanSetting("showDestination", elements.showDestinationToggle.checked));
  elements.showSecondCandidateToggle.addEventListener("change", () => saveBooleanSetting("showSecondCandidate", elements.showSecondCandidateToggle.checked));
  elements.settingsDepthInput.addEventListener("change", handleSettingsDepthChange);
  elements.controlsOpacityInput.addEventListener("input", () => handleOpacityInput("controlsOpacity"));
  elements.moveOpacityInput.addEventListener("input", () => handleOpacityInput("moveOpacity"));
}

async function restoreLastPosition() {
  const response = await sendRuntimeMessage({ type: "GET_LAST_POSITION" });

  if (!response?.ok || !response.position?.fen) {
    renderPositionDiagnostics(null);
    return;
  }

  elements.fenInput.value = response.position.fen;
  state.lastSource = response.position.source || "stored";
  state.lastPosition = response.position;
  renderPositionDiagnostics(response.position);
}

async function restoreLastAnalysis() {
  const response = await sendRuntimeMessage({ type: "GET_LAST_ANALYSIS" });

  if (!response?.ok || !response.analysis?.result) {
    return;
  }

  applyAnalysisSnapshot(response.analysis);

  if (state.suggestionMode === "automatic") {
    setStatus("ready", "Synced from board", describeAnalysisSource(response.analysis));
  }
}

async function restoreSettings() {
  try {
    const store = await chrome.storage.local.get(Object.values(SETTINGS_KEYS));
    const settings = {
      ...DEFAULT_SETTINGS,
      ...store
    };

    applySuggestionMode(settings.suggestionMode);
    elements.overlayToggle.checked = settings.overlayEnabled;
    elements.autoAnalyzeToggle.checked = settings.autoAnalyzeEnabled;
    elements.myTurnOnlyToggle.checked = settings.myTurnOnly;
    elements.showArrowToggle.checked = settings.showArrow;
    elements.showDestinationToggle.checked = settings.showDestination;
    elements.showSecondCandidateToggle.checked = settings.showSecondCandidate;
    elements.settingsDepthInput.value = String(settings.autoDepth);
    elements.depthInput.value = String(settings.autoDepth);
    updateOpacityControl("controlsOpacity", settings.controlsOpacity);
    updateOpacityControl("moveOpacity", settings.moveOpacity);
  } catch (error) {
    applySuggestionMode(DEFAULT_SETTINGS.suggestionMode);
    elements.overlayToggle.checked = DEFAULT_SETTINGS.overlayEnabled;
    elements.autoAnalyzeToggle.checked = DEFAULT_SETTINGS.autoAnalyzeEnabled;
    elements.myTurnOnlyToggle.checked = DEFAULT_SETTINGS.myTurnOnly;
    elements.showArrowToggle.checked = DEFAULT_SETTINGS.showArrow;
    elements.showDestinationToggle.checked = DEFAULT_SETTINGS.showDestination;
    elements.showSecondCandidateToggle.checked = DEFAULT_SETTINGS.showSecondCandidate;
    elements.settingsDepthInput.value = String(DEFAULT_SETTINGS.autoDepth);
    elements.depthInput.value = String(DEFAULT_SETTINGS.autoDepth);
    updateOpacityControl("controlsOpacity", DEFAULT_SETTINGS.controlsOpacity);
    updateOpacityControl("moveOpacity", DEFAULT_SETTINGS.moveOpacity);
  }
}

async function handleSuggestionModeChange(mode) {
  const nextMode = normalizeSuggestionMode(mode);
  if (state.suggestionMode === nextMode) {
    return;
  }

  applySuggestionMode(nextMode);

  try {
    await chrome.storage.local.set({
      [SETTINGS_KEYS.suggestionMode]: nextMode
    });
  } catch (error) {
    setStatus("error", "Setting failed", error.message || "Could not save suggestion mode.");
  }
}

function applySuggestionMode(mode) {
  const nextMode = normalizeSuggestionMode(mode);
  const isAutomatic = nextMode === "automatic";

  state.suggestionMode = nextMode;
  elements.automaticModeButton.classList.toggle("mode-option-active", isAutomatic);
  elements.manualModeButton.classList.toggle("mode-option-active", !isAutomatic);
  elements.automaticModeButton.setAttribute("aria-selected", String(isAutomatic));
  elements.manualModeButton.setAttribute("aria-selected", String(!isAutomatic));
  elements.automaticSummary.hidden = !isAutomatic;
  elements.manualControls.hidden = isAutomatic;
  elements.modeDescription.textContent = isAutomatic
    ? "Automatic mode keeps the popup focused on overlay settings while the page detects positions for you."
    : "Manual mode lets you detect a page position, paste a FEN string, and run one-off analysis on demand.";
}

async function saveBooleanSetting(key, value) {
  try {
    await chrome.storage.local.set({
      [SETTINGS_KEYS[key]]: value
    });
  } catch (error) {
    setStatus("error", "Setting failed", error.message || "Could not save setting.");
  }
}

async function handleSettingsDepthChange() {
  const depth = clampDepth(elements.settingsDepthInput.value);
  elements.settingsDepthInput.value = String(depth);
  elements.depthInput.value = String(depth);

  try {
    await chrome.storage.local.set({
      [SETTINGS_KEYS.autoDepth]: depth
    });
  } catch (error) {
    setStatus("error", "Setting failed", error.message || "Could not save depth.");
  }
}

async function handleOpacityInput(key) {
  const value = clampOpacity(
    key === "controlsOpacity"
      ? elements.controlsOpacityInput.value
      : elements.moveOpacityInput.value
  );
  updateOpacityControl(key, value);

  try {
    await chrome.storage.local.set({
      [SETTINGS_KEYS[key]]: value
    });
  } catch (error) {
    setStatus("error", "Setting failed", error.message || "Could not save opacity.");
  }
}

async function handleDetectPosition() {
  toggleBusy(true);
  clearResults();
  setStatus("busy", "Detecting", "Looking for a chess position on the current page.");

  try {
    const response = await sendRuntimeMessage({ type: "GET_ACTIVE_TAB_POSITION" });

    if (!response?.ok || !response.position?.fen) {
      throw new Error(response?.error || "No chess position was detected.");
    }

    elements.fenInput.value = response.position.fen;
    state.lastSource = response.position.source || "page";
    state.lastPosition = response.position;
    renderPositionDiagnostics(response.position);

    setStatus("ready", "Position detected", "A FEN string was captured from the current page.");
  } catch (error) {
    setStatus("error", "Detection failed", error.message);
  } finally {
    toggleBusy(false);
  }
}

async function handleAnalyzePosition() {
  const fen = elements.fenInput.value.trim();
  const depth = clampDepth(elements.depthInput.value);

  if (!isLikelyFen(fen)) {
    setStatus(
      "error",
      "Invalid FEN",
      "Enter a full FEN string before starting analysis."
    );
    return;
  }

  toggleBusy(true);
  clearResults();
  setStatus("busy", "Analyzing", "Sending the position to the analysis worker.");

  const saveResponse = await sendRuntimeMessage({
    type: "SAVE_POSITION",
    position: buildCurrentInputPosition(fen)
  });

  if (saveResponse?.ok && saveResponse.position) {
    state.lastSource = saveResponse.position.source || state.lastSource;
    state.lastPosition = saveResponse.position;
    renderPositionDiagnostics(saveResponse.position);
  }

  const response = await sendRuntimeMessage({
    type: "ANALYZE_FEN",
    fen,
    depth
  });

  if (!response?.ok) {
    setStatus("error", "Analysis failed", response?.error || "Unknown engine error.");
    toggleBusy(false);
    return;
  }

  renderAnalysisResult(response.result);
  setStatus("ready", "Analysis complete", "Best move suggestion received from the background engine.");
  toggleBusy(false);
}

function handleStorageChange(changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  if ("lastAnalysisResult" in changes) {
    const snapshot = changes.lastAnalysisResult.newValue;

    if (snapshot?.result) {
      applyAnalysisSnapshot(snapshot);
      if (state.suggestionMode === "automatic") {
        setStatus("ready", "Synced from board", describeAnalysisSource(snapshot));
      }
    }
  }

  if ("lastKnownPosition" in changes) {
    const position = changes.lastKnownPosition.newValue;
    if (position?.fen) {
      state.lastSource = position.source || state.lastSource;
      state.lastPosition = position;
      renderPositionDiagnostics(position);
    }
  }
}

function clearResults() {
  elements.bestMove.textContent = "-";
  elements.evalText.textContent = "-";
  elements.scoreText.textContent = "-";
  elements.pvText.textContent = "-";
  elements.candidateList.innerHTML = '<li class="candidate-empty">No candidate lines yet.</li>';
}

function renderAnalysisResult(result) {
  elements.bestMove.textContent = formatMoveLabel(result?.bestMove) || "-";
  elements.evalText.textContent = describeEvaluation(result?.score);
  elements.scoreText.textContent = formatScore(result?.score) || "-";
  elements.pvText.textContent = formatPv(result?.pv) || "-";
  renderCandidateLines(result?.lines);
}

function applyAnalysisSnapshot(snapshot) {
  renderAnalysisResult(snapshot.result);

  if (snapshot?.fen) {
    elements.fenInput.value = snapshot.fen;
  }
}

function setStatus(tone, label, description) {
  elements.statusBadge.textContent = label;
  elements.statusBadge.className = `badge ${tone}`;
  elements.statusText.textContent = description;
}

function toggleBusy(isBusy) {
  elements.detectButton.disabled = isBusy;
  elements.analyzeButton.disabled = isBusy;
}

function describeSource(source, capturedAt) {
  const suffix = capturedAt ? ` at ${new Date(capturedAt).toLocaleTimeString()}` : "";
  return `Latest position source: ${formatDetectionSourceLabel(source)}${suffix}.`;
}

function describeAnalysisSource(snapshot) {
  const timeSuffix = snapshot?.analyzedAt
    ? ` at ${new Date(snapshot.analyzedAt).toLocaleTimeString()}`
    : "";
  const moveLabel = formatMoveLabel(snapshot?.result?.bestMove || "");

  if (moveLabel) {
    return `Showing the latest automatic analysis${timeSuffix}: ${moveLabel}.`;
  }

  return `Showing the latest automatic analysis${timeSuffix}.`;
}

function renderPositionDiagnostics(position) {
  if (!position?.fen) {
    elements.detectionConfidenceBadge.textContent = "No Position";
    elements.detectionConfidenceBadge.className = "badge diagnostic-neutral";
    elements.sourceText.textContent = "No page position detected yet.";
    elements.detectionSummaryText.textContent =
      "Detect from page to inspect source confidence and any caveats before trusting the suggestion.";
    renderDiagnosticList(
      elements.diagnosticsList,
      [],
      "No detection details yet."
    );
    elements.warningList.hidden = true;
    elements.warningList.innerHTML = "";
    return;
  }

  const diagnostics = buildDetectionDiagnostics(position);

  elements.detectionConfidenceBadge.textContent = diagnostics.badgeLabel;
  elements.detectionConfidenceBadge.className = `badge ${diagnostics.badgeTone}`;
  elements.sourceText.textContent = describeSource(position.source, position.capturedAt);
  elements.detectionSummaryText.textContent = diagnostics.summary;
  renderDiagnosticList(
    elements.diagnosticsList,
    diagnostics.details,
    "No detection details were provided."
  );

  elements.warningList.hidden = diagnostics.warnings.length === 0;
  renderDiagnosticList(elements.warningList, diagnostics.warnings, "");
}

function buildDetectionDiagnostics(position) {
  const source = typeof position?.source === "string" ? position.source : "unknown";
  const notes = Array.isArray(position?.notes)
    ? position.notes.map((note) => String(note).trim()).filter(Boolean)
    : [];
  const confidence = classifyDetectionConfidence(source, notes);
  const details = notes.length > 0
    ? notes
    : [getDefaultDiagnosticDetail(source)];
  const warnings = buildDetectionWarnings(position, notes);
  const warningSuffix = warnings.length === 0
    ? ""
    : warnings.length === 1
      ? " One warning is flagged below."
      : ` ${warnings.length} warnings are flagged below.`;

  return {
    badgeLabel: confidence.label,
    badgeTone: confidence.tone,
    summary: `${confidence.summary}${warningSuffix}`,
    details,
    warnings
  };
}

function classifyDetectionConfidence(source, notes) {
  if (source === "manual") {
    return {
      label: "Manual Entry",
      tone: "diagnostic-manual",
      summary: "This position came from the popup input, so analysis is valid but page-detection confidence does not apply."
    };
  }

  let level = 2;
  const noteText = notes.join(" ").toLowerCase();

  if (
    source === "chesscom-board-dom" ||
    source === "lichess-fen-field" ||
    source === "chesscom-fen-field" ||
    source === "meta-tag" ||
    source.startsWith("url-param:") ||
    source.startsWith("dom-attribute:")
  ) {
    level = 3;
  } else if (
    source === "visible-text" ||
    source.includes("script") ||
    source === "selected-text"
  ) {
    level = 1;
  }

  if (
    noteText.includes("inferred") ||
    noteText.includes("conservatively") ||
    noteText.includes("does not expose")
  ) {
    level = Math.max(1, level - 1);
  }

  if (level === 3) {
    return {
      label: "High Confidence",
      tone: "diagnostic-high",
      summary: "This looks like a structured page source, so the detected board state is likely a close match."
    };
  }

  if (level === 2) {
    return {
      label: "Medium Confidence",
      tone: "diagnostic-medium",
      summary: "This came from a usable page signal, but it is worth giving the board a quick visual check."
    };
  }

  return {
    label: "Review Needed",
    tone: "diagnostic-low",
    summary: "This came from a noisy page signal, so confirm the board state before relying on the suggested move."
  };
}

function buildDetectionWarnings(position, notes) {
  const warnings = [];
  const source = typeof position?.source === "string" ? position.source : "";
  const noteText = notes.join(" ").toLowerCase();

  if (source === "manual") {
    warnings.push("Manual input bypasses page detection. If you edited the FEN, earlier page-based diagnostics no longer apply.");
  }

  if (
    source === "visible-text" ||
    source === "selected-text" ||
    source.includes("script")
  ) {
    warnings.push("This position was pulled from unstructured page content. Make sure the board on screen matches the FEN before studying the line.");
  }

  if (
    noteText.includes("castling rights and en passant") ||
    noteText.includes("conservatively set to '-'")
  ) {
    warnings.push("Castling rights and en passant were not available from the page, so special-move lines can be less reliable in this position.");
  }

  return Array.from(new Set(warnings));
}

function getDefaultDiagnosticDetail(source) {
  if (source === "manual") {
    return "Position was entered manually in the popup.";
  }

  if (source === "chesscom-board-dom") {
    return "The extension reconstructed this position directly from the live Chess.com board DOM.";
  }

  if (source.startsWith("url-param:")) {
    return "The page exposed a FEN directly in the URL, which is usually a stable source.";
  }

  if (source.startsWith("dom-attribute:")) {
    return "The page exposed a FEN-like value in a DOM attribute.";
  }

  if (source === "visible-text") {
    return "The extension found a FEN-like string in visible page text.";
  }

  if (source.includes("script")) {
    return "The extension found a FEN-like string embedded in page script content.";
  }

  if (source === "selected-text") {
    return "The current text selection contained a FEN-like string.";
  }

  return `The extension accepted ${formatDetectionSourceLabel(source).toLowerCase()} as the best available source.`;
}

function renderDiagnosticList(element, items, emptyText) {
  if (!element) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    element.innerHTML = emptyText
      ? `<li class="diagnostic-empty">${escapeHtml(emptyText)}</li>`
      : "";
    return;
  }

  element.innerHTML = items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function buildCurrentInputPosition(fen) {
  const trimmedFen = fen.trim();
  const matchesDetectedPosition = state.lastPosition?.fen === trimmedFen;

  if (matchesDetectedPosition && state.lastPosition?.source) {
    return {
      fen: trimmedFen,
      source: state.lastPosition.source,
      notes: state.lastPosition.notes
    };
  }

  return {
    fen: trimmedFen,
    source: "manual",
    notes: [
      "This FEN was entered or edited in the popup after detection."
    ]
  };
}

function formatDetectionSourceLabel(source) {
  if (typeof source !== "string" || source.trim().length === 0) {
    return "unknown source";
  }

  if (source === "manual") {
    return "manual input";
  }

  if (source === "active-element") {
    return "focused field";
  }

  if (source === "selected-text") {
    return "selected text";
  }

  if (source === "meta-tag") {
    return "page metadata";
  }

  if (source === "visible-text") {
    return "visible page text";
  }

  if (source === "chesscom-board-dom") {
    return "Chess.com board DOM";
  }

  if (source === "lichess-url") {
    return "Lichess URL";
  }

  if (source === "lichess-fen-field") {
    return "Lichess FEN field";
  }

  if (source === "chesscom-fen-field") {
    return "Chess.com FEN field";
  }

  if (source.startsWith("url-param:")) {
    return `URL parameter ${source.slice("url-param:".length)}`;
  }

  if (source.startsWith("dom-attribute:")) {
    return `DOM attribute ${source.slice("dom-attribute:".length)}`;
  }

  return source.replaceAll(/[-_:]+/g, " ");
}

function formatScore(score) {
  if (!score || typeof score.kind !== "string") {
    return "";
  }

  if (score.kind === "mate") {
    const sign = score.value > 0 ? "" : "-";
    return `${sign}M${Math.abs(score.value)}`;
  }

  if (score.kind === "cp") {
    const pawns = (score.value / 100).toFixed(2);
    return `${score.value >= 0 ? "+" : ""}${pawns}`;
  }

  return "";
}

function describeEvaluation(score) {
  if (!score || typeof score.kind !== "string") {
    return "No evaluation yet";
  }

  if (score.kind === "mate") {
    return score.value > 0 ? "Forced mate found" : "Forced mate against you";
  }

  const cp = score.value;
  const absCp = Math.abs(cp);

  if (absCp < 40) {
    return "Equal position";
  }

  if (absCp < 120) {
    return cp > 0 ? "Slight edge" : "Slight pressure against";
  }

  if (absCp < 250) {
    return cp > 0 ? "Clear edge" : "Clear pressure against";
  }

  return cp > 0 ? "Winning advantage" : "Losing position";
}

function renderCandidateLines(lines) {
  const candidates = Array.isArray(lines) ? lines.filter((line) => line?.move).slice(0, 3) : [];

  if (candidates.length === 0) {
    elements.candidateList.innerHTML = '<li class="candidate-empty">No candidate lines yet.</li>';
    return;
  }

  const html = candidates
    .map((line, index) => {
      const move = escapeHtml(formatMoveLabel(line.move));
      const score = formatScore(line.score);
      const pv = formatCandidatePv(line.pv, line.move);
      const meta = score ? ` <span class="candidate-meta">${escapeHtml(score)}</span>` : "";
      const pvMarkup = pv ? `<span class="candidate-pv">${escapeHtml(pv)}</span>` : "";

      return `<li><span class="candidate-move">${index + 1}. ${move}</span>${meta}${pvMarkup}</li>`;
    })
    .join("");

  elements.candidateList.innerHTML = html;
}

function formatPv(pv) {
  if (typeof pv !== "string" || pv.trim().length === 0) {
    return "";
  }

  return pv
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .map((move) => formatMoveLabel(move))
    .join(" ");
}

function formatCandidatePv(pv, move) {
  const formattedPv = formatPv(pv);
  const formattedMove = formatMoveLabel(move);

  if (!formattedPv || !formattedMove) {
    return formattedPv;
  }

  return formattedPv.startsWith(`${formattedMove} `)
    ? formattedPv.slice(formattedMove.length + 1)
    : formattedPv;
}

function formatMoveLabel(move) {
  if (typeof move !== "string") {
    return "";
  }

  const trimmedMove = move.trim();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(trimmedMove)) {
    return trimmedMove;
  }

  const from = trimmedMove.slice(0, 2).toLowerCase();
  const to = trimmedMove.slice(2, 4).toLowerCase();
  const promotion = trimmedMove.slice(4).toLowerCase();

  return promotion ? `${from}->${to}=${promotion.toUpperCase()}` : `${from}->${to}`;
}

function updateOpacityControl(key, value) {
  const fallback = key === "controlsOpacity"
    ? DEFAULT_SETTINGS.controlsOpacity
    : DEFAULT_SETTINGS.moveOpacity;
  const clamped = clampOpacity(value, fallback);

  if (key === "controlsOpacity") {
    elements.controlsOpacityInput.value = String(clamped);
    elements.controlsOpacityValue.textContent = `${clamped}%`;
    return;
  }

  elements.moveOpacityInput.value = String(clamped);
  elements.moveOpacityValue.textContent = `${clamped}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sendRuntimeMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function normalizeSuggestionMode(mode) {
  return mode === "manual" ? "manual" : "automatic";
}
