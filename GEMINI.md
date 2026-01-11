# Project Context: LLM Assistant Extension

## Overview
This is a browser extension (Chrome/Edge) that provides a side-panel AI assistant. It allows users to chat with various LLMs (Google Gemini, OpenAI, Anthropic Claude, DeepSeek) directly from their browser side panel. It supports advanced features like page context awareness, text selection analysis, and multi-modal inputs (images, PDFs).

## Tech Stack
*   **Core:** TypeScript, HTML5, CSS3 (Vanilla, no UI framework like React/Vue).
*   **Build Tool:** Vite.
*   **Extension Type:** Manifest V3.
*   **Formatting:** `marked` (Markdown), `katex` (Math).

## Project Structure

```
.
├── dist/                # Production build output (Load this in browser)
├── src/
│   ├── background/      # Service Worker (Context menus, background logic)
│   │   └── service-worker.ts
│   ├── content/         # Content Scripts (Page interaction)
│   │   ├── content.ts
│   │   └── content.css
│   └── sidepanel/       # Main UI (Side Panel)
│       ├── index.html   # Main entry point for UI
│       ├── styles.css   # Main stylesheet
│       ├── main.ts      # UI entry point script
│       ├── api.ts       # LLM API implementations (Stream handling)
│       ├── config.ts    # Model providers configuration
│       ├── state.ts     # State management (Store)
│       ├── ui.ts        # DOM manipulation and rendering logic
│       └── utils.ts     # Helper functions
├── lib/                 # Third-party libraries (Katex, Marked)
├── vite.config.ts       # Vite configuration (Multi-page build)
├── manifest.json        # Extension manifest
└── package.json         # Dependencies and scripts
```

## Key Features & Logic

1.  **Multi-Provider Support:**
    *   Configured in `src/sidepanel/config.ts`.
    *   Implemented in `src/sidepanel/api.ts`.
    *   Supports Gemini (Google), OpenAI, Anthropic, and DeepSeek.

2.  **Streaming Responses:**
    *   All API calls use streaming (`stream: true` or `alt=sse`).
    *   `ui.ts` handles the "typing effect" and Markdown rendering updates.

3.  **Multi-Modal Interactions:**
    *   **Images:** Supported by Gemini, OpenAI, Anthropic.
    *   **PDFs:** Supported by Gemini (via base64 encoding).
    *   **DeepSeek:** Currently text-only (as noted in `api.ts`).

4.  **Page Context:**
    *   Content script (`content.ts`) extracts page text/HTML to send to the LLM.
    *   Users can "select text" on a page and right-click to send to the extension.

## Build & Development

### Commands
*   **Install Dependencies:** `bun install`
*   **Development (Watch):** `bun run dev`
    *   *Note:* Reload the extension in `chrome://extensions` after changes.
*   **Build (Production):** `bun run build`
    *   Outputs to `dist/`.

### Loading in Browser
1.  Go to `chrome://extensions/`.
2.  Enable **Developer mode**.
3.  Click **Load unpacked**.
4.  Select the **`dist`** directory.

## Development Conventions
*   **UI:** Pure DOM manipulation in `src/sidepanel/ui.ts`. Avoid adding heavy frameworks.
*   **State:** Centralized simple state object in `src/sidepanel/state.ts`.
*   **Styling:** Standard CSS Variables for theming (light mode default).
*   **Assets:** Static assets like `lib/` and `icons/` are copied to `dist/` via a custom Vite plugin in `vite.config.ts`.

## Recent Changes / Status
*   Project is fully functional with basic UI.
*   Supports latest models (Gemini 2.0, Claude 3.7, GPT-4o, DeepSeek V3/R1).
*   Math rendering enabled via KaTeX.
