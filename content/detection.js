(() => {
  const { normalizeFenCandidate } = globalThis.CBMS_SHARED_HELPERS;
  const contentNamespace = globalThis.CBMS_CONTENT || (globalThis.CBMS_CONTENT = {});

  function extractPositionFromPage() {
    const checks = [
      extractFromLichess,
      extractFromChessDotCom,
      extractFenFromUrlParams,
      extractFenFromUrlPath,
      extractFenFromActiveElement,
      extractFenFromSelectedText,
      extractFenFromNamedInputs,
      extractFenFromDataAttributes,
      extractFenFromMetaTags,
      extractFenFromScriptTags,
      extractFenFromVisibleText
    ];

    for (const check of checks) {
      const result = check();
      if (result?.fen) {
        return {
          fen: result.fen,
          source: result.source,
          capturedAt: new Date().toISOString(),
          notes: result.notes ?? []
        };
      }
    }

    return null;
  }

  function extractFromLichess() {
    if (!location.hostname.includes("lichess.org")) {
      return null;
    }

    return (
      extractFenFromUrlParams(["fen", "position"]) ||
      extractFenFromUrlPath("lichess-url") ||
      extractFenFromNamedInputs({
        source: "lichess-fen-field",
        filter: (element) => looksLikeFenField(element)
      }) ||
      extractFenFromDataAttributes()
    );
  }

  function extractFromChessDotCom() {
    if (!location.hostname.includes("chess.com")) {
      return null;
    }

    return (
      extractFromChessDotComBoard() ||
      extractFenFromUrlParams(["fen", "startFen", "position", "board"]) ||
      extractFenFromNamedInputs({
        source: "chesscom-fen-field",
        filter: (element) => looksLikeFenField(element)
      }) ||
      extractFenFromScriptTags("chesscom-script")
    );
  }

  function extractFromChessDotComBoard() {
    const boardElement = document.querySelector("wc-chess-board, .board");
    const pieceNodes = Array.from(document.querySelectorAll("wc-chess-board .piece, #board-single .piece, .board .piece"));

    if (!boardElement || pieceNodes.length === 0) {
      return null;
    }

    const board = createEmptyBoard();
    let pieceCount = 0;

    for (const pieceNode of pieceNodes) {
      const pieceInfo = parseChessDotComPiece(pieceNode);
      if (!pieceInfo) {
        continue;
      }

      board[pieceInfo.rankIndex][pieceInfo.fileIndex] = pieceInfo.symbol;
      pieceCount += 1;
    }

    if (pieceCount === 0) {
      return null;
    }

    const boardFen = board.map((rank) => compressFenRank(rank)).join("/");
    const moveInfo = inferMoveStateFromChessDotCom();
    const turn = moveInfo.turn;
    const fullmove = String(moveInfo.fullmove);

    return {
      fen: `${boardFen} ${turn} - - 0 ${fullmove}`,
      source: "chesscom-board-dom",
      notes: [
        "Reconstructed piece placement from Chess.com piece class names.",
        "Turn and fullmove number were inferred from the visible main-line move list.",
        "Castling rights and en passant were conservatively set to '-' because this page state does not expose them directly."
      ]
    };
  }

  function extractFenFromUrlParams(paramNames = ["fen", "position"]) {
    for (const paramName of paramNames) {
      const rawValue = new URLSearchParams(location.search).get(paramName);
      const fen = normalizeFenCandidate(rawValue);

      if (fen) {
        return {
          fen,
          source: `url-param:${paramName}`,
          notes: [`Detected a FEN-like value from the ${paramName} URL parameter.`]
        };
      }
    }

    return null;
  }

  function extractFenFromUrlPath(source = "url-path") {
    const decodedPath = decodeURIComponent(location.pathname).replace(/_/g, " ");
    const fen = normalizeFenCandidate(decodedPath);

    if (!fen) {
      return null;
    }

    return {
      fen,
      source,
      notes: ["Detected a FEN-like position encoded in the URL path."]
    };
  }

  function extractFenFromActiveElement() {
    const activeElement = document.activeElement;
    if (!activeElement) {
      return null;
    }

    const rawValue =
      "value" in activeElement
        ? activeElement.value
        : activeElement.isContentEditable
          ? activeElement.textContent
          : "";

    const fen = normalizeFenCandidate(rawValue);
    if (!fen) {
      return null;
    }

    return {
      fen,
      source: "active-element",
      notes: ["Detected a FEN string from the focused element."]
    };
  }

  function extractFenFromNamedInputs(options = {}) {
    const source = options.source ?? "named-input";
    const filter = typeof options.filter === "function" ? options.filter : () => true;
    const nodes = document.querySelectorAll("input, textarea");

    for (const node of nodes) {
      if (!filter(node)) {
        continue;
      }

      const candidateValues = collectNodeCandidates(node);
      for (const candidateValue of candidateValues) {
        const fen = normalizeFenCandidate(candidateValue);
        if (fen) {
          return {
            fen,
            source,
            notes: ["Detected a FEN string in a named input or textarea field."]
          };
        }
      }
    }

    return null;
  }

  function extractFenFromSelectedText() {
    const selection = window.getSelection?.();
    const selectedText = selection ? selection.toString() : "";
    const fen = normalizeFenCandidate(selectedText);

    if (!fen) {
      return null;
    }

    return {
      fen,
      source: "selected-text",
      notes: ["Detected a FEN string from the current text selection."]
    };
  }

  function extractFenFromDataAttributes() {
    const selectors = [
      "[data-fen]",
      "[data-initial-fen]",
      "[data-position]",
      "[data-state]",
      "[data-clipboard-text]",
      "[data-pgn]"
    ];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const candidateValues = collectNodeCandidates(node);
        for (const candidateValue of candidateValues) {
          const fen = normalizeFenCandidate(candidateValue);
          if (fen) {
            return {
              fen,
              source: `dom-attribute:${selector}`,
              notes: [`Detected a FEN-like string in ${selector}.`]
            };
          }
        }
      }
    }

    return null;
  }

  function extractFenFromMetaTags() {
    const metaTags = document.querySelectorAll("meta");
    for (const tag of metaTags) {
      const name = `${tag.getAttribute("name") ?? ""} ${tag.getAttribute("property") ?? ""}`.toLowerCase();
      if (!name.includes("fen") && !name.includes("chess")) {
        continue;
      }

      const fen = normalizeFenCandidate(tag.getAttribute("content"));
      if (fen) {
        return {
          fen,
          source: "meta-tag",
          notes: ["Detected a FEN string from a page meta tag."]
        };
      }
    }

    return null;
  }

  function extractFenFromScriptTags(source = "script-tag") {
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      const text = script.textContent?.slice(0, 25000) ?? "";
      const fen = normalizeFenCandidate(text);
      if (fen) {
        return {
          fen,
          source,
          notes: ["Detected a FEN string embedded in page script content."]
        };
      }
    }

    return null;
  }

  function extractFenFromVisibleText() {
    const bodyText = document.body?.innerText?.slice(0, 15000) ?? "";
    const fen = normalizeFenCandidate(bodyText);

    if (!fen) {
      return null;
    }

    return {
      fen,
      source: "visible-text",
      notes: ["Detected a FEN string in page text."]
    };
  }

  function collectNodeCandidates(node) {
    const values = [];

    if (node.textContent) {
      values.push(node.textContent);
    }

    for (const attribute of node.getAttributeNames()) {
      values.push(node.getAttribute(attribute) ?? "");
    }

    return values;
  }

  function createEmptyBoard() {
    return Array.from({ length: 8 }, () => Array(8).fill(""));
  }

  function parseChessDotComPiece(node) {
    const className = typeof node.className === "string" ? node.className : "";
    const pieceMatch = className.match(/\b([wb])([prnbqk])\b/);
    const squareMatch = className.match(/\bsquare-(\d)(\d)\b/);

    if (!pieceMatch || !squareMatch) {
      return null;
    }

    const fileNumber = Number.parseInt(squareMatch[1], 10);
    const rankNumber = Number.parseInt(squareMatch[2], 10);

    if (
      Number.isNaN(fileNumber) ||
      Number.isNaN(rankNumber) ||
      fileNumber < 1 ||
      fileNumber > 8 ||
      rankNumber < 1 ||
      rankNumber > 8
    ) {
      return null;
    }

    const color = pieceMatch[1];
    const piece = pieceMatch[2];

    return {
      fileIndex: fileNumber - 1,
      rankIndex: 8 - rankNumber,
      symbol: color === "w" ? piece.toUpperCase() : piece
    };
  }

  function compressFenRank(rank) {
    let emptyCount = 0;
    let output = "";

    for (const square of rank) {
      if (!square) {
        emptyCount += 1;
        continue;
      }

      if (emptyCount > 0) {
        output += String(emptyCount);
        emptyCount = 0;
      }

      output += square;
    }

    if (emptyCount > 0) {
      output += String(emptyCount);
    }

    return output;
  }

  function inferMoveStateFromChessDotCom() {
    const moveNodes = Array.from(document.querySelectorAll("wc-simple-move-list .node.main-line-ply"));
    const plyCount = moveNodes.length;

    if (plyCount === 0) {
      return {
        turn: "w",
        fullmove: 1
      };
    }

    return {
      turn: plyCount % 2 === 0 ? "w" : "b",
      fullmove: Math.floor(plyCount / 2) + 1
    };
  }

  function looksLikeFenField(element) {
    const descriptor = [
      element.id,
      element.name,
      element.className,
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return descriptor.includes("fen") || descriptor.includes("position");
  }

  contentNamespace.detection = {
    extractPositionFromPage
  };
})();
