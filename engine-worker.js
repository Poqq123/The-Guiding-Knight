const STOCKFISH_SCRIPT_URL =
  self.CBMS_EXTENSION_ASSETS?.stockfishScriptUrl ||
  self.chrome?.runtime?.getURL?.("vendor/stockfish.js") ||
  "./vendor/stockfish.js";
const STOCKFISH_WASM_URL =
  self.CBMS_EXTENSION_ASSETS?.stockfishWasmUrl ||
  self.chrome?.runtime?.getURL?.("vendor/stockfish.wasm") ||
  "./vendor/stockfish.wasm";

let engine = null;
let engineReady = false;
let engineError = "";
let engineStarting = false;
let activeSearch = null;

bootEngine();

self.onmessage = (event) => {
  const message = event.data;

  if (message?.type === "PING") {
    postEngineStatus();
    return;
  }

  if (message?.type !== "ANALYZE") {
    return;
  }

  if (!engineReady || !engine) {
    postMessage({
      type: "ANALYSIS_ERROR",
      error:
        engineError ||
        "Stockfish is not bundled yet. Add vendor/stockfish.js and vendor/stockfish.wasm."
    });
    return;
  }

  if (!isLikelyFen(message.fen)) {
    postMessage({
      type: "ANALYSIS_ERROR",
      error: "The supplied position is not a valid full FEN string."
    });
    return;
  }

  const depth = normalizeDepth(message.depth);
  activeSearch = {
    fen: message.fen,
    depth,
    bestMove: "",
    pv: "",
    score: null
  };

  try {
    if (activeSearch) {
      engine.postMessage("stop");
    }
    engine.postMessage("ucinewgame");
    engine.postMessage(`position fen ${message.fen}`);
    engine.postMessage(`go depth ${depth}`);
  } catch (error) {
    postMessage({
      type: "ANALYSIS_ERROR",
      error: error.message
    });
  }
};

function bootEngine() {
  try {
    engineStarting = true;
    engine = new Worker(createStockfishBootstrapUrl());
    engine.addEventListener("message", handleEngineMessage);
    engine.addEventListener("error", handleEngineError);
    engine.postMessage("uci");
    engine.postMessage("isready");
  } catch (error) {
    engineReady = false;
    engineStarting = false;
    engineError =
      `${error.message} The nested Stockfish worker could not start from ` +
      `${STOCKFISH_SCRIPT_URL}.`;
  }

  postEngineStatus();
}

function createStockfishBootstrapUrl() {
  const bootstrapSource =
    typeof self.CBMS_EXTENSION_ASSETS?.stockfishSource === "string"
      ? self.CBMS_EXTENSION_ASSETS.stockfishSource
      : `importScripts(${JSON.stringify(STOCKFISH_SCRIPT_URL)});`;
  const blob = new Blob([bootstrapSource], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  const workerUrl = `${blobUrl}#${encodeURIComponent(STOCKFISH_WASM_URL)},worker`;

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 1000);

  return workerUrl;
}

function handleEngineError(event) {
  engineReady = false;
  engineStarting = false;
  engineError =
    event?.message ||
    "The Stockfish worker crashed while loading or analyzing a position.";

  postMessage({
    type: "ANALYSIS_ERROR",
    error: engineError
  });
  postEngineStatus();
}

function handleEngineMessage(event) {
  const line = typeof event === "string" ? event : event?.data ?? "";

  if (!line) {
    return;
  }

  if (line === "uciok" || line === "readyok") {
    if (!engineReady) {
      engineReady = true;
      engineStarting = false;
      postEngineStatus();
    }
    return;
  }

  if (!activeSearch) {
    return;
  }

  if (line.startsWith("info")) {
    const progress = parseInfoLine(line);
    if (!progress) {
      return;
    }

    if (progress.depth) {
      activeSearch.depth = progress.depth;
    }

    if (progress.score) {
      activeSearch.score = progress.score;
    }

    if (progress.pv) {
      activeSearch.pv = progress.pv;
      activeSearch.bestMove = progress.pv.split(" ")[0] ?? activeSearch.bestMove;
    }

    postMessage({
      type: "ANALYSIS_PROGRESS",
      depth: activeSearch.depth,
      bestMove: activeSearch.bestMove,
      pv: activeSearch.pv,
      score: activeSearch.score
    });
    return;
  }

  if (line.startsWith("bestmove")) {
    const bestMove = line.split(/\s+/)[1] ?? "";
    postMessage({
      type: "ANALYSIS_RESULT",
      bestMove: bestMove || activeSearch.bestMove,
      pv: activeSearch.pv,
      score: activeSearch.score,
      note: "Search finished successfully."
    });
    activeSearch = null;
  }
}

function parseInfoLine(line) {
  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
  const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);

  const parsed = {};

  if (depthMatch) {
    parsed.depth = Number.parseInt(depthMatch[1], 10);
  }

  if (mateMatch) {
    parsed.score = {
      kind: "mate",
      value: Number.parseInt(mateMatch[1], 10)
    };
  } else if (cpMatch) {
    parsed.score = {
      kind: "cp",
      value: Number.parseInt(cpMatch[1], 10)
    };
  }

  if (pvMatch) {
    parsed.pv = pvMatch[1].trim();
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

function normalizeDepth(depth) {
  const numericDepth = Number.parseInt(depth, 10);
  if (Number.isNaN(numericDepth)) {
    return 12;
  }

  return Math.max(6, Math.min(numericDepth, 24));
}

function isLikelyFen(fen) {
  return /^([prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+\s+[wb]\s+(?:-|[KQkq]{1,4})\s+(?:-|[a-h][36])\s+\d+\s+\d+$/.test(
    fen
  );
}

function postEngineStatus() {
  postMessage({
    type: "ENGINE_STATUS",
    ready: engineReady,
    starting: engineStarting,
    message: engineReady
      ? "Stockfish engine loaded."
      : engineStarting
        ? "The bundled Stockfish worker is booting."
      : engineError ||
        "Engine not found. vendor/stockfish.js and vendor/stockfish.wasm are required."
  });
}
