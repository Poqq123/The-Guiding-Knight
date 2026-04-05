(() => {
  const { DEFAULT_SETTINGS } = globalThis.CBMS_SHARED_SETTINGS;
  const FEN_PATTERN =
    /\b(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+\s+[wb]\s+(?:-|[KQkq]{1,4})\s+(?:-|[a-h][36])\s+\d+\s+\d+\b/g;

  function clampDepth(value, fallback = DEFAULT_SETTINGS.autoDepth) {
    const numericDepth = Number.parseInt(value, 10);
    if (Number.isNaN(numericDepth)) {
      return fallback;
    }

    return Math.max(6, Math.min(numericDepth, 24));
  }

  function clampOpacity(value, fallback = DEFAULT_SETTINGS.controlsOpacity) {
    const numericValue = Number.parseInt(value, 10);
    if (Number.isNaN(numericValue)) {
      return fallback;
    }

    return Math.max(20, Math.min(numericValue, 100));
  }

  function isLikelyFen(fen) {
    return /^([prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+\s+[wb]\s+(?:-|[KQkq]{1,4})\s+(?:-|[a-h][36])\s+\d+\s+\d+$/.test(
      fen
    );
  }

  function safeStorageGet(key) {
    try {
      return chrome.storage.local.get(key).catch(() => ({}));
    } catch (error) {
      return Promise.resolve({});
    }
  }

  function safeStorageSet(value) {
    try {
      return chrome.storage.local.set(value).catch(() => undefined);
    } catch (error) {
      return Promise.resolve();
    }
  }

  function getChangedValue(changes, key, fallback) {
    if (!(key in changes)) {
      return fallback;
    }

    return changes[key].newValue;
  }

  function normalizeFenCandidate(input) {
    const directFen = findFirstFen(input);
    if (directFen) {
      return directFen;
    }

    if (typeof input !== "string" || input.length === 0) {
      return "";
    }

    const cleaned = input
      .trim()
      .replace(/["',;]+/g, " ")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ");

    const boardMatch = cleaned.match(/([prnbqkPRNBQK1-8]+(?:\/[prnbqkPRNBQK1-8]+){7})(?:\s+([wb]))?(?:\s+([KQkq-]{1,4}))?(?:\s+(-|[a-h][36]))?(?:\s+(\d+))?(?:\s+(\d+))?/);
    if (!boardMatch) {
      return "";
    }

    const board = boardMatch[1];
    const turn = boardMatch[2] ?? "w";
    const castling = boardMatch[3] ?? "-";
    const enPassant = boardMatch[4] ?? "-";
    const halfmove = boardMatch[5] ?? "0";
    const fullmove = boardMatch[6] ?? "1";

    return `${board} ${turn} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
  }

  function findFirstFen(input) {
    if (typeof input !== "string" || input.length === 0) {
      return "";
    }

    const matches = input.match(FEN_PATTERN);
    return matches?.[0]?.trim() ?? "";
  }

  globalThis.CBMS_SHARED_HELPERS = Object.freeze({
    FEN_PATTERN,
    clampDepth,
    clampOpacity,
    isLikelyFen,
    safeStorageGet,
    safeStorageSet,
    getChangedValue,
    normalizeFenCandidate,
    findFirstFen
  });
})();
