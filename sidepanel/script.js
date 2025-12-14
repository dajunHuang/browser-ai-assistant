// 默认系统提示词
const DEFAULT_SYSTEM_PROMPT = `你是一个智能助手，正在帮助用户阅读和理解网页内容。

你的职责：
1. 不要超过 400 字的回答长度
2. 根据提供的页面上下文和用户选中的文本，或发送的图片等文件，准确回答用户的问题
3. 如果用户选中了文本，优先围绕选中内容进行分析、解释或总结
4. 回答要简洁明了, 保持回答结构清晰但不过度格式化，使用段落形式而非过多的列表嵌套
5. 如果页面内容不足以回答问题，请诚实说明并提供你所知道的相关信息
6. 对于代码片段，提供清晰的解释；
7. 请用中文回答，除非用户要求使用其他语言。`;

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
    pageContextReject: null, // 等待页面上下文的 Promise reject（错误时调用）
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
    setupMarked(); // 配置 marked
    await loadSettings();
    setupEventListeners();
    setupMessageListener();
    setupTabListener(); // 监听标签页变化
    updateModelOptions();
    // 检查当前页面状态
    await checkCurrentPageStatus();
    // 初始化发送按钮状态
    updateSendButtonState();
}

// 监听标签页变化（实时检测）
function setupTabListener() {
    // 标签页切换
    chrome.tabs.onActivated.addListener(() => {
        checkCurrentPageStatus();
    });
    
    // 标签页 URL 变化 - 只在页面加载完成时检测
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
            // 检查是否为当前活动标签页
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id === tabId) {
                    checkCurrentPageStatus();
                }
            });
        }
    });
}

// 检查当前页面状态
async function checkCurrentPageStatus() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'CHECK_PAGE_STATUS' });
        if (response) {
            updatePageContextAvailability(!response.isSpecialPage);
            if (!response.isSpecialPage) {
                // 普通页面，预加载页面上下文（静默模式，不显示错误）
                requestPageContext(true); // true 表示静默模式
            } else {
                // 特殊页面（PDF等），清除缓存的页面上下文
                state.pageContext = '';
                state.pageTitle = '';
                state.pageUrl = '';
            }
        }
    } catch (error) {
        updatePageContextAvailability(false);
        // 清除缓存
        state.pageContext = '';
        state.pageTitle = '';
        state.pageUrl = '';
    }
}

// 更新附带页面选项的可用状态
function updatePageContextAvailability(available) {
    const toggleBtn = elements.includePageContext.parentElement;
    if (available) {
        // 页面上下文可用
        elements.includePageContext.disabled = false;
        toggleBtn.classList.remove('disabled');
        toggleBtn.title = '附带当前页面内容';
    } else {
        // 页面上下文不可用（PDF、本地文件等）
        // 只禁用，不改变勾选状态
        elements.includePageContext.disabled = true;
        toggleBtn.classList.add('disabled');
        toggleBtn.title = '当前页面无法获取内容（PDF、本地文件或浏览器内部页面）';
    }
    if (!state.isLoading) {
        updateSendButtonState();
    }
}

// 加载设置
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['settings', 'messages']);
        if (result.settings) {
            state.settings = { ...state.settings, ...result.settings };
            elements.providerSelect.value = state.settings.provider;
            elements.apiKeyInput.value = state.settings.apiKey;
            elements.systemPrompt.value = state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
            updateModelOptions();
            elements.modelSelect.value = state.settings.model;
        } else {
            // 首次使用，输入框显示默认提示词
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
        updateSendButtonState();
    });

    // 清空对话
    elements.clearChatBtn.addEventListener('click', clearChat);

    // 页面上下文开关
    elements.includePageContext.addEventListener('change', (e) => {
        state.includePageContext = e.target.checked;
        updateSendButtonState();
    });
}

// 更新发送按钮状态
function updateSendButtonState() {
    const userInput = elements.messageInput.value.trim();
    const hasAttachments = state.attachments.length > 0;
    const hasPendingSelection = !!state.pendingSelection;
    const hasPageContext = state.includePageContext && !elements.includePageContext.disabled;
    
    const canSend = userInput || hasAttachments || hasPendingSelection || hasPageContext;
    
    elements.sendBtn.disabled = !canSend || state.isLoading;
    elements.sendBtn.style.opacity = (!canSend || state.isLoading) ? '0.5' : '1';
    elements.sendBtn.style.cursor = (!canSend || state.isLoading) ? 'not-allowed' : 'pointer';
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
    updateSendButtonState();
}

// 隐藏待发送的选中文本提示
function hidePendingSelection() {
    elements.pendingSelectionBar.classList.add('hidden');
    updateAttachmentsBarPosition();
    if (!state.isLoading) {
        updateSendButtonState();
    }
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
    updateSendButtonState();
}

// 删除附件
function removeAttachment(id) {
    state.attachments = state.attachments.filter(a => a.id !== id);
    renderAttachments();
    if (!state.isLoading) {
        updateSendButtonState();
    }
}

// 清除所有附件
function clearAllAttachments() {
    state.attachments = [];
    renderAttachments();
    if (!state.isLoading) {
        updateSendButtonState();
    }
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
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const att = state.attachments.find(a => a.id === numId);
    if (att && att.type === 'text') {
        showPreviewModal('text', att.content, '选中文本');
    }
}

// 文本文件预览（侧栏弹窗）
function previewFile(id) {
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const att = state.attachments.find(a => a.id === numId);
    if (att && att.type === 'file') {
        showPreviewModal('text', att.content, att.name);
    }
}

// 图片预览（侧栏弹窗）
function previewImage(id) {
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const att = state.attachments.find(a => a.id === numId);
    if (att && att.type === 'image') {
        showPreviewModal('image', att.base64, att.name);
    }
}

// PDF 预览（新标签页）
function previewPdf(id) {
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const att = state.attachments.find(a => a.id === numId);
    if (att && att.type === 'pdf') {
        openPdfFromBase64(att.base64);
    }
}

// 显示预览弹窗
function showPreviewModal(type, content, title) {
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
        switch (message.type) {
            case 'SELECTED_TEXT':
                // 右键菜单发送的文本，直接添加为附件
                addAttachment({
                    type: 'text',
                    content: message.text,
                    name: 'selected-text'
                });
                break;
                
            case 'SELECTION_CHANGED':
                // 用户在网页选择了新文本，替换待发送的选中内容
                if (message.text && message.text.trim()) {
                    state.pendingSelection = message.text.trim();
                    showPendingSelection();
                } else {
                    state.pendingSelection = null;
                    hidePendingSelection();
                }
                break;
                
            case 'PAGE_CONTEXT':
                state.pageContext = message.content;
                state.pageTitle = message.title;
                state.pageUrl = message.url;
                // 更新附带页面选项的可用状态
                updatePageContextAvailability(true);
                // 通知等待中的 Promise
                if (state.pageContextResolve) {
                    state.pageContextResolve(true);
                    state.pageContextResolve = null;
                }
                break;
                
            case 'IMAGE_FROM_PAGE':
                // 接收从网页右键发送的图片
                addAttachment({
                    type: 'image',
                    base64: message.imageData.base64,
                    mimeType: message.imageData.mimeType,
                    name: message.imageData.name
                });
                showToast('图片已添加');
                break;
                
            case 'TRIGGER_SEND':
                // 网页端按 Ctrl+Enter 触发发送
                sendMessage();
                break;
                
            case 'PAGE_CONTEXT_ERROR':
                // 获取页面上下文失败，禁用按钮
                updatePageContextAvailability(false);
                state.pageContext = '';
                state.pageTitle = '';
                state.pageUrl = '';
                if (state.pageContextReject) {
                    state.pageContextReject();
                    state.pageContextReject = null;
                }
                break;
        }
    });
}

// 请求获取页面上下文（返回 Promise）
// silent: 静默模式，不会在失败时触发其他操作
async function requestPageContext(silent = false) {
    // 如果已经有请求在进行中，静默模式直接返回
    if (state.pageContextResolve && silent) {
        return Promise.resolve(!!state.pageContext);
    }
    
    return new Promise((resolve) => {
        // 设置超时（增加到 5 秒）
        const timeout = setTimeout(() => {
            state.pageContextResolve = null;
            state.pageContextReject = null;
            resolve(false);
        }, 5000);
        
        // 保存 resolve 函数供消息监听器调用
        state.pageContextResolve = (success) => {
            clearTimeout(timeout);
            state.pageContextReject = null;
            resolve(success);
        };
        
        // 保存 reject 函数供错误处理（仅非静默模式）
        state.pageContextReject = silent ? null : () => {
            clearTimeout(timeout);
            state.pageContextResolve = null;
            resolve(false);
        };
        
        try {
            // 通过 background script 获取页面上下文
            chrome.runtime.sendMessage({ type: 'REQUEST_PAGE_CONTEXT' });
        } catch (error) {
            clearTimeout(timeout);
            state.pageContextResolve = null;
            state.pageContextReject = null;
            resolve(false);
        }
    });
}

// 发送消息
async function sendMessage() {
    const userInput = elements.messageInput.value.trim();

    // 检查是否有内容可发送（包括待发送的选中文本、附件、或勾选了附带页面）
    const hasAttachments = state.attachments.length > 0;
    const hasPendingSelection = !!state.pendingSelection;
    const hasPageContext = state.includePageContext && !elements.includePageContext.disabled;
    
    if (!userInput && !hasAttachments && !hasPendingSelection && !hasPageContext) return;
    if (state.isLoading) return;

    // 检查 API Key
    if (!state.settings.apiKey) {
        showToast('请先在设置中配置 API Key', 'error');
        return;
    }

    // 如果开启了附带页面，确保有页面上下文
    if (state.includePageContext && !elements.includePageContext.disabled) {
        // 按钮可用且已勾选，尝试获取页面上下文
        if (!state.pageContext) {
            // 没有缓存，重新请求
            const gotContext = await requestPageContext();
            if (!gotContext || !state.pageContext) {
                // 获取失败，禁用按钮
                updatePageContextAvailability(false);
                // 如果没有其他内容可发送，提示并返回
                if (!userInput && !hasAttachments && !hasPendingSelection) {
                    showToast('无法获取页面内容', 'error');
                    return;
                }
                // 否则继续发送其他内容（不包含页面上下文）
            }
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
        // 只有页面上下文时，如果没有用户输入，默认请求总结页面
        content = `${contextPrefix}【用户的问题】\n${userInput || '请帮我总结这个页面的主要内容'}`;
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
    updateSendButtonState();
    
    // 创建助手消息元素用于流式输出
    const assistantMsgEl = createStreamingMessage();

    try {
        await callLLMAPIStreaming(content, fileAttachments, assistantMsgEl);
        // 流式完成后保存消息
        const finalContent = assistantMsgEl.dataset.rawContent || '';
        saveAssistantMessage(finalContent);
    } catch (error) {
        assistantMsgEl.querySelector('.message-content').innerHTML = 
            `<span style="color: var(--error-color)">错误: ${escapeHtml(error.message)}</span>`;
    } finally {
        state.isLoading = false;
        updateSendButtonState();
    }
}

// 创建流式输出的消息元素
function createStreamingMessage() {
    // 移除欢迎消息
    const welcomeMsg = elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    const msgEl = document.createElement('div');
    msgEl.className = 'message assistant';
    msgEl.innerHTML = '<div class="message-content"><span class="streaming-cursor">▊</span></div>';
    msgEl.dataset.rawContent = '';
    elements.chatContainer.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
}

// 更新流式消息内容
function updateStreamingMessage(msgEl, content) {
    msgEl.dataset.rawContent = content;
    const contentEl = msgEl.querySelector('.message-content');
    contentEl.innerHTML = formatContent(content) + '<span class="streaming-cursor">▊</span>';
    scrollToBottom();
}

// 完成流式消息
function finalizeStreamingMessage(msgEl) {
    const content = msgEl.dataset.rawContent || '';
    const contentEl = msgEl.querySelector('.message-content');
    contentEl.innerHTML = formatContent(content);
}

// 保存助手消息到历史
function saveAssistantMessage(content) {
    const message = {
        role: 'assistant',
        content,
        timestamp: Date.now(),
        attachments: null
    };
    state.messages.push(message);
    chrome.storage.local.set({ messages: state.messages });
}

// 调用 LLM API - 流式输出
async function callLLMAPIStreaming(userMessage, fileAttachments, msgEl) {
    const { provider, apiKey, model, systemPrompt } = state.settings;
    const effectiveSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    
    // 排除最后一条消息（当前正在发送的消息），因为它会作为 userMessage 单独传递
    const historyMessages = state.messages.length > 0 ? state.messages.slice(0, -1) : [];
    const history = historyMessages.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
    }));

    switch (provider) {
        case 'gemini':
            return await callGeminiStreaming(apiKey, model, userMessage, history, effectiveSystemPrompt, fileAttachments, msgEl);
        case 'openai':
            return await callOpenAIStreaming(apiKey, model, userMessage, history, effectiveSystemPrompt, fileAttachments, msgEl);
        case 'anthropic':
            return await callAnthropicStreaming(apiKey, model, userMessage, history, effectiveSystemPrompt, fileAttachments, msgEl);
        default:
            throw new Error('不支持的提供商');
    }
}

// 调用 LLM API（支持多文件）
async function callLLMAPI(userMessage, fileAttachments = []) {
    const { provider, apiKey, model, systemPrompt } = state.settings;

    // 使用用户自定义提示词或默认提示词
    const effectiveSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // 构建历史消息（不包含文件，避免过大）
    // 排除最后一条消息（当前正在发送的消息），因为它会作为 userMessage 单独传递
    const historyMessages = state.messages.length > 0 ? state.messages.slice(0, -1) : [];
    const history = historyMessages.slice(-10).map(m => ({
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

// ============ 流式 API 调用 ============

// Gemini 流式 API
async function callGeminiStreaming(apiKey, model, userMessage, history, systemPrompt, fileAttachments, msgEl) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const contents = [];
    contents.push({ role: 'user', parts: [{ text: `System: ${systemPrompt}` }] });
    contents.push({ role: 'model', parts: [{ text: '好的，我会按照您的要求来回答问题。' }] });

    for (const msg of history) {
        contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        });
    }

    const currentParts = [];
    for (const file of fileAttachments) {
        const base64Data = file.base64.split(',')[1];
        currentParts.push({ inline_data: { mime_type: file.mimeType, data: base64Data } });
    }
    currentParts.push({ text: userMessage });
    contents.push({ role: 'user', parts: currentParts });

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (text) {
                        fullContent += text;
                        updateStreamingMessage(msgEl, fullContent);
                    }
                } catch (e) {}
            }
        }
    }

    finalizeStreamingMessage(msgEl);
    return fullContent;
}

// OpenAI 流式 API
async function callOpenAIStreaming(apiKey, model, userMessage, history, systemPrompt, fileAttachments, msgEl) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push(...history);

    const images = fileAttachments.filter(f => f.type === 'image');
    const pdfs = fileAttachments.filter(f => f.type === 'pdf');

    if (images.length > 0) {
        const content = [];
        images.forEach(img => {
            content.push({ type: 'image_url', image_url: { url: img.base64 } });
        });
        let text = userMessage;
        if (pdfs.length > 0) {
            text += `\n\n（注意：已忽略 ${pdfs.length} 个 PDF 文件，OpenAI 不支持直接处理 PDF，请使用 Gemini）`;
        }
        content.push({ type: 'text', text });
        messages.push({ role: 'user', content });
    } else if (pdfs.length > 0) {
        messages.push({ role: 'user', content: userMessage + `\n\n（注意：已忽略 ${pdfs.length} 个 PDF 文件）` });
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
            max_tokens: 4096,
            stream: true
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                    const data = JSON.parse(line.slice(6));
                    const text = data.choices?.[0]?.delta?.content || '';
                    if (text) {
                        fullContent += text;
                        updateStreamingMessage(msgEl, fullContent);
                    }
                } catch (e) {}
            }
        }
    }

    finalizeStreamingMessage(msgEl);
    return fullContent;
}

// Anthropic 流式 API
async function callAnthropicStreaming(apiKey, model, userMessage, history, systemPrompt, fileAttachments, msgEl) {
    const images = fileAttachments.filter(f => f.type === 'image');
    const pdfs = fileAttachments.filter(f => f.type === 'pdf');

    let currentContent;
    if (images.length > 0) {
        currentContent = [];
        images.forEach(img => {
            const base64Data = img.base64.split(',')[1];
            currentContent.push({
                type: 'image',
                source: { type: 'base64', media_type: img.mimeType, data: base64Data }
            });
        });
        let text = userMessage;
        if (pdfs.length > 0) {
            text += `\n\n（注意：已忽略 ${pdfs.length} 个 PDF 文件，Anthropic 不支持直接处理 PDF，请使用 Gemini）`;
        }
        currentContent.push({ type: 'text', text });
    } else if (pdfs.length > 0) {
        currentContent = userMessage + `\n\n（注意：已忽略 ${pdfs.length} 个 PDF 文件）`;
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
            messages,
            stream: true
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'content_block_delta') {
                        const text = data.delta?.text || '';
                        if (text) {
                            fullContent += text;
                            updateStreamingMessage(msgEl, fullContent);
                        }
                    }
                } catch (e) {}
            }
        }
    }

    finalizeStreamingMessage(msgEl);
    return fullContent;
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
            openPdfFromBase64(base64);
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

// 配置 marked
function setupMarked() {
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true
        });
    }
}

// 格式化内容 - 使用 marked 渲染 Markdown，KaTeX 渲染公式
function formatContent(content) {
    // 保护数学公式，避免被 marked 处理
    const mathBlocks = [];
    const mathInlines = [];
    
    // 保护块级公式 $$...$$
    let formatted = content.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
        const idx = mathBlocks.length;
        mathBlocks.push(formula.trim());
        return `%%MATH_BLOCK_${idx}%%`;
    });
    
    // 保护行内公式 $...$
    formatted = formatted.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
        const idx = mathInlines.length;
        mathInlines.push(formula.trim());
        return `%%MATH_INLINE_${idx}%%`;
    });

    // 使用 marked 渲染 Markdown
    if (typeof marked !== 'undefined') {
        formatted = marked.parse(formatted);
    } else {
        // 回退到简单处理
        formatted = escapeHtml(formatted).replace(/\n/g, '<br>');
    }
    
    // 恢复块级公式 - 使用 KaTeX 渲染
    formatted = formatted.replace(/%%MATH_BLOCK_(\d+)%%/g, (match, idx) => {
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
        return `<div class="math-block"><code>${escapeHtml(formula)}</code></div>`;
    });
    
    // 恢复行内公式 - 使用 KaTeX 渲染
    formatted = formatted.replace(/%%MATH_INLINE_(\d+)%%/g, (match, idx) => {
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
        return `<code>${escapeHtml(formula)}</code>`;
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

// 从 base64 打开 PDF
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

// 初始化
init();
