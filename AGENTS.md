# AGENTS.md - Development Guide for LLM Assistant Extension

This document provides guidelines for AI agents working on this browser extension project.

## Project Overview

A Chrome/Edge browser extension (Manifest V3) that provides an AI assistant sidebar supporting Gemini, OpenAI, and Anthropic APIs. The extension enables users to select text on webpages and send it to LLM APIs for analysis, supports file attachments, and renders Markdown with KaTeX math formulas.

## Build, Lint, and Test Commands

This is a vanilla JavaScript project with no build system. All code runs directly in the browser.

### Loading the Extension in Browser

1. Open Edge/Chrome and navigate to `edge://extensions/` or `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the project folder
5. Reload the extension after making changes

### No Build Commands

This project uses vanilla JavaScript with no transpilation or bundling. Changes to JS/CSS files take effect immediately upon extension reload.

### No Test Framework

There are no automated tests. Manual testing is required:
- Test extension loading in browser
- Test side panel opens correctly
- Test text selection and sending
- Test API connections with valid API keys
- Test file attachment upload
- Test Markdown and KaTeX rendering

### No Linting

No ESLint or other linting tools are configured. Code style consistency is maintained manually.

## Code Style Guidelines

### Language

- **Comments**: Use Chinese comments for all functions and complex logic
- **UI Strings**: Use Chinese text for all user-facing messages
- **Console Output**: Use Chinese messages for errors and warnings

### Naming Conventions

- **Variables**: camelCase (e.g., `userInput`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE for truly constant values (e.g., `DEFAULT_SYSTEM_PROMPT`, `PROVIDERS`)
- **Functions**: camelCase, verb-first naming (e.g., `sendMessage()`, `loadSettings()`)
- **State Object**: Use `state` object with camelCase properties (e.g., `state.settings`, `state.messages`)
- **Elements Object**: Cache DOM elements in `elements` object (e.g., `elements.messageInput`, `elements.sendBtn`)

### File Structure

```
project-root/
├── manifest.json              # Extension configuration
├── background/
│   └── service-worker.js      # Background service worker (message routing)
├── content/
│   ├── content.js             # Content script (selection detection)
│   └── content.css            # Content script styles
├── sidepanel/
│   ├── index.html             # Side panel HTML
│   ├── styles.css             # Side panel styles
│   └── script.js              # Side panel UI logic (main logic)
└── lib/
    ├── katex/                 # Math formula rendering
    └── marked.min.js          # Markdown rendering
```

### JavaScript Patterns

#### IIFE Pattern

Wrap content scripts and module code in IIFEs:

```javascript
(function() {
  // Code here
})();
```

#### State Management

Use a centralized `state` object for application state:

```javascript
let state = {
    settings: { provider: 'gemini', apiKey: '', model: '' },
    messages: [],
    attachments: [],
    isLoading: false,
    // ...
};
```

#### DOM Element Caching

Cache frequently accessed DOM elements:

```javascript
const elements = {
    settingsBtn: document.getElementById('settingsBtn'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    // ...
};
```

#### Event Listener Setup

Use named functions for event listeners:

```javascript
function setupEventListeners() {
    elements.settingsBtn.addEventListener('click', openSettings);
    elements.sendBtn.addEventListener('click', sendMessage);
}
```

### Error Handling

- Use try/catch for async operations and file handling
- Log errors with `console.error()` using Chinese messages
- Show user-friendly error messages via `showToast(message, 'error')`
- Handle Chrome API errors gracefully with `.catch(() => {})` for non-critical operations

### Async/Await Pattern

Prefer async/await over callbacks:

```javascript
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['settings']);
        // Handle result
    } catch (error) {
        console.error('加载设置失败:', error);
    }
}
```

### Message Passing

Use chrome.runtime message passing for communication between components:

```javascript
// Send message
chrome.runtime.sendMessage({ type: 'SELECTED_TEXT', text: content });

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'SELECTED_TEXT':
            // Handle
            break;
    }
});
```

### API Key Security

- API keys are stored in `chrome.storage.local` only
- Never log or expose API keys in console
- Validate API key presence before making requests

### CSS Guidelines

- Use CSS variables for theming (see `styles.css`)
- Use class-based styling with camelCase class names
- Keep styles in dedicated CSS files (not inline styles except dynamic toasts)
- Follow existing color scheme and spacing patterns

### Browser API Usage

- Use Manifest V3 APIs only
- Use `chrome.storage.local` for persistent storage
- Use `chrome.sidePanel` for side panel management
- Use `chrome.contextMenus` for right-click menu items
- Support modern Chrome/Edge browsers (Manifest V3)

### Content Script Isolation

- Content scripts run in web page context
- Use IIFE to avoid polluting global scope
- Communicate with background script via message passing
- Be aware of potential conflicts with page JavaScript

### Internationalization

- All user-facing strings are in Chinese
- Maintain Chinese consistency throughout (error messages, labels, placeholders)

### Performance Considerations

- Use debouncing for frequent events (e.g., selectionchange: 300ms timeout)
- Clean up resources on extension reload
- Limit message history to last 10 messages for API calls
- Truncate long page content (8000 character limit)
