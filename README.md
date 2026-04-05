# The Guiding Knight

The Guiding Knight is a Manifest V3 browser extension for studying chess positions in the browser. It can detect a position from the current page or accept a pasted FEN string, run a bundled Stockfish analysis, and surface the result in two ways:

- a popup for manual, one-off analysis
- an on-board overlay for automatic suggestions on supported sites

This project is built as an educational analysis tool. It is meant to help you inspect candidate moves and engine evaluations inside your browser, not to hide what it is doing.

## Important Disclaimer

This project is provided for educational and study purposes only.

Do not use this extension in live games, competitive play, rated play, tournaments, or in any situation where outside assistance is not allowed.

Use of this project on third-party websites, apps, game servers, or platforms in ways that violate their rules may result in:

- account warnings
- suspensions
- permanent bans
- game losses, rating penalties, or other enforcement actions

You are solely responsible for how you use this software. By using this project, you accept all risk. The author and contributors are not responsible for bans, suspensions, penalties, account loss, or any other consequences resulting from misuse or rule violations.

## Feature Table

| Feature | Description | Current Status |
| --- | --- | --- |
| Manual FEN analysis | Paste a full FEN string and analyze it in the popup. | Available |
| Detect from current page | Pull a FEN or reconstruct a position from the active tab. | Available |
| Automatic board watching | Monitor supported boards and refresh suggestions as positions change. | Available on Chess.com |
| On-board move overlay | Draw best-move arrows, destination highlights, and status badges on the board. | Available on Chess.com |
| Candidate lines | Show multiple engine lines instead of only one best move. | Available |
| Adjustable depth | Control search depth for manual and automatic analysis. | Available |
| Overlay controls | Toggle overlay visibility, arrow display, destination highlight, and opacity. | Available |
| Lichess position detection | Attempt to detect positions from Lichess page state. | Manual detection only |
| Broad heuristic FEN extraction | Search URLs, DOM attributes, inputs, scripts, and visible text for FEN. | Available |
| Packaged engine | Run bundled Stockfish locally inside the extension. | Available |

## What It Does

- Detects a chess position from the active page when a FEN string is exposed in the URL, DOM, form inputs, metadata, script text, or visible text.
- Reconstructs a board position directly from Chess.com board piece classes when a full FEN is not otherwise exposed.
- Runs bundled Stockfish in an offscreen extension document so analysis does not block the popup UI.
- Shows:
  - best move
  - evaluation
  - principal variation
  - top candidate lines
- Provides an optional on-board overlay with:
  - move arrow
  - destination highlight
  - secondary candidate arrow
  - status badge and quick toggle

## Current Support

### Automatic Overlay

Automatic board watching is currently enabled for:

- `chess.com`

When you visit a supported Chess.com board, the content script can watch the position, auto-analyze it, and render move hints directly on the board.

### Manual Detection

Manual detection is broader than automatic overlay support. It works best on:

- `chess.com`
- `lichess.org`
- any page that already exposes a FEN string somewhere in the page state

The extension uses a layered detection pipeline, checking host-specific adapters first and then falling back to generic FEN extraction from:

- URL parameters
- URL path
- focused input or editable text
- selected text
- inputs and textareas
- DOM data attributes
- meta tags
- inline scripts
- visible page text

## Requirements

- A Chromium-based browser with Manifest V3 extension support
  - Google Chrome is the primary target
  - other Chromium browsers may work, but this repo uses Chrome extension APIs such as `chrome.offscreen`
- The bundled engine assets in `vendor/`
  - `vendor/stockfish.js`
  - `vendor/stockfish.wasm`

There is currently no build step. This repo is loaded as an unpacked extension.

## Installation

1. Clone or download this repository.
2. Make sure the `vendor/` folder is present and includes the Stockfish assets.
3. Open `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the project folder:
   `/Users/GeneralUse/LinuxHome/Project/The-Guiding-Knight`

If you reload the extension while a target page is already open, refresh that page once so the content script can attach cleanly.

## How To Use

### Automatic Mode

1. Open a supported board, currently on Chess.com.
2. Open the extension popup.
3. Keep `Suggestion Mode` set to `Automatic`.
4. Adjust overlay and auto-analysis settings if needed.
5. Return to the board and let the extension watch the position.

The overlay can show:

- a primary best-move arrow
- a destination highlight
- a secondary candidate arrow
- a status badge for scan/analyze/ready/error states

### Manual Mode

1. Open the popup.
2. Switch `Suggestion Mode` to `Manual`.
3. Either:
   - click `Detect From Page`, or
   - paste a full FEN string into the textarea
4. Choose a search depth.
5. Click `Analyze Position`.

The popup will display the best move, score, evaluation, principal variation, and candidate lines.

## Settings

The extension stores its settings with `chrome.storage.local`.

Available settings include:

- suggestion mode: automatic or manual
- overlay enabled
- auto-analyze enabled
- only show suggestions on your turn
- show move arrow
- show destination highlight
- show second candidate arrow
- auto-analysis depth
- overlay controls opacity
- move hint opacity

It also stores:

- the last detected position
- the last analysis result

## Architecture

The extension is split into a few clear layers:

- `manifest.json`
  - declares the extension, popup, permissions, content scripts, and web-accessible engine assets
- `popup.html`, `popup.css`, `popup.js`
  - the user-facing control surface
- `background.js`
  - coordinates active-tab position requests, storage, and analysis requests
- `content.js`
  - runs in page context and handles auto-suggest behavior on supported hosts
- `content/detection.js`
  - position detection and FEN extraction
- `content/overlay.js`
  - on-board overlay rendering
- `offscreen.html`, `offscreen.js`
  - offscreen engine host used for analysis
- `vendor/stockfish.js`, `vendor/stockfish.wasm`
  - bundled Stockfish engine assets

## Permissions

The extension requests these permissions:

- `activeTab`
  - query and communicate with the current tab
- `scripting`
  - inject the content script if the page was opened before the extension was loaded
- `storage`
  - persist settings, last position, and last analysis result
- `tabs`
  - identify the active tab for position detection
- `offscreen`
  - host the engine worker in an offscreen document
- host permissions: `<all_urls>`
  - required because the extension can attempt FEN detection on arbitrary pages

## Limitations

- Automatic overlay support is currently focused on Chess.com.
- Generic page detection is heuristic and may fail on sites that do not expose FEN anywhere in page state.
- On Chess.com, board reconstruction may not recover castling rights or en passant correctly when those values are not available from the DOM. In those cases the extension falls back conservatively.
- The bundled engine is a browser-friendly Stockfish build intended for practical extension use, not maximum strength.
- This repo is currently geared toward local loading as an unpacked extension rather than a polished store release workflow.

## Development Notes

- There is no package-install or build pipeline in this repo right now.
- The popup is intentionally lightweight; engine work runs away from the popup thread.
- The offscreen document serializes analysis requests through the background script.
- Search depth is clamped between `6` and `24`.

## Repository Layout

```text
.
├── background.js
├── content.js
├── content/
│   ├── detection.js
│   ├── overlay.js
│   └── state.js
├── icons/
├── manifest.json
├── offscreen.html
├── offscreen.js
├── popup.css
├── popup.html
├── popup.js
├── shared/
│   ├── helpers.js
│   └── settings.js
└── vendor/
    ├── stockfish.js
    └── stockfish.wasm
```

## License

This repository is distributed under the GNU General Public License v3.0. See [LICENSE](./LICENSE).

This project also includes bundled Stockfish assets. See [NOTICE](./NOTICE) for third-party attribution details.
