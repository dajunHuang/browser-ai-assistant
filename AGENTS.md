# AGENTS.md - Developer Guide for LLM Assistant Extension

This document provides instructions for agentic coding agents and developers working on this browser extension.

## 🏗️ Project Architecture

*   **Type**: Chrome/Edge Browser Extension (Manifest V3)
*   **Language**: TypeScript
*   **Build Tool**: Vite + Bun (or npm)
*   **Structure**:
    *   `src/background`: Service Worker logic
    *   `src/content`: Content Scripts (DOM interaction)
    *   `src/sidepanel`: Main UI logic (Vanilla JS structure with TS)
    *   `src/lib`: Static libraries (KaTeX, Marked)
    *   `dist`: Build output directory

## 🚀 Build Commands

**Important**: Always run the build command after modifying files in `src/`. The browser loads the `dist/` directory.

```bash
# Install dependencies
bun install  # or npm install

# Build for production
bun run build  # or npm run build

# Watch mode (rebuilds on change)
bun run dev  # or npm run dev
```

*Note: When using watch mode, you may still need to click the "Refresh" button in `chrome://extensions` to reload the extension context.*

## 📐 Code Style & Conventions

*   **TypeScript**: Strict mode is enabled. Define interfaces for all data structures in `src/sidepanel/types.ts`.
*   **State Management**: Use the centralized `state` object in `src/sidepanel/state.ts`. Do not store global state loosely.
*   **UI Components**: The project uses a "Vanilla JS" approach with direct DOM manipulation in `src/sidepanel/ui.ts`.
    *   Avoid inline HTML strings where complex; use `document.createElement`.
    *   Use `elements` object to cache DOM references.
*   **Styling**:
    *   Use CSS variables in `src/sidepanel/styles.css` for theming.
    *   Support Light/Dark mode via `@media (prefers-color-scheme: dark)`.
*   **API Calls**: All LLM API logic resides in `src/sidepanel/api.ts`.
    *   Streaming logic is handled manually via `fetch` and `TextDecoder` to support diverse APIs (DeepSeek, Gemini, etc.).

## 🧪 Testing

Currently, there are no automated unit tests. Testing is manual:
1.  Run `bun run build`.
2.  Reload extension in `chrome://extensions`.
3.  Test key flows:
    *   Open Side Panel.
    *   Set API Key (ensure persistence).
    *   Send text message.
    *   Send selected text (Right-click menu).
    *   Send image/PDF.

## 🔍 Common Issues

*   **"ShowToast is not exported"**: Ensure you import utility functions from `./utils` not `./ui`.
*   **CSS Not Loading**: Check `vite.config.ts` to ensure `styles.css` is being copied to `dist/`.
*   **DeepSeek/API Errors**: verify `manifest.json` `host_permissions` includes the API endpoint.

## 🤖 Agent Instructions

If you are an AI agent working on this repo:
1.  **Read First**: Always read `src/sidepanel/state.ts` and `src/sidepanel/types.ts` to understand the data model.
2.  **Modifying UI**: Check `src/sidepanel/index.html` for ID references before changing `src/sidepanel/ui.ts`.
3.  **Refactoring**: If adding new files, update `vite.config.ts` if they are new entry points (unlikely for sidepanel logic).
4.  **Final Step**: ALWAYS run `bun run build` (or instruct the user to do so) after changes.
