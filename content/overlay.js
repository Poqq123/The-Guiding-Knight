(() => {
  const contentNamespace = globalThis.CBMS_CONTENT || (globalThis.CBMS_CONTENT = {});
  const state = contentNamespace.state;

  function findPrimaryBoardElement() {
    return document.querySelector("wc-chess-board#board-single, #board-single, wc-chess-board, .board");
  }

  function ensureOverlay(boardElement, handleOverlayToggle) {
    if (state.boardElement === boardElement && state.overlayRoot?.isConnected) {
      return;
    }

    state.boardElement = boardElement;
    injectOverlayStyles();

    const boardStyle = window.getComputedStyle(boardElement);
    if (boardStyle.position === "static") {
      boardElement.style.position = "relative";
    }

    state.overlayRoot?.remove();

    const overlayRoot = document.createElement("div");
    overlayRoot.className = "cbms-overlay";

    const controlsElement = document.createElement("div");
    controlsElement.className = "cbms-controls";

    const toggleButton = document.createElement("button");
    toggleButton.className = "cbms-toggle";
    toggleButton.type = "button";
    toggleButton.addEventListener("click", handleOverlayToggle);

    const arrowElement = document.createElement("div");
    arrowElement.className = "cbms-arrow";

    const arrowHeadElement = document.createElement("div");
    arrowHeadElement.className = "cbms-arrow-head";

    const secondaryArrowElement = document.createElement("div");
    secondaryArrowElement.className = "cbms-arrow cbms-arrow-secondary";

    const secondaryArrowHeadElement = document.createElement("div");
    secondaryArrowHeadElement.className = "cbms-arrow-head cbms-arrow-head-secondary";

    const labelElement = document.createElement("div");
    labelElement.className = "cbms-label";

    const destinationElement = document.createElement("div");
    destinationElement.className = "cbms-destination";

    const badgeElement = document.createElement("div");
    badgeElement.className = "cbms-badge";
    badgeElement.textContent = "Scanning board";

    controlsElement.append(badgeElement, toggleButton);
    overlayRoot.append(
      controlsElement,
      destinationElement,
      secondaryArrowElement,
      secondaryArrowHeadElement,
      arrowElement,
      arrowHeadElement,
      labelElement
    );
    boardElement.appendChild(overlayRoot);

    state.overlayRoot = overlayRoot;
    state.controlsElement = controlsElement;
    state.toggleButton = toggleButton;
    state.arrowElement = arrowElement;
    state.arrowHeadElement = arrowHeadElement;
    state.secondaryArrowElement = secondaryArrowElement;
    state.secondaryArrowHeadElement = secondaryArrowHeadElement;
    state.labelElement = labelElement;
    state.destinationElement = destinationElement;
    state.badgeElement = badgeElement;
    applyOverlayAppearance();
    applyOverlayVisibility();

    if (state.lastAnalysisResult?.bestMove && state.overlayEnabled) {
      renderSuggestedMoves(state.lastAnalysisResult);
    }
  }

  function applyOverlayVisibility() {
    if (!state.overlayRoot) {
      return;
    }

    state.overlayRoot.classList.toggle(
      "cbms-overlay-hidden",
      !state.overlayEnabled
    );

    if (state.toggleButton) {
      state.toggleButton.textContent = state.overlayEnabled
        ? "Hide Overlay"
        : "Show Overlay";
      state.toggleButton.setAttribute(
        "aria-pressed",
        String(!state.overlayEnabled)
      );
    }
  }

  function applyOverlayAppearance() {
    if (state.controlsElement) {
      state.controlsElement.style.opacity = String(state.controlsOpacity / 100);
    }
  }

  function injectOverlayStyles() {
    if (document.getElementById("cbms-overlay-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "cbms-overlay-styles";
    style.textContent = `
      .cbms-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 25;
        overflow: visible;
      }
      .cbms-controls {
        position: absolute;
        top: 10px;
        left: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: auto;
      }
      .cbms-badge {
        position: relative;
        max-width: min(220px, calc(100vw - 48px));
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(26, 35, 27, 0.84);
        color: #f8fff8;
        font: 700 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0.01em;
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.18);
        transition: background 180ms ease, color 180ms ease, transform 180ms ease;
      }
      .cbms-badge.cbms-badge-busy {
        background: rgba(125, 89, 8, 0.9);
        color: #fff3cf;
        animation: cbms-pulse 1.1s ease-in-out infinite;
      }
      .cbms-badge.cbms-badge-ready {
        background: rgba(20, 88, 56, 0.88);
        color: #effff6;
      }
      .cbms-badge.cbms-badge-error {
        background: rgba(126, 28, 28, 0.9);
        color: #fff0f0;
      }
      .cbms-toggle {
        border: 0;
        border-radius: 999px;
        padding: 7px 10px;
        background: rgba(250, 247, 241, 0.96);
        color: #173323;
        font: 800 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.14);
      }
      .cbms-arrow {
        position: absolute;
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(33, 196, 117, 0.92), rgba(113, 255, 169, 0.98));
        transform-origin: left center;
        box-shadow: 0 0 0 2px rgba(13, 62, 37, 0.26), 0 10px 22px rgba(22, 90, 56, 0.32);
        opacity: 0;
      }
      .cbms-arrow.cbms-arrow-secondary {
        height: 8px;
        background: linear-gradient(90deg, rgba(157, 169, 179, 0.88), rgba(212, 220, 228, 0.94));
        box-shadow: 0 0 0 2px rgba(72, 84, 96, 0.18), 0 8px 18px rgba(29, 39, 49, 0.18);
      }
      .cbms-arrow-head {
        position: absolute;
        width: 0;
        height: 0;
        border-top: 12px solid transparent;
        border-bottom: 12px solid transparent;
        border-left: 20px solid rgba(113, 255, 169, 0.98);
        transform-origin: center center;
        filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.2));
        opacity: 0;
      }
      .cbms-arrow-head.cbms-arrow-head-secondary {
        border-top-width: 10px;
        border-bottom-width: 10px;
        border-left-width: 17px;
        border-left-color: rgba(212, 220, 228, 0.94);
        filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.16));
      }
      .cbms-destination {
        position: absolute;
        width: 12.5%;
        height: 12.5%;
        transform: translate(-50%, -50%);
        border-radius: 16%;
        background:
          radial-gradient(circle at center, rgba(163, 255, 194, 0.34) 0%, rgba(73, 219, 128, 0.16) 48%, rgba(32, 148, 87, 0.08) 100%);
        box-shadow: inset 0 0 0 3px rgba(126, 255, 182, 0.85), 0 0 26px rgba(67, 228, 139, 0.34);
        opacity: 0;
      }
      .cbms-label {
        position: absolute;
        min-width: 60px;
        transform: translate(-50%, -50%);
        padding: 5px 8px;
        border-radius: 10px;
        background: rgba(248, 255, 249, 0.97);
        color: #14311f;
        font: 800 12px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
        opacity: 0;
      }
      .cbms-overlay-hidden .cbms-arrow,
      .cbms-overlay-hidden .cbms-arrow-head,
      .cbms-overlay-hidden .cbms-label,
      .cbms-overlay-hidden .cbms-destination {
        opacity: 0 !important;
      }
      @keyframes cbms-pulse {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-1px); }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function renderSuggestedMoves(result) {
    if (
      !state.overlayEnabled ||
      !state.boardElement ||
      !state.arrowElement ||
      !state.arrowHeadElement ||
      !state.secondaryArrowElement ||
      !state.secondaryArrowHeadElement ||
      !state.labelElement ||
      !state.destinationElement
    ) {
      return;
    }

    const bestMove = result?.bestMove || "";
    const primaryCandidate = getPrimaryCandidate(result);
    const secondaryCandidate = getSecondaryCandidate(result);
    const parsedMove = parseUciMove(bestMove);
    if (!parsedMove) {
      clearArrow();
      return;
    }

    const boardRect = state.boardElement.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) {
      return;
    }

    const boardPerspective = getBoardPerspective();
    const start = getSquareCenter(parsedMove.from, boardRect, boardPerspective);
    const end = getSquareCenter(parsedMove.to, boardRect, boardPerspective);
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    const distance = Math.max(Math.hypot(deltaX, deltaY) - 12, 6);

    renderArrowLayer(
      state.arrowElement,
      state.arrowHeadElement,
      start,
      end,
      angle,
      distance,
      state.showArrow ? state.moveOpacity / 100 : 0
    );

    if (secondaryCandidate && state.showArrow && state.showSecondCandidate) {
      renderSecondaryArrow(secondaryCandidate.move, boardRect, boardPerspective);
    } else {
      hideSecondaryArrow();
    }

    state.destinationElement.style.opacity = state.showDestination
      ? String(state.moveOpacity / 100)
      : "0";
    state.destinationElement.style.display = state.showDestination
      ? "block"
      : "none";
    state.destinationElement.style.left = `${end.x}px`;
    state.destinationElement.style.top = `${end.y}px`;

    state.labelElement.style.opacity = String(state.moveOpacity / 100);
    state.labelElement.style.left = `${end.x}px`;
    state.labelElement.style.top = `${end.y - 18}px`;
    state.labelElement.textContent = formatMoveLabel(primaryCandidate?.move || bestMove);
  }

  function clearArrow() {
    if (state.arrowElement) {
      state.arrowElement.style.opacity = "0";
    }
    if (state.arrowHeadElement) {
      state.arrowHeadElement.style.opacity = "0";
    }
    hideSecondaryArrow();
    if (state.labelElement) {
      state.labelElement.style.opacity = "0";
    }
    if (state.destinationElement) {
      state.destinationElement.style.opacity = "0";
    }
  }

  function setOverlayStatus(text, tone = "idle") {
    if (state.badgeElement) {
      state.badgeElement.textContent = text;
      state.badgeElement.className = `cbms-badge cbms-badge-${tone}`;
    }
  }

  function renderSecondaryArrow(move, boardRect, boardPerspective) {
    const parsedMove = parseUciMove(move);
    if (!parsedMove) {
      hideSecondaryArrow();
      return;
    }

    const start = getSquareCenter(parsedMove.from, boardRect, boardPerspective);
    const end = getSquareCenter(parsedMove.to, boardRect, boardPerspective);
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    const distance = Math.max(Math.hypot(deltaX, deltaY) - 14, 6);

    renderArrowLayer(
      state.secondaryArrowElement,
      state.secondaryArrowHeadElement,
      start,
      end,
      angle,
      distance,
      state.moveOpacity / 100
    );
  }

  function renderArrowLayer(arrowElement, arrowHeadElement, start, end, angle, distance, opacity) {
    if (!arrowElement || !arrowHeadElement) {
      return;
    }

    arrowElement.style.opacity = String(opacity);
    arrowElement.style.display = opacity > 0 ? "block" : "none";
    arrowElement.style.left = `${start.x}px`;
    arrowElement.style.top = `${start.y - 5}px`;
    arrowElement.style.width = `${distance}px`;
    arrowElement.style.transform = `rotate(${angle}deg)`;

    arrowHeadElement.style.opacity = String(opacity);
    arrowHeadElement.style.display = opacity > 0 ? "block" : "none";
    arrowHeadElement.style.left = `${end.x - 2}px`;
    arrowHeadElement.style.top = `${end.y - 12}px`;
    arrowHeadElement.style.transform = `rotate(${angle}deg)`;
  }

  function hideSecondaryArrow() {
    if (state.secondaryArrowElement) {
      state.secondaryArrowElement.style.opacity = "0";
    }
    if (state.secondaryArrowHeadElement) {
      state.secondaryArrowHeadElement.style.opacity = "0";
    }
  }

  function getPrimaryCandidate(result) {
    const lines = Array.isArray(result?.lines) ? result.lines : [];
    return lines.find((line) => line?.move === result?.bestMove) ?? lines[0] ?? null;
  }

  function getSecondaryCandidate(result) {
    const lines = Array.isArray(result?.lines) ? result.lines : [];
    return lines.find((line) => line?.move && line.move !== result?.bestMove) ?? null;
  }

  function parseUciMove(move) {
    if (typeof move !== "string") {
      return null;
    }

    const trimmedMove = move.trim();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(trimmedMove)) {
      return null;
    }

    return {
      from: trimmedMove.slice(0, 2).toLowerCase(),
      to: trimmedMove.slice(2, 4).toLowerCase(),
      promotion: trimmedMove.slice(4).toLowerCase()
    };
  }

  function getSquareCenter(square, boardRect, perspective = "white") {
    const file = square.charCodeAt(0) - 96;
    const rank = Number.parseInt(square[1], 10);
    const isBlackPerspective = perspective === "black";

    const visualFile = isBlackPerspective ? 9 - file : file;
    const visualRank = isBlackPerspective ? rank : 9 - rank;

    return {
      x: ((visualFile - 0.5) / 8) * boardRect.width,
      y: ((visualRank - 0.5) / 8) * boardRect.height
    };
  }

  function getBoardPerspective() {
    return isBlackPerspectiveBoard() ? "black" : "white";
  }

  function isBlackPerspectiveBoard() {
    return Boolean(
      document.querySelector(
        ".clock-component.clock-bottom.clock-black, .player-bottom .clock-component.clock-black"
      )
    );
  }

  function isUsersTurn(fen) {
    const turn = fen.split(" ")[1];
    const userColor = getUserBoardColor();

    if (!turn || !userColor) {
      return true;
    }

    return turn === userColor;
  }

  function getUserBoardColor() {
    if (isBlackPerspectiveBoard()) {
      return "b";
    }

    if (document.querySelector(".clock-component.clock-bottom.clock-white, .player-bottom .clock-component.clock-white")) {
      return "w";
    }

    return "";
  }

  function formatMoveLabel(move) {
    const parsed = parseUciMove(move);
    if (!parsed) {
      return move;
    }

    return parsed.promotion
      ? `${parsed.from}→${parsed.to}=${parsed.promotion.toUpperCase()}`
      : `${parsed.from}→${parsed.to}`;
  }

  function buildOverlayReadyText(result) {
    const move = formatMoveLabel(result?.bestMove || "");
    const summary = describeEvaluation(result?.score);
    const score = formatCompactScore(result?.score);

    if (move && summary && score) {
      return `Best: ${move} | ${summary} ${score}`;
    }

    if (move && summary) {
      return `Best: ${move} | ${summary}`;
    }

    if (move && score) {
      return `Best: ${move} | ${score}`;
    }

    return move ? `Best move ready: ${move}` : "Best move ready";
  }

  function describeEvaluation(score) {
    if (!score || typeof score.kind !== "string") {
      return "";
    }

    if (score.kind === "mate") {
      return score.value > 0 ? "Mate found" : "Under mate threat";
    }

    const absCp = Math.abs(score.value);

    if (absCp < 40) {
      return "Equal";
    }

    if (absCp < 120) {
      return score.value > 0 ? "Small edge" : "Small deficit";
    }

    if (absCp < 250) {
      return score.value > 0 ? "Clear edge" : "Clear deficit";
    }

    return score.value > 0 ? "Winning" : "Losing";
  }

  function formatCompactScore(score) {
    if (!score || typeof score.kind !== "string") {
      return "";
    }

    if (score.kind === "mate") {
      return `${score.value > 0 ? "" : "-"}M${Math.abs(score.value)}`;
    }

    if (score.kind === "cp") {
      return `${score.value >= 0 ? "+" : ""}${(score.value / 100).toFixed(1)}`;
    }

    return "";
  }

  contentNamespace.overlay = {
    findPrimaryBoardElement,
    ensureOverlay,
    applyOverlayVisibility,
    applyOverlayAppearance,
    clearArrow,
    setOverlayStatus,
    renderSuggestedMoves,
    buildOverlayReadyText,
    isUsersTurn
  };
})();
