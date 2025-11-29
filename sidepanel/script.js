// 默认系统提示词
const DEFAULT_SYSTEM_PROMPT = `你是一个智能助手，正在帮助用户阅读和理解网页内容。

你的职责：
1. 根据提供的页面上下文和用户选中的文本，准确回答用户的问题
2. 如果用户选中了文本，优先围绕选中内容进行分析、解释、翻译或总结
3. 回答要简洁明了，必要时使用列表或分点说明
4. 如果页面内容不足以回答问题，请诚实说明并提供你所知道的相关信息
5. 对于代码片段，提供清晰的解释；对于外语内容，提供准确的翻译

请用中文回答，除非用户要求使用其他语言。`;

// LLM 提供商配置
const PROVIDERS = {
    gemini: {
        name: 'Google Gemini',
        models: [
            { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' }
        ],
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    },
    openai: {
        name: 'OpenAI',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
        ],
        endpoint: 'https://api.openai.com/v1/chat/completions'
    },
    anthropic: {
        name: 'Anthropic',
        models: [
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
        ],
        endpoint: 'https://api.anthropic.com/v1/messages'
    }
};

// 状态管理
let state = {
    settings: {
        provider: 'gemini',
        apiKey: '',
        model: 'gemini-2.5-flash',
        systemPrompt: ''
    },
    messages: [],
    attachments: [], // 多附件支持 { id, type: 'text'|'image'|'pdf'|'file', content/base64, name, mimeType }
    pageContext: '', // 页面上下文
    pageTitle: '',   // 页面标题
    pageUrl: '',     // 页面URL
    includePageContext: false, // 是否附带页面内容（默认关闭）
    isLoading: false,
    attachmentIdCounter: 0, // 附件ID计数器
    pageContextResolve: null, // 等待页面上下文的 Promise resolve
    pendingSelection: null // 待发送的选中文本（用户在网页选择但未手动确认的）
};

// DOM 元素
const elements = {
    settingsBtn: document.getElementById('settingsBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    providerSelect: document.getElementById('providerSelect'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    modelSelect: document.getElementById('modelSelect'),
    systemPrompt: document.getElementById('systemPrompt'),
    saveSettings: document.getElementById('saveSettings'),
    closeSettings: document.getElementById('closeSettings'),
    pendingSelectionBar: document.getElementById('pendingSelectionBar'),
    pendingSelectionText: document.getElementById('pendingSelectionText'),
    clearPendingSelection: document.getElementById('clearPendingSelection'),
    attachmentsBar: document.getElementById('attachmentsBar'),
    attachmentsList: document.getElementById('attachmentsList'),
    clearAllAttachments: document.getElementById('clearAllAttachments'),
    uploadFileBtn: document.getElementById('uploadFileBtn'),
    fileInput: document.getElementById('fileInput'),
    chatContainer: document.getElementById('chatContainer'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    includePageContext: document.getElementById('includePageContext')
};

// 初始化
async function init() {
    await loadSettings();
    setupEventListeners();
    setupMessageListener();
    updateModelOptions();
    // 请求获取当前页面上下文
    setTimeout(requestPageContext, 500);
}

// 加载设置
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['settings', 'messages']);
        if (result.settings) {
            state.settings = { ...state.settings, ...result.settings };
            elements.providerSelect.value = state.settings.provider;
            elements.apiKeyInput.value = state.settings.apiKey;
            elements.systemPrompt.value = state.settings.systemPrompt || '';
            updateModelOptions();
            elements.modelSelect.value = state.settings.model;
        }

        // 如果没有保存的系统提示词，使用默认提示词作为value（可编辑）
        if (!result.systemPrompt) {
            elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
        }

        if (result.messages && result.messages.length > 0) {
            state.messages = result.messages;
            renderMessages();
        } else {
            // 首次使用或没有消息时，默认勾选附带页面
            state.includePageContext = true;
            elements.includePageContext.checked = true;
        }
    } catch (error) {
        console.error('加载设置失败:', error);
    }
}

// 保存设置
async function saveSettings() {
    state.settings = {
        provider: elements.providerSelect.value,
        apiKey: elements.apiKeyInput.value,
        model: elements.modelSelect.value,
        systemPrompt: elements.systemPrompt.value
    };

    try {
        await chrome.storage.local.set({ settings: state.settings });
        elements.settingsPanel.classList.add('hidden');
        showToast('设置已保存');
    } catch (error) {
        console.error('保存设置失败:', error);
        showToast('保存失败', 'error');
    }
}

// 更新模型选项
function updateModelOptions() {
    const provider = elements.providerSelect.value;
    const models = PROVIDERS[provider].models;

    elements.modelSelect.innerHTML = models
        .map(m => `<option value="${m.id}">${m.name}</option>`)
        .join('');

    // 如果当前保存的模型不在新的提供商列表中，设置为第一个模型
    if (!models.find(m => m.id === state.settings.model)) {
        state.settings.model = models[0].id;
        elements.modelSelect.value = state.settings.model;
    } else {
        // 确保选中正确的模型
        elements.modelSelect.value = state.settings.model;
    }
}

// 设置事件监听
function setupEventListeners() {
    // 设置面板
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsPanel.classList.remove('hidden');
    });

    elements.closeSettings.addEventListener('click', () => {
        elements.settingsPanel.classList.add('hidden');
    });

    elements.saveSettings.addEventListener('click', saveSettings);

    elements.providerSelect.addEventListener('change', updateModelOptions);

    // 清除待发送的选中文本
    elements.clearPendingSelection.addEventListener('click', () => {
        state.pendingSelection = null;
        hidePendingSelection();
    });

    // 文件上传（图片和 PDF，支持多选）
    elements.uploadFileBtn.addEventListener('click', () => {
        elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', handleFileUpload);

    // 清除所有附件
    elements.clearAllAttachments.addEventListener('click', clearAllAttachments);

    // 支持粘贴图片
    elements.messageInput.addEventListener('paste', handlePaste);

    // 发送消息
    elements.sendBtn.addEventListener('click', sendMessage);

    // 输入框聚焦时：Enter 发送，Shift+Enter 换行
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 全局快捷键 Ctrl+Enter 发送消息
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 自动调整输入框高度
    elements.messageInput.addEventListener('input', () => {
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
    });

    // 清空对话
    elements.clearChatBtn.addEventListener('click', clearChat);

    // 页面上下文开关
    elements.includePageContext.addEventListener('change', (e) => {
        state.includePageContext = e.target.checked;
    });
}

// 显示待发送的选中文本提示
function showPendingSelection() {
    if (!state.pendingSelection) return;
    const preview = state.pendingSelection.length > 50 
        ? state.pendingSelection.substring(0, 50) + '...' 
        : state.pendingSelection;
    elements.pendingSelectionText.textContent = `已选中: "${preview}"`;
    elements.pendingSelectionBar.classList.remove('hidden');
    updateAttachmentsBarPosition();
}

// 隐藏待发送的选中文本提示
function hidePendingSelection() {
    elements.pendingSelectionBar.classList.add('hidden');
    updateAttachmentsBarPosition();
}

// 更新附件列表的位置
function updateAttachmentsBarPosition() {
    const isPendingVisible = !elements.pendingSelectionBar.classList.contains('hidden');
    const pendingHeight = isPendingVisible ? elements.pendingSelectionBar.offsetHeight : 0;
    elements.attachmentsBar.style.top = `${pendingHeight}px`;
}

// 生成附件ID
function generateAttachmentId() {
    return ++state.attachmentIdCounter;
}

// 添加附件
function addAttachment(attachment) {
    attachment.id = generateAttachmentId();
    state.attachments.push(attachment);
    renderAttachments();
}

// 删除附件
function removeAttachment(id) {
    state.attachments = state.attachments.filter(a => a.id !== id);
    renderAttachments();
}

// 清除所有附件
function clearAllAttachments() {
    state.attachments = [];
    renderAttachments();
}

// 渲染附件列表
function renderAttachments() {
    if (state.attachments.length === 0) {
        elements.attachmentsBar.classList.add('hidden');
        updateAttachmentsBarPosition();
        return;
    }

    elements.attachmentsBar.classList.remove('hidden');
    updateAttachmentsBarPosition();
    elements.attachmentsList.innerHTML = '';

    state.attachments.forEach(att => {
        const item = document.createElement('div');
        item.className = `attachment-item attachment-${att.type}`;
        item.dataset.id = att.id;

        let content = '';
        if (att.type === 'text') {
            const preview = att.content.length > 100 ? att.content.substring(0, 100) + '...' : att.content;
            content = `
        <div class="attachment-icon clickable-preview" data-preview-type="text" data-preview-id="${att.id}" style="cursor:pointer">📝</div>
        <div class="attachment-info clickable-preview" data-preview-type="text" data-preview-id="${att.id}" style="cursor:pointer">
          <span class="attachment-name">选中文本</span>
          <span class="attachment-preview">${escapeHtml(preview)}</span>
        </div>`;
        } else if (att.type === 'file') {
            // 上传的文本文件
            const preview = att.content.length > 80 ? att.content.substring(0, 80) + '...' : att.content;
            content = `
        <div class="attachment-icon clickable-preview" data-preview-type="file" data-preview-id="${att.id}" style="cursor:pointer">📄</div>
        <div class="attachment-info clickable-preview" data-preview-type="file" data-preview-id="${att.id}" style="cursor:pointer">
          <span class="attachment-name">${escapeHtml(att.name)}</span>
          <span class="attachment-preview">${escapeHtml(preview)}</span>
        </div>`;
        } else if (att.type === 'image') {
            content = `
        <div class="attachment-thumb clickable-preview" data-preview-type="image" data-preview-id="${att.id}" style="cursor:pointer">
          <img src="${att.base64}" alt="${att.name}">
        </div>
        <div class="attachment-info clickable-preview" data-preview-type="image" data-preview-id="${att.id}" style="cursor:pointer">
          <span class="attachment-name">${escapeHtml(att.name)}</span>
          <span class="attachment-size">图片 · 点击预览</span>
        </div>`;
        } else if (att.type === 'pdf') {
            content = `
        <div class="attachment-icon clickable-preview" data-preview-type="pdf" data-preview-id="${att.id}" style="cursor:pointer">📄</div>
        <div class="attachment-info clickable-preview" data-preview-type="pdf" data-preview-id="${att.id}" style="cursor:pointer">
          <span class="attachment-name">${escapeHtml(att.name)}</span>
          <span class="attachment-size">PDF · 点击预览</span>
        </div>`;
        }

        item.innerHTML = `
      ${content}
      <button class="attachment-remove" data-remove-id="${att.id}" title="删除">✕</button>
    `;

        elements.attachmentsList.appendChild(item);
    });

    // 绑定预览点击事件
    elements.attachmentsList.querySelectorAll('.clickable-preview').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = el.dataset.previewType;
            const id = parseInt(el.dataset.previewId);
            if (type === 'text') previewText(id);
            else if (type === 'file') previewFile(id);
            else if (type === 'image') previewImage(id);
            else if (type === 'pdf') previewPdf(id);
        });
    });

    // 绑定删除按钮事件
    elements.attachmentsList.querySelectorAll('.attachment-remove').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(el.dataset.removeId);
            removeAttachment(id);
        });
    });
}

// 文本预览（侧栏弹窗）
function previewText(id) {
    console.log('previewText called with id:', id);
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const att = state.attachments.find(a => a.id === numId);
    console.log('Found attachment:', att);
    if (att && att.type === 'text') {
        showPreviewModal('text', att.content, '选中文本');
    }
}

// 文本文件预览（侧栏弹窗）
function previewFile(id) {
    console.log('previewFile called with id:', id);
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const att = state.attachments.find(a => a.id === numId);
    console.log('Found attachment:', att);
    if (att && att.type === 'file') {
        showPreviewModal('text', att.content, att.name);
    }
}

// 图片预览（侧栏弹窗）
function previewImage(id) {
    console.log('previewImage called with id:', id);
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const att = state.attachments.find(a => a.id === numId);
    console.log('Found attachment:', att);
    if (att && att.type === 'image') {
        showPreviewModal('image', att.base64, att.name);
    }
}

// PDF 预览（新标签页）
function previewPdf(id) {
    console.log('previewPdf called with id:', id);
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const att = state.attachments.find(a => a.id === numId);
    console.log('Found attachment:', att);
    if (att && att.type === 'pdf') {
        // 将 base64 转换为 Blob URL 并在新标签页打开
        try {
            const base64Data = att.base64.includes(',') ? att.base64.split(',')[1] : att.base64;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');
        } catch (e) {
            console.error('PDF preview error:', e);
            showToast('无法预览 PDF', 'error');
        }
    }
}

// 显示预览弹窗
function showPreviewModal(type, content, title) {
    console.log('showPreviewModal called:', type, title);

    // 移除已存在的弹窗
    const existingModal = document.querySelector('.preview-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'preview-modal';

    let bodyContent = '';
    if (type === 'text') {
        // 使用 formatContent 渲染公式和 Markdown
        bodyContent = `<div class="preview-text">${formatContent(content)}</div>`;
    } else if (type === 'image') {
        bodyContent = `<img class="preview-image" src="${content}" alt="${escapeHtml(title)}">`;
    }

    modal.innerHTML = `
    <div class="preview-modal-backdrop"></div>
    <div class="preview-modal-content">
      <div class="preview-modal-header">
        <span class="preview-modal-title">${escapeHtml(title)}</span>
        <button class="preview-modal-close">✕</button>
      </div>
      <div class="preview-modal-body">
        ${bodyContent}
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    // 绑定关闭事件
    modal.querySelector('.preview-modal-backdrop').addEventListener('click', closePreviewModal);
    modal.querySelector('.preview-modal-close').addEventListener('click', closePreviewModal);

    // 添加 ESC 键关闭
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closePreviewModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// 关闭预览弹窗
function closePreviewModal() {
    const modal = document.querySelector('.preview-modal');
    if (modal) {
        modal.remove();
    }
}

// 直接从 base64 打开 PDF（不通过 id 查找）
function openPdfFromBase64Direct(base64Data) {
    try {
        const pureBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const byteCharacters = atob(pureBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
    } catch (e) {
        console.error('PDF preview error:', e);
        showToast('无法预览 PDF', 'error');
    }
}

// 处理文件上传（支持多文件）
function handleFileUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
            // 图片文件 - 读取为 base64
            const reader = new FileReader();
            reader.onload = (event) => {
                addAttachment({
                    type: 'image',
                    base64: event.target.result,
                    mimeType: file.type,
                    name: file.name
                });
            };
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
            // PDF 文件 - 读取为 base64
            const reader = new FileReader();
            reader.onload = (event) => {
                addAttachment({
                    type: 'pdf',
                    base64: event.target.result,
                    mimeType: file.type,
                    name: file.name
                });
            };
            reader.readAsDataURL(file);
        } else if (isTextFile(file)) {
            // 文本文件 - 读取为文本内容
            const reader = new FileReader();
            reader.onload = (event) => {
                addAttachment({
                    type: 'file',
                    content: event.target.result,
                    mimeType: file.type || 'text/plain',
                    name: file.name
                });
            };
            reader.readAsText(file);
        } else {
            showToast('不支持的文件类型: ' + file.name, 'error');
        }
    });

    // 清空 input 以便可以再次选择相同文件
    e.target.value = '';
}

// 判断是否为文本文件
function isTextFile(file) {
    // 常见文本文件 MIME 类型
    const textMimeTypes = [
        'text/plain',
        'text/html',
        'text/css',
        'text/javascript',
        'text/markdown',
        'text/xml',
        'text/csv',
        'text/yaml',
        'application/json',
        'application/xml',
        'application/javascript',
        'application/x-yaml',
        'application/x-sh',
    ];
    
    // 常见文本文件扩展名
    const textExtensions = [
        '.txt', '.md', '.markdown', '.json', '.xml', '.html', '.htm',
        '.css', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
        '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
        '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.r',
        '.sql', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
        '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.config',
        '.env', '.gitignore', '.dockerfile', '.makefile',
        '.csv', '.log', '.tex', '.bib', '.rst', '.org', '.adoc'
    ];
    
    // 检查 MIME 类型
    if (file.type && textMimeTypes.some(t => file.type.startsWith(t.split('/')[0] + '/') || file.type === t)) {
        return true;
    }
    
    // 检查文件扩展名
    const fileName = file.name.toLowerCase();
    if (textExtensions.some(ext => fileName.endsWith(ext))) {
        return true;
    }
    
    // 没有扩展名或未知类型，且文件较小时尝试作为文本处理
    if (!file.type && file.size < 1024 * 1024) { // < 1MB
        return true;
    }
    
    return false;
}

// 处理粘贴图片
function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    addAttachment({
                        type: 'image',
                        base64: event.target.result,
                        mimeType: file.type,
                        name: 'pasted-image-' + Date.now()
                    });
                };
                reader.readAsDataURL(file);
            }
            break;
        }
    }
}

// 监听来自 content script 的消息
function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SELECTED_TEXT') {
            // 右键菜单发送的文本，直接添加为附件
            addAttachment({
                type: 'text',
                content: message.text,
                name: 'selected-text'
            });
        }
        if (message.type === 'SELECTION_CHANGED') {
            // 用户在网页选择了新文本，替换待发送的选中内容
            if (message.text && message.text.trim()) {
                state.pendingSelection = message.text.trim();
                showPendingSelection();
            } else {
                state.pendingSelection = null;
                hidePendingSelection();
            }
        }
        if (message.type === 'PAGE_CONTEXT') {
            state.pageContext = message.content;
            state.pageTitle = message.title;
            state.pageUrl = message.url;
            console.log('收到页面上下文:', state.pageTitle, '内容长度:', state.pageContext?.length);
            // 通知等待中的 Promise
            if (state.pageContextResolve) {
                state.pageContextResolve(true);
                state.pageContextResolve = null;
            }
        }
        if (message.type === 'IMAGE_FROM_PAGE') {
            // 接收从网页右键发送的图片
            const { imageData } = message;
            addAttachment({
                type: 'image',
                base64: imageData.base64,
                mimeType: imageData.mimeType,
                name: imageData.name
            });
            showToast('图片已添加');
        }
        if (message.type === 'TRIGGER_SEND') {
            // 网页端按 Ctrl+Enter 触发发送
            sendMessage();
        }
    });
}

// 请求获取页面上下文（返回 Promise）
async function requestPageContext() {
    return new Promise((resolve) => {
        // 设置超时
        const timeout = setTimeout(() => {
            console.log('获取页面上下文超时');
            state.pageContextResolve = null;
            resolve(false);
        }, 3000);
        
        // 保存 resolve 函数供消息监听器调用
        state.pageContextResolve = (success) => {
            clearTimeout(timeout);
            resolve(success);
        };
        
        try {
            // 通过 background script 获取页面上下文
            chrome.runtime.sendMessage({ type: 'REQUEST_PAGE_CONTEXT' });
        } catch (error) {
            console.log('无法获取页面上下文:', error);
            clearTimeout(timeout);
            state.pageContextResolve = null;
            resolve(false);
        }
    });
}

// 发送消息
async function sendMessage() {
    const userInput = elements.messageInput.value.trim();

    // 检查是否有内容可发送（包括待发送的选中文本）
    const hasAttachments = state.attachments.length > 0;
    const hasPendingSelection = !!state.pendingSelection;
    if (!userInput && !hasAttachments && !hasPendingSelection) return;
    if (state.isLoading) return;

    // 检查 API Key
    if (!state.settings.apiKey) {
        showToast('请先在设置中配置 API Key', 'error');
        return;
    }

    // 如果开启了附带页面，刷新获取最新页面上下文
    if (state.includePageContext) {
        const gotContext = await requestPageContext();
        if (!gotContext || !state.pageContext) {
            showToast('无法获取页面内容，请确保页面已完全加载', 'error');
            return;
        }
    }

    // 如果有待发送的选中文本，将其加入附件
    let pendingSelectionAttachment = null;
    if (state.pendingSelection) {
        pendingSelectionAttachment = {
            id: generateAttachmentId(),
            type: 'text',
            content: state.pendingSelection,
            name: 'selected-text'
        };
        // 清除待发送状态
        state.pendingSelection = null;
        hidePendingSelection();
    }

    // 构建消息内容
    let content = userInput;

    // 构建页面上下文前缀（仅当用户开启开关时）
    let contextPrefix = '';
    if (state.includePageContext && state.pageContext) {
        const truncatedContext = state.pageContext.length > 8000
            ? state.pageContext.substring(0, 8000) + '\n...（内容已截断）'
            : state.pageContext;
        contextPrefix = `【当前页面信息】\n标题: ${state.pageTitle}\nURL: ${state.pageUrl}\n\n【页面完整内容】\n${truncatedContext}\n\n`;
    }

    // 合并所有文本附件（包括待发送的选中文本）
    const allAttachments = pendingSelectionAttachment 
        ? [pendingSelectionAttachment, ...state.attachments]
        : [...state.attachments];

    // 处理文本类附件（选中文本和文本文件）
    const textAttachments = allAttachments.filter(a => a.type === 'text');
    const fileTextAttachments = allAttachments.filter(a => a.type === 'file');
    
    let textContent = '';
    
    // 添加选中文本
    if (textAttachments.length > 0) {
        const textsContent = textAttachments.map((t, i) =>
            `【选中文本 ${i + 1}】\n${t.content}`
        ).join('\n\n');
        textContent += textsContent;
    }
    
    // 添加文本文件内容
    if (fileTextAttachments.length > 0) {
        const filesContent = fileTextAttachments.map((f, i) =>
            `【文件: ${f.name}】\n${f.content}`
        ).join('\n\n');
        if (textContent) textContent += '\n\n';
        textContent += filesContent;
    }
    
    if (textContent) {
        content = `${contextPrefix}${textContent}\n\n【用户的问题】\n${userInput || '请帮我分析这些内容'}`;
    } else if (contextPrefix) {
        content = `${contextPrefix}【用户的问题】\n${userInput}`;
    }

    // 使用页面上下文后自动取消勾选
    if (state.includePageContext && contextPrefix) {
        state.includePageContext = false;
        elements.includePageContext.checked = false;
    }

    // 收集所有文件附件（图片和 PDF）
    const fileAttachments = allAttachments.filter(a => a.type === 'image' || a.type === 'pdf');

    // 清除附件
    const attachmentsCopy = [...allAttachments];
    clearAllAttachments();

    // 添加用户消息（带附件信息）
    addMessage('user', content, attachmentsCopy);
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';

    // 显示加载状态
    state.isLoading = true;
    elements.sendBtn.disabled = true;
    const typingEl = showTypingIndicator();

    try {
        const response = await callLLMAPI(content, fileAttachments);
        removeTypingIndicator(typingEl);
        addMessage('assistant', response);
    } catch (error) {
        removeTypingIndicator(typingEl);
        addMessage('error', `错误: ${error.message}`);
    } finally {
        state.isLoading = false;
        elements.sendBtn.disabled = false;
    }
}

// 调用 LLM API（支持多文件）
async function callLLMAPI(userMessage, fileAttachments = []) {
    const { provider, apiKey, model, systemPrompt } = state.settings;

    // 使用用户自定义提示词或默认提示词
    const effectiveSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // 构建历史消息（不包含文件，避免过大）
    const history = state.messages.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
    }));

    switch (provider) {
        case 'gemini':
            return await callGemini(apiKey, model, userMessage, history, effectiveSystemPrompt, fileAttachments);
        case 'openai':
            return await callOpenAI(apiKey, model, userMessage, history, effectiveSystemPrompt, fileAttachments);
        case 'anthropic':
            return await callAnthropic(apiKey, model, userMessage, history, effectiveSystemPrompt, fileAttachments);
        default:
            throw new Error('不支持的提供商');
    }
}

// Gemini API（支持多图片和多 PDF）
async function callGemini(apiKey, model, userMessage, history, systemPrompt, fileAttachments = []) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents = [];

    // 添加系统提示（始终使用）
    contents.push({
        role: 'user',
        parts: [{ text: `System: ${systemPrompt}` }]
    });
    contents.push({
        role: 'model',
        parts: [{ text: '好的，我会按照您的要求来回答问题。' }]
    });

    // 添加历史消息
    for (const msg of history) {
        contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        });
    }

    // 添加当前消息（可能包含多个图片或 PDF）
    const currentParts = [];

    // 添加所有文件附件
    for (const file of fileAttachments) {
        const base64Data = file.base64.split(',')[1];
        currentParts.push({
            inline_data: {
                mime_type: file.mimeType,
                data: base64Data
            }
        });
    }

    currentParts.push({ text: userMessage });

    contents.push({
        role: 'user',
        parts: currentParts
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '无响应';
}

// OpenAI API（支持多图片，不支持 PDF）
async function callOpenAI(apiKey, model, userMessage, history, systemPrompt, fileAttachments = []) {
    const messages = [];

    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push(...history);

    // 分离图片和 PDF
    const images = fileAttachments.filter(f => f.type === 'image');
    const pdfs = fileAttachments.filter(f => f.type === 'pdf');

    // 当前消息（支持多图片，不支持 PDF）
    if (images.length > 0) {
        const content = [];
        // 添加所有图片
        images.forEach(img => {
            content.push({
                type: 'image_url',
                image_url: { url: img.base64 }
            });
        });
        // 添加文本
        let text = userMessage;
        if (pdfs.length > 0) {
            text += `\n\n（注意：已忽略 ${pdfs.length} 个 PDF 文件，OpenAI 不支持直接处理 PDF，请使用 Gemini）`;
        }
        content.push({ type: 'text', text });
        messages.push({ role: 'user', content });
    } else if (pdfs.length > 0) {
        messages.push({
            role: 'user',
            content: userMessage + `\n\n（注意：已忽略 ${pdfs.length} 个 PDF 文件，OpenAI 不支持直接处理 PDF，请使用 Gemini）`
        });
    } else {
        messages.push({ role: 'user', content: userMessage });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '无响应';
}

// Anthropic API（支持多图片，不支持 PDF）
async function callAnthropic(apiKey, model, userMessage, history, systemPrompt, fileAttachments = []) {
    // 分离图片和 PDF
    const images = fileAttachments.filter(f => f.type === 'image');
    const pdfs = fileAttachments.filter(f => f.type === 'pdf');

    // 构建当前消息内容
    let currentContent;
    if (images.length > 0) {
        currentContent = [];
        // 添加所有图片
        images.forEach(img => {
            const base64Data = img.base64.split(',')[1];
            currentContent.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: img.mimeType,
                    data: base64Data
                }
            });
        });
        // 添加文本
        let text = userMessage;
        if (pdfs.length > 0) {
            text += `\n\n（注意：已忽略 ${pdfs.length} 个 PDF 文件，Anthropic 不支持直接处理 PDF，请使用 Gemini）`;
        }
        currentContent.push({ type: 'text', text });
    } else if (pdfs.length > 0) {
        currentContent = userMessage + `\n\n（注意：已忽略 ${pdfs.length} 个 PDF 文件，Anthropic 不支持直接处理 PDF，请使用 Gemini）`;
    } else {
        currentContent = userMessage;
    }
    const messages = [...history, { role: 'user', content: currentContent }];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: systemPrompt || undefined,
            messages
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '无响应';
}

// 添加消息（支持多附件）
function addMessage(role, content, attachments = null) {
    // 处理附件，只保存必要信息
    let savedAttachments = null;
    if (attachments && attachments.length > 0) {
        savedAttachments = attachments.map(att => ({
            type: att.type,
            name: att.name,
            // 文本类型（选中文本或文本文件）保存内容
            content: (att.type === 'text' || att.type === 'file') ? att.content : null,
            // 图片保存 base64，PDF 不保存 base64
            base64: att.type === 'image' ? att.base64 : null
        }));
    }

    const message = {
        role,
        content,
        timestamp: Date.now(),
        attachments: savedAttachments
    };

    if (role !== 'error') {
        state.messages.push(message);
        chrome.storage.local.set({ messages: state.messages });
    }

    renderMessage(message);
    scrollToBottom();
}

// 渲染所有消息
function renderMessages() {
    // 清除欢迎消息
    const welcomeMsg = elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg && state.messages.length > 0) {
        welcomeMsg.remove();
    }

    state.messages.forEach(msg => renderMessage(msg));
    scrollToBottom();
}

// 渲染单条消息
function renderMessage(message) {
    // 移除欢迎消息
    const welcomeMsg = elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    const msgEl = document.createElement('div');
    msgEl.className = `message ${message.role}`;

    // 构建消息内容
    let innerHTML = '';

    // 渲染多附件
    if (message.attachments && message.attachments.length > 0) {
        innerHTML += '<div class="message-attachments">';
        message.attachments.forEach((att, index) => {
            const attId = `msg-att-${Date.now()}-${index}`;
            if (att.type === 'image' && att.base64) {
                // 图片：点击在侧栏弹窗预览
                innerHTML += `
          <div class="attachment-card image-card msg-preview-image" style="cursor:pointer" data-base64="${att.base64}" data-name="${escapeHtml(att.name)}">
            <img class="message-image" src="${att.base64}" alt="${escapeHtml(att.name)}">
          </div>`;
            } else if (att.type === 'pdf') {
                // PDF：如果有 base64 数据，点击在新标签页打开
                if (att.base64) {
                    innerHTML += `
            <div class="attachment-card pdf-card msg-preview-pdf" style="cursor:pointer" data-base64="${att.base64}" title="点击预览 PDF">
              <span class="pdf-icon">📄</span>
              <span class="pdf-name">${escapeHtml(att.name)}</span>
            </div>`;
                } else {
                    innerHTML += `
            <div class="attachment-card pdf-card">
              <span class="pdf-icon">📄</span>
              <span class="pdf-name">${escapeHtml(att.name)}</span>
            </div>`;
                }
            } else if (att.type === 'text') {
                // 选中文本：点击在侧栏弹窗预览
                const preview = att.content.length > 100 ? att.content.substring(0, 100) + '...' : att.content;
                innerHTML += `
          <div class="attachment-card selection-card msg-preview-text" style="cursor:pointer" data-content="${encodeURIComponent(att.content)}" title="点击查看完整文本">
            <div class="card-label">📝 选中文本</div>
            <div class="card-content">${escapeHtml(preview)}</div>
          </div>`;
            } else if (att.type === 'file') {
                // 文本文件：点击在侧栏弹窗预览
                const preview = att.content ? (att.content.length > 100 ? att.content.substring(0, 100) + '...' : att.content) : '';
                innerHTML += `
          <div class="attachment-card file-card msg-preview-text" style="cursor:pointer" data-content="${encodeURIComponent(att.content || '')}" title="点击查看文件内容">
            <div class="card-label">📄 ${escapeHtml(att.name)}</div>
            <div class="card-content">${escapeHtml(preview)}</div>
          </div>`;
            }
        });
        innerHTML += '</div>';
    }

    // 兼容旧的 file 字段
    if (message.file && !message.attachments) {
        if (message.file.type === 'image' && message.file.base64) {
            innerHTML += `
        <div class="attachment-card image-card msg-preview-image" style="cursor:pointer" data-base64="${message.file.base64}" data-name="上传的图片">
          <img class="message-image" src="${message.file.base64}" alt="上传的图片">
        </div>`;
        } else if (message.file.type === 'pdf') {
            innerHTML += `
        <div class="attachment-card pdf-card">
          <span class="pdf-icon">📄</span>
          <span class="pdf-name">${escapeHtml(message.file.name)}</span>
        </div>`;
        }
    }

    // 兼容旧的 image 字段
    if (message.image && !message.file && !message.attachments) {
        innerHTML += `
      <div class="attachment-card image-card msg-preview-image" style="cursor:pointer" data-base64="${message.image}" data-name="上传的图片">
        <img class="message-image" src="${message.image}" alt="上传的图片">
      </div>`;
    }

    // 对用户消息提取并格式化显示
    if (message.role === 'user') {
        const parsed = parseUserMessage(message.content);

        // 显示用户问题
        if (parsed.question) {
            const formattedContent = formatContent(parsed.question);
            innerHTML += `<div class="message-content">${formattedContent}</div>`;
        }
    } else {
        // AI 回复或错误消息
        const formattedContent = formatContent(message.content);
        innerHTML += `<div class="message-content">${formattedContent}</div>`;
    }

    msgEl.innerHTML = innerHTML;
    elements.chatContainer.appendChild(msgEl);

    // 绑定消息内附件的点击事件
    msgEl.querySelectorAll('.msg-preview-image').forEach(el => {
        el.addEventListener('click', () => {
            const base64 = el.dataset.base64;
            const name = el.dataset.name;
            showPreviewModal('image', base64, name);
        });
    });

    msgEl.querySelectorAll('.msg-preview-pdf').forEach(el => {
        el.addEventListener('click', () => {
            const base64 = el.dataset.base64;
            openPdfFromBase64Direct(base64);
        });
    });

    msgEl.querySelectorAll('.msg-preview-text').forEach(el => {
        el.addEventListener('click', () => {
            const content = decodeURIComponent(el.dataset.content);
            showPreviewModal('text', content, '选中文本');
        });
    });
}

// 解析用户消息，提取选中文本和问题
function parseUserMessage(content) {
    const result = {
        selectedText: null,
        question: content
    };

    // 提取选中文本（多段）
    const selectedMatches = content.match(/【选中文本 \d+】\n([\s\S]*?)(?=\n\n【|$)/g);
    if (selectedMatches) {
        // 已经在 attachments 中处理，这里不重复显示
    }

    // 提取选中文本（旧格式）
    const selectedMatch = content.match(/【用户选中的文本】\n([\s\S]*?)(?=\n\n【用户的问题】|$)/);
    if (selectedMatch) {
        result.selectedText = selectedMatch[1].trim();
    }

    // 提取用户问题
    const questionMatch = content.match(/【用户的问题】\n([\s\S]*?)$/);
    if (questionMatch) {
        result.question = questionMatch[1].trim();
    } else if (selectedMatch) {
        // 如果有选中文本但没有明确的问题，使用默认提示
        result.question = '请帮我分析这段文本';
    }

    return result;
}

// HTML 转义
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 格式化内容 (简单 Markdown + 数学公式)
function formatContent(content) {
    // 先保护代码块，避免内部内容被处理
    const codeBlocks = [];
    let formatted = content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({ lang, code });
        return `__CODE_BLOCK_${idx}__`;
    });
    
    // 保护行内代码
    const inlineCodes = [];
    formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(code);
        return `__INLINE_CODE_${idx}__`;
    });

    // 保护数学公式
    const mathBlocks = [];
    const mathInlines = [];
    
    // 保护块级公式 $$...$$
    formatted = formatted.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
        const idx = mathBlocks.length;
        mathBlocks.push(formula.trim());
        return `__MATH_BLOCK_${idx}__`;
    });
    
    // 保护行内公式 $...$ 
    formatted = formatted.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
        const idx = mathInlines.length;
        mathInlines.push(formula.trim());
        return `__MATH_INLINE_${idx}__`;
    });

    // 转义 HTML
    formatted = formatted
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 标题（必须在行首）
    formatted = formatted.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    formatted = formatted.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    formatted = formatted.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    formatted = formatted.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    formatted = formatted.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // 粗体
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 斜体
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // 恢复代码块
    formatted = formatted.replace(/__CODE_BLOCK_(\d+)__/g, (match, idx) => {
        const { code } = codeBlocks[parseInt(idx)];
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
    });
    
    // 恢复行内代码
    formatted = formatted.replace(/__INLINE_CODE_(\d+)__/g, (match, idx) => {
        return `<code>${escapeHtml(inlineCodes[parseInt(idx)])}</code>`;
    });
    
    // 恢复块级公式 - 使用 KaTeX 渲染
    formatted = formatted.replace(/__MATH_BLOCK_(\d+)__/g, (match, idx) => {
        const formula = mathBlocks[parseInt(idx)];
        try {
            if (typeof katex !== 'undefined') {
                const rendered = katex.renderToString(formula, {
                    displayMode: true,
                    throwOnError: false,
                    output: 'html'
                });
                return `<div class="math-block">${rendered}</div>`;
            }
        } catch (e) {
            console.warn('KaTeX render error:', e);
        }
        // 回退到纯文本显示
        return `<div class="math-block"><code class="math-formula">${escapeHtml(formula)}</code></div>`;
    });
    
    // 恢复行内公式 - 使用 KaTeX 渲染
    formatted = formatted.replace(/__MATH_INLINE_(\d+)__/g, (match, idx) => {
        const formula = mathInlines[parseInt(idx)];
        try {
            if (typeof katex !== 'undefined') {
                const rendered = katex.renderToString(formula, {
                    displayMode: false,
                    throwOnError: false,
                    output: 'html'
                });
                return `<span class="math-inline">${rendered}</span>`;
            }
        } catch (e) {
            console.warn('KaTeX render error:', e);
        }
        // 回退到纯文本显示
        return `<code class="math-inline">${escapeHtml(formula)}</code>`;
    });

    return formatted;
}

// 显示加载指示器
function showTypingIndicator() {
    const typingEl = document.createElement('div');
    typingEl.className = 'message assistant typing-indicator';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
    elements.chatContainer.appendChild(typingEl);
    scrollToBottom();
    return typingEl;
}

// 移除加载指示器
function removeTypingIndicator(el) {
    if (el && el.parentNode) {
        el.parentNode.removeChild(el);
    }
}

// 滚动到底部
function scrollToBottom() {
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// 清空对话
async function clearChat() {
    state.messages = [];
    await chrome.storage.local.set({ messages: [] });

    // 清空后默认勾选附带页面
    state.includePageContext = true;
    elements.includePageContext.checked = true;

    elements.chatContainer.innerHTML = `
    <div class="welcome-message">
      <p>👋 对话已清空！</p>
      <p>你可以开始新的对话了。</p>
    </div>
  `;
}

// 显示提示
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background: ${type === 'error' ? '#d93025' : '#0f9d58'};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
  `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 直接显示预览弹窗（用于历史消息中的附件）
function showPreviewModalDirect(type, content, title) {
    showPreviewModal(type, content, title);
}

// 从编码内容显示文本预览（用于历史消息中的选中文本）
function showPreviewModalFromEncoded(encodedContent) {
    const content = decodeURIComponent(encodedContent);
    showPreviewModal('text', content, '选中文本');
}

// 从 base64 打开 PDF（用于历史消息中的 PDF）
function openPdfFromBase64(base64Data) {
    try {
        const pureBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const byteCharacters = atob(pureBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
    } catch (e) {
        showToast('无法预览 PDF', 'error');
    }
}

// 暴露全局函数供 onclick 使用
window.removeAttachment = removeAttachment;
window.previewText = previewText;
window.previewImage = previewImage;
window.previewPdf = previewPdf;
window.closePreviewModal = closePreviewModal;
window.showPreviewModal = showPreviewModal;
window.showPreviewModalDirect = showPreviewModalDirect;
window.showPreviewModalFromEncoded = showPreviewModalFromEncoded;
window.openPdfFromBase64 = openPdfFromBase64;

// 初始化
init();
