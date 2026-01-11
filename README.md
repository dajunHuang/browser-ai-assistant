# LLM 智能助手 (LLM Assistant Extension)

一个强大的浏览器侧边栏 AI 助手，支持 DeepSeek、Gemini、OpenAI 和 Anthropic 多种模型。支持划词提问、网页内容分析、多模态（图片/PDF）交互。

## ✨ 主要功能

*   **多模型支持**：
    *   **DeepSeek**: V3, R1 (支持思维链展示)
    *   **Google Gemini**: 2.0 Flash, 1.5 Pro
    *   **OpenAI**: GPT-4o, o1/o3-mini (Reasoning)
    *   **Anthropic**: Claude 3.7 Sonnet, 3.5 Haiku
*   **深度网页交互**：
    *   **划词提问**：选中网页文本，右键直接发送给 AI。
    *   **页面感知**：一键获取当前页面全文内容，让 AI 进行总结或分析。
    *   **智能上下文**：自动捕获页面标题和 URL。
*   **多模态能力**：
    *   **图片理解**：支持粘贴图片、上传图片、或右键发送网页图片。
    *   **文档分析**：支持上传 PDF 文件进行解析和问答。
    *   **文件支持**：支持上传各类代码文件和文本文档。
*   **极致体验**：
    *   **流式响应**：打字机效果，实时展示 AI 思考过程。
    *   **Markdown 渲染**：完美支持代码高亮、数学公式 (KaTeX)。
    *   **隐私安全**：API Key 仅保存在本地浏览器存储中，不经过任何中间服务器。

## 🛠️ 安装与使用

### 1. 开发环境安装

本项目采用 TypeScript + Vite 构建。

1.  **环境准备**：确保已安装 Node.js (推荐 v18+) 或 Bun。
2.  **安装依赖**：
    ```bash
    npm install
    # 或者
    bun install
    ```
3.  **构建项目**：
    ```bash
    npm run build
    # 或者
    bun run build
    ```
    构建完成后，会生成 `dist` 目录。

### 2. 加载到浏览器

1.  打开 Chrome 或 Edge 浏览器，进入扩展管理页面：
    *   Chrome: `chrome://extensions/`
    *   Edge: `edge://extensions/`
2.  开启右上角的 **"开发者模式" (Developer mode)**。
3.  点击 **"加载已解压的扩展程序" (Load unpacked)**。
4.  **重要**：选择项目根目录下的 **`dist`** 文件夹（不是根目录！）。

### 3. 开始使用

1.  点击浏览器工具栏的扩展图标，打开侧边栏。
2.  点击侧边栏底部的 **设置 (⚙️)** 图标。
3.  选择你喜欢的模型提供商 (如 DeepSeek)，并输入对应的 **API Key**。
4.  开始对话！

## ⌨️ 快捷键

*   **发送消息**：`Enter` (文本框聚焦时)
*   **换行**：`Shift + Enter`
*   **全局唤起发送**：`Ctrl + Enter` (在网页任意位置按下，将选中文本发送给 AI)

## 🏗️ 项目结构

```
src/
├── background/      # Service Worker (后台逻辑)
├── content/         # Content Script (网页交互)
├── sidepanel/       # 侧边栏 UI 逻辑 (TypeScript)
│   ├── api.ts       # LLM API 调用封装
│   ├── config.ts    # 模型配置
│   ├── main.ts      # 入口文件
│   ├── state.ts     # 状态管理
│   ├── types.ts     # TypeScript 类型定义
│   └── ...
└── lib/             # 第三方库 (KaTeX 等)
```

## 📝 开发指南

*   **启动监听模式**：
    ```bash
    npm run dev
    ```
    Vite 会监听文件变化并自动重新构建。注意：Chrome 扩展有时需要手动在扩展管理页面点击“刷新”按钮才能加载最新的 Content Script。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT
