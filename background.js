const LAST_POSITION_KEY = "lastKnownPosition";
const LAST_ANALYSIS_KEY = "lastAnalysisResult";
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const CONTENT_SCRIPT_FILES = [
  "shared/settings.js",
  "shared/helpers.js",
  "content/state.js",
  "content/detection.js",
  "content/overlay.js",
  "content.js"
];
let offscreenCreatePromise = null;
const pendingOffscreenRequests = new Map();
let analysisQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    [LAST_POSITION_KEY]: {
      fen: "",
      source: "none",
      capturedAt: null
    },
    [LAST_ANALYSIS_KEY]: {
      fen: "",
      depth: null,
      analyzedAt: null,
      result: null
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_ACTIVE_TAB_POSITION") {
    handleGetActiveTabPosition()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message
        });
      });
    return true;
  }

  if (message?.type === "GET_LAST_POSITION") {
    chrome.storage.local.get(LAST_POSITION_KEY).then((store) => {
      sendResponse({
        ok: true,
        position: store[LAST_POSITION_KEY] ?? null
      });
    });
    return true;
  }

  if (message?.type === "GET_LAST_ANALYSIS") {
    chrome.storage.local.get(LAST_ANALYSIS_KEY).then((store) => {
      sendResponse({
        ok: true,
        analysis: store[LAST_ANALYSIS_KEY] ?? null
      });
    });
    return true;
  }

  if (message?.type === "SAVE_POSITION") {
    const position = normalizeStoredPosition(message.position);
    chrome.storage.local.set({ [LAST_POSITION_KEY]: position }).then(() => {
      sendResponse({
        ok: true,
        position
      });
    });
    return true;
  }

  if (message?.type === "ANALYZE_FEN") {
    analysisQueue = analysisQueue
      .catch(() => undefined)
      .then(() => analyzeFen(message.fen, message.depth))
      .then(async (result) => {
        const analysisRecord = {
          fen: message.fen.trim(),
          depth: normalizeDepth(message.depth),
          analyzedAt: new Date().toISOString(),
          result
        };

        await chrome.storage.local.set({
          [LAST_ANALYSIS_KEY]: analysisRecord
        });

        return result;
      })
      .then((result) => {
        sendResponse({
          ok: true,
          result
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message
        });
      });
    return true;
  }

  if (message?.type === "OFFSCREEN_ANALYSIS_RESPONSE") {
    const pending = pendingOffscreenRequests.get(message.requestId);
    if (!pending) {
      return false;
    }

    pendingOffscreenRequests.delete(message.requestId);
    clearTimeout(pending.timeoutId);

    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error || "Offscreen analysis failed."));
    }
    return false;
  }

  return false;
});

async function handleGetActiveTabPosition() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    throw new Error("No active tab was found.");
  }

  let response;

  try {
    response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_POSITION"
    });
  } catch (error) {
    response = await injectAndRetry(tab.id);
  }

  if (!response?.ok) {
    throw new Error(response?.error ?? "No chess position was detected on the page.");
  }

  const position = normalizeStoredPosition(response.position);
  await chrome.storage.local.set({ [LAST_POSITION_KEY]: position });

  return {
    ok: true,
    tab: {
      id: tab.id,
      title: tab.title ?? ""
    },
    position
  };
}

async function injectAndRetry(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPT_FILES
    });
  } catch (error) {
    throw new Error(
      "The content script could not read this page. Refresh the tab once after reloading the extension."
    );
  }

  await delay(120);

  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "GET_PAGE_POSITION"
    });
  } catch (error) {
    throw new Error(
      "The page did not accept the helper script yet. Refresh the tab once, then try again."
    );
  }
}

function normalizeStoredPosition(position) {
  return {
    fen: typeof position?.fen === "string" ? position.fen.trim() : "",
    source: typeof position?.source === "string" ? position.source : "unknown",
    capturedAt: position?.capturedAt ?? new Date().toISOString(),
    notes: Array.isArray(position?.notes) ? position.notes : []
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function analyzeFen(fen, depth) {
  if (typeof fen !== "string" || fen.trim().length === 0) {
    throw new Error("A FEN string is required for analysis.");
  }

  await ensureOffscreenDocument();

  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingOffscreenRequests.delete(requestId);
      reject(new Error("Engine startup or analysis timed out."));
    }, 20000);

    pendingOffscreenRequests.set(requestId, {
      resolve,
      reject,
      timeoutId
    });

    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "OFFSCREEN_ANALYZE",
      requestId,
      fen,
      depth: normalizeDepth(depth)
    });
  });
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  if ("getContexts" in chrome.runtime) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
      return;
    }
  }

  if (offscreenCreatePromise) {
    await offscreenCreatePromise;
    return;
  }

  offscreenCreatePromise = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["BLOBS"],
    justification: "Run the packaged Stockfish worker in an extension document for popup and on-board analysis."
  });

  try {
    await offscreenCreatePromise;
  } finally {
    offscreenCreatePromise = null;
  }
}

function normalizeDepth(depth) {
  const numericDepth = Number.parseInt(depth, 10);
  if (Number.isNaN(numericDepth)) {
    return 12;
  }

  return Math.max(6, Math.min(numericDepth, 24));
}
