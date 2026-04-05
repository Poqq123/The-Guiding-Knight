const ENGINE_PATH = chrome.runtime.getURL("vendor/stockfish.js");
const MULTI_PV = 3;

let engineWorker = null;
let engineReady = false;
let engineBootPromise = null;
let activeRequestId = null;
let activeAnalysis = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target !== "offscreen" || message?.type !== "OFFSCREEN_ANALYZE") {
    return false;
  }

  handleAnalyzeRequest(message);
  return false;
});

async function handleAnalyzeRequest(message) {
  try {
    await ensureEngineWorker();
    activeRequestId = message.requestId;
    activeAnalysis = {
      lines: new Map()
    };

    engineWorker.postMessage("stop");
    engineWorker.postMessage("ucinewgame");
    engineWorker.postMessage(`setoption name MultiPV value ${MULTI_PV}`);
    engineWorker.postMessage(`position fen ${message.fen}`);
    engineWorker.postMessage(`go depth ${normalizeDepth(message.depth)}`);
  } catch (error) {
    chrome.runtime.sendMessage({
      type: "OFFSCREEN_ANALYSIS_RESPONSE",
      requestId: message.requestId,
      ok: false,
      error: error.message
    });
  }
}

function ensureEngineWorker() {
  if (engineReady && engineWorker) {
    return Promise.resolve();
  }

  if (engineBootPromise) {
    return engineBootPromise;
  }

  engineBootPromise = new Promise((resolve, reject) => {
    try {
      engineWorker = new Worker(ENGINE_PATH);
    } catch (error) {
      engineBootPromise = null;
      reject(error);
      return;
    }

    const timeoutId = setTimeout(() => {
      engineBootPromise = null;
      reject(new Error("Engine startup timed out."));
    }, 15000);

    const handleMessage = (event) => {
      const line = typeof event.data === "string" ? event.data : "";

      if (!line) {
        return;
      }

      if (line === "uciok") {
        engineWorker.postMessage(`setoption name MultiPV value ${MULTI_PV}`);
        engineWorker.postMessage("isready");
        return;
      }

      if (line === "readyok") {
        if (engineReady) {
          return;
        }

        engineReady = true;
        engineBootPromise = null;
        clearTimeout(timeoutId);
        resolve();
        return;
      }

      if (line.startsWith("info") && activeAnalysis) {
        updateActiveAnalysis(line);
        return;
      }

      if (line.startsWith("bestmove") && activeRequestId) {
        const bestMove = extractBestMove(line);
        const lines = finalizeCandidateLines(bestMove);
        const primaryLine = lines[0] ?? null;

        chrome.runtime.sendMessage({
          type: "OFFSCREEN_ANALYSIS_RESPONSE",
          requestId: activeRequestId,
          ok: true,
          result: {
            bestMove,
            pv: primaryLine?.pv ?? "",
            score: primaryLine?.score ?? null,
            lines,
            note: "Best move suggestion received from the offscreen engine."
          }
        });

        activeRequestId = null;
        activeAnalysis = null;
      }
    };

    const handleError = (event) => {
      engineReady = false;
      engineBootPromise = null;
      clearTimeout(timeoutId);
      reject(new Error(event.message || "Offscreen engine worker crashed."));
    };

    engineWorker.addEventListener("message", handleMessage);
    engineWorker.addEventListener("error", handleError);
    engineWorker.postMessage("uci");
  });

  return engineBootPromise;
}

function normalizeDepth(depth) {
  const numericDepth = Number.parseInt(depth, 10);
  if (Number.isNaN(numericDepth)) {
    return 12;
  }

  return Math.max(6, Math.min(numericDepth, 24));
}

function updateActiveAnalysis(line) {
  const parsed = parseInfoLine(line);
  if (!parsed || !activeAnalysis) {
    return;
  }

  const rank = parsed.multipv ?? 1;
  const current = activeAnalysis.lines.get(rank) ?? {
    rank
  };
  const merged = {
    ...current,
    ...parsed,
    rank
  };

  if (!merged.move && merged.pv) {
    merged.move = merged.pv.split(/\s+/)[0] ?? "";
  }

  activeAnalysis.lines.set(rank, merged);
}

function parseInfoLine(line) {
  const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
  const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);
  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);

  const parsed = {};

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
    parsed.move = parsed.pv.split(/\s+/)[0] ?? "";
  }

  if (multipvMatch) {
    parsed.multipv = Number.parseInt(multipvMatch[1], 10);
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

function finalizeCandidateLines(bestMove) {
  const candidates = Array.from(activeAnalysis?.lines?.values?.() ?? [])
    .filter((line) => Boolean(line.move))
    .sort((left, right) => left.rank - right.rank)
    .slice(0, MULTI_PV)
    .map((line) => ({
      rank: line.rank,
      move: line.move,
      pv: line.pv ?? "",
      score: line.score ?? null
    }));

  if (candidates.length === 0 && bestMove) {
    candidates.push({
      rank: 1,
      move: bestMove,
      pv: bestMove,
      score: null
    });
  }

  if (candidates.length > 0 && bestMove && candidates[0].move !== bestMove) {
    candidates.unshift({
      rank: 1,
      move: bestMove,
      pv: candidates[0]?.pv ?? bestMove,
      score: candidates[0]?.score ?? null
    });
  }

  return candidates.slice(0, MULTI_PV);
}

function extractBestMove(line) {
  return line.split(/\s+/)[1] ?? "";
}
