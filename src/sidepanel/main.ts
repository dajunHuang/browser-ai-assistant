import { state } from './state';
import { PROVIDERS, DEFAULT_SYSTEM_PROMPT } from './config';
import { 
    initElements, elements, updateSendButtonState, 
    renderMessages, renderMessage, renderAttachments, 
    showPendingSelection, hidePendingSelection,
    createStreamingMessage, updatePageContextAvailability, clearChatUI,
    closePreviewModal, showPreviewModal, updateAttachmentsBarPosition
} from './ui';
import { isTextFile, escapeHtml, formatContent, showToast, openPdfFromBase64 } from './utils';
import { callLLMAPIStreaming } from './api';
import { Attachment } from './types';

// 初始化
async function init() {
    setupMarked(); // 配置 marked
    initElements(); // 初始化 DOM 元素引用
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

// 加载设置
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['settings', 'messages']);
        if (result.settings) {
            // 合并设置，确保新字段存在
            state.settings = { ...state.settings, ...result.settings };
            
            // 数据迁移：如果存在旧的 apiKey 且 apiKeys 为空（或对应 provider 为空），则迁移
            if ((result.settings as any).apiKey && (!state.settings.apiKeys || !state.settings.apiKeys[state.settings.provider])) {
                if (!state.settings.apiKeys) state.settings.apiKeys = {} as any;
                state.settings.apiKeys[state.settings.provider] = (result.settings as any).apiKey;
            }
            
            // 确保 apiKeys 对象存在
            if (!state.settings.apiKeys) {
                state.settings.apiKeys = {
                    gemini: '',
                    openai: '',
                    anthropic: '',
                    deepseek: ''
                };
            }

            if (elements.providerSelect) elements.providerSelect.value = state.settings.provider;
            if (elements.apiKeyInput) elements.apiKeyInput.value = state.settings.apiKeys[state.settings.provider] || '';
            if (elements.systemPrompt) elements.systemPrompt.value = state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
            updateModelOptions();
            if (elements.modelSelect) elements.modelSelect.value = state.settings.model;
        } else {
            // 首次使用，输入框显示默认提示词
            if (elements.systemPrompt) elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
        }

        if (result.messages && result.messages.length > 0) {
            state.messages = result.messages;
            renderMessages();
        } else {
            // 首次使用或没有消息时，默认勾选附带页面
            state.includePageContext = true;
            if (elements.includePageContext) elements.includePageContext.checked = true;
        }
    } catch (error) {
        console.error('加载设置失败:', error);
    }
}

// 保存设置
async function saveSettings() {
    // 保存当前输入框的 API Key 到当前 provider
    if (elements.providerSelect && elements.apiKeyInput) {
        const currentProvider = elements.providerSelect.value;
        state.settings.apiKeys[currentProvider] = elements.apiKeyInput.value;
        state.settings.provider = currentProvider;
    }

    if (elements.modelSelect) state.settings.model = elements.modelSelect.value;
    if (elements.systemPrompt) state.settings.systemPrompt = elements.systemPrompt.value;

    // 移除废弃的 apiKey 字段
    if ((state.settings as any).apiKey) delete (state.settings as any).apiKey;

    try {
        await chrome.storage.local.set({ settings: state.settings });
        if (elements.settingsPanel) elements.settingsPanel.classList.add('hidden');
        showToast('设置已保存');
    } catch (error) {
        console.error('保存设置失败:', error);
        showToast('保存失败', 'error');
    }
}

// 更新模型选项
function updateModelOptions() {
    if (!elements.providerSelect || !elements.modelSelect) return;
    const provider = elements.providerSelect.value;
    const models = PROVIDERS[provider].models;

    elements.modelSelect.innerHTML = models
        .map(m => `<option value="${m.id}">${m.name}</option>`)
        .join('');

    // 如果当前保存的模型不在新的提供商列表中，设置为第一个模型
    const currentModelId = state.settings.model;
    const modelExists = models.find(m => m.id === currentModelId);
    
    if (modelExists) {
        elements.modelSelect.value = currentModelId;
    } else {
        elements.modelSelect.value = models[0].id;
        state.settings.model = models[0].id;
    }
}

// 设置事件监听
function setupEventListeners() {
    // 设置面板
    elements.settingsBtn?.addEventListener('click', () => {
        if (elements.settingsPanel) elements.settingsPanel.classList.remove('hidden');
        // 打开面板时，确保显示的 API Key 是当前选择的提供商的
        if (elements.providerSelect && elements.apiKeyInput) {
            const provider = elements.providerSelect.value;
            elements.apiKeyInput.value = state.settings.apiKeys[provider] || '';
        }
    });

    elements.closeSettings?.addEventListener('click', () => {
        if (elements.settingsPanel) elements.settingsPanel.classList.add('hidden');
    });

    elements.saveSettings?.addEventListener('click', saveSettings);

    elements.providerSelect?.addEventListener('change', () => {
        // change 事件已经太晚了，之前的值已经没了，所以只负责更新 UI
    });
    
    // 监听 API Key 输入，实时同步到 state
    elements.apiKeyInput?.addEventListener('input', () => {
        if (elements.providerSelect && elements.apiKeyInput) {
            const provider = elements.providerSelect.value;
            state.settings.apiKeys[provider] = elements.apiKeyInput.value;
        }
    });

    // 监听 Provider 切换
    elements.providerSelect?.addEventListener('change', () => {
        updateModelOptions();
        if (elements.providerSelect && elements.apiKeyInput) {
            const provider = elements.providerSelect.value;
            elements.apiKeyInput.value = state.settings.apiKeys[provider] || '';
        }
    });

    // 清除待发送的选中文本
    elements.clearPendingSelection?.addEventListener('click', () => {
        state.pendingSelection = null;
        hidePendingSelection();
    });

    // 文件上传（图片和 PDF，支持多选）
    elements.uploadFileBtn?.addEventListener('click', () => {
        elements.fileInput?.click();
    });

    elements.fileInput?.addEventListener('change', handleFileUpload);

    // 清除所有附件
    elements.clearAllAttachments?.addEventListener('click', clearAllAttachments);

    // 支持粘贴图片
    elements.messageInput?.addEventListener('paste', handlePaste);

    // 发送消息或取消
    elements.sendBtn?.addEventListener('click', () => {
        if (state.isLoading) {
            cancelMessage();
        } else {
            sendMessage();
        }
    });

    // 输入框聚焦时：Enter 发送，Shift+Enter 换行
    elements.messageInput?.addEventListener('keydown', (e) => {
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
    elements.messageInput?.addEventListener('input', () => {
        if (elements.messageInput) {
            elements.messageInput.style.height = 'auto';
            elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
            updateSendButtonState();
        }
    });

    // 清空对话
    elements.clearChatBtn?.addEventListener('click', clearChat);

    // 页面上下文开关
    elements.includePageContext?.addEventListener('change', (e) => {
        state.includePageContext = (e.target as HTMLInputElement).checked;
        updateSendButtonState();
    });
}

// 生成附件ID
function generateAttachmentId() {
    return ++state.attachmentIdCounter;
}

// 添加附件
function addAttachment(attachment: Attachment) {
    attachment.id = generateAttachmentId();
    state.attachments.push(attachment);
    
    // 渲染附件，并传入回调
    renderAttachments({
        onRemove: removeAttachment,
        onPreview: (type, id) => {
             const numId = typeof id === 'string' ? parseInt(id) : id;
             const att = state.attachments.find(a => a.id === numId);
             if (!att) return;
             if (type === 'text' || type === 'file') {
                 showPreviewModal('text', att.content, att.name || '选中文本');
             } else if (type === 'image') {
                 showPreviewModal('image', att.base64, att.name);
             } else if (type === 'pdf') {
                 if (att.base64) openPdfFromBase64(att.base64);
             }
        }
    });
    updateSendButtonState();
}

// 删除附件
function removeAttachment(id: number) {
    state.attachments = state.attachments.filter(a => a.id !== id);
    // 重新渲染，保持回调
    renderAttachments({
        onRemove: removeAttachment,
        onPreview: (type, id) => {
             const numId = typeof id === 'string' ? parseInt(id) : id;
             const att = state.attachments.find(a => a.id === numId);
             if (!att) return;
             if (type === 'text' || type === 'file') {
                 showPreviewModal('text', att.content, att.name || '选中文本');
             } else if (type === 'image') {
                 showPreviewModal('image', att.base64, att.name);
             } else if (type === 'pdf') {
                 if (att.base64) openPdfFromBase64(att.base64);
             }
        }
    });
    if (!state.isLoading) {
        updateSendButtonState();
    }
}

// 清除所有附件
function clearAllAttachments() {
    state.attachments = [];
    renderAttachments({}); // 清空后不需要回调
    if (!state.isLoading) {
        updateSendButtonState();
    }
}

// 处理文件上传（支持多文件）
function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    addAttachment({
                        id: 0,
                        type: 'image',
                        base64: event.target.result as string,
                        mimeType: file.type,
                        name: file.name
                    });
                }
            };
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    addAttachment({
                        id: 0,
                        type: 'pdf',
                        base64: event.target.result as string,
                        mimeType: file.type,
                        name: file.name
                    });
                }
            };
            reader.readAsDataURL(file);
        } else if (isTextFile(file)) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    addAttachment({
                        id: 0,
                        type: 'file',
                        content: event.target.result as string,
                        mimeType: file.type || 'text/plain',
                        name: file.name
                    });
                }
            };
            reader.readAsText(file);
        } else {
            showToast('不支持的文件类型: ' + file.name, 'error');
        }
    });

    target.value = '';
}

// 处理粘贴图片
function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        addAttachment({
                            id: 0,
                            type: 'image',
                            base64: event.target.result as string,
                            mimeType: file.type,
                            name: 'pasted-image-' + Date.now()
                        });
                    }
                };
                reader.readAsDataURL(file);
            }
            break;
        }
    }
}

// 监听来自 content script 的消息
function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
        switch (message.type) {
            case 'SELECTED_TEXT':
                addAttachment({
                    id: 0,
                    type: 'text',
                    content: message.text,
                    name: 'selected-text'
                });
                break;
                
            case 'SELECTION_CHANGED':
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
                updatePageContextAvailability(true);
                if (state.pageContextResolve) {
                    state.pageContextResolve(true);
                    state.pageContextResolve = null;
                }
                break;
                
            case 'IMAGE_FROM_PAGE':
                addAttachment({
                    id: 0,
                    type: 'image',
                    base64: message.imageData.base64,
                    mimeType: message.imageData.mimeType,
                    name: message.imageData.name
                });
                showToast('图片已添加');
                break;
                
            case 'TRIGGER_SEND':
                sendMessage();
                break;
                
            case 'PAGE_CONTEXT_ERROR':
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
async function requestPageContext(silent = false): Promise<boolean> {
    if (state.pageContextResolve && silent) {
        return Promise.resolve(!!state.pageContext);
    }
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            state.pageContextResolve = null;
            state.pageContextReject = null;
            resolve(false);
        }, 5000);
        
        state.pageContextResolve = (success) => {
            clearTimeout(timeout);
            state.pageContextReject = null;
            resolve(success);
        };
        
        state.pageContextReject = silent ? null : () => {
            clearTimeout(timeout);
            state.pageContextResolve = null;
            resolve(false);
        };
        
        try {
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
    if (!elements.messageInput) return;
    const userInput = elements.messageInput.value.trim();

    const hasAttachments = state.attachments.length > 0;
    const hasPendingSelection = !!state.pendingSelection;
    const hasPageContext = state.includePageContext && elements.includePageContext && !elements.includePageContext.disabled;
    
    if (!userInput && !hasAttachments && !hasPendingSelection && !hasPageContext) return;
    if (state.isLoading) return;

    if (!state.settings.apiKeys[state.settings.provider]) {
        showToast('请先在设置中配置 API Key', 'error');
        return;
    }

    if (state.includePageContext && elements.includePageContext && !elements.includePageContext.disabled) {
        if (!state.pageContext) {
            const gotContext = await requestPageContext();
            if (!gotContext || !state.pageContext) {
                updatePageContextAvailability(false);
                if (!userInput && !hasAttachments && !hasPendingSelection) {
                    showToast('无法获取页面内容', 'error');
                    return;
                }
            }
        }
    }

    let pendingSelectionAttachment: Attachment | null = null;
    if (state.pendingSelection) {
        pendingSelectionAttachment = {
            id: generateAttachmentId(),
            type: 'text',
            content: state.pendingSelection,
            name: 'selected-text'
        };
        state.pendingSelection = null;
        hidePendingSelection();
    }

    let content = userInput;
    let contextPrefix = '';
    if (state.includePageContext && state.pageContext) {
        const truncatedContext = state.pageContext.length > 8000
            ? state.pageContext.substring(0, 8000) + '\n...（内容已截断）'
            : state.pageContext;
        contextPrefix = `【当前页面信息】\n标题: ${state.pageTitle}\nURL: ${state.pageUrl}\n\n【页面完整内容】\n${truncatedContext}\n\n`;
    }

    const allAttachments = pendingSelectionAttachment 
        ? [pendingSelectionAttachment, ...state.attachments]
        : [...state.attachments];

    const textAttachments = allAttachments.filter(a => a.type === 'text');
    const fileTextAttachments = allAttachments.filter(a => a.type === 'file');
    
    let textContent = '';
    
    if (textAttachments.length > 0) {
        const textsContent = textAttachments.map((t, i) =>
            `【选中文本 ${i + 1}】\n${t.content}`
        ).join('\n\n');
        textContent += textsContent;
    }
    
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
        content = `${contextPrefix}【用户的问题】\n${userInput || '请帮我总结这个页面的主要内容'}`;
    }

    // Add Page Context indicator as an attachment if included
    if (contextPrefix) {
        const pageContextAttachment: Attachment = {
            id: generateAttachmentId(),
            type: 'file', // Render as a file card
            name: '当前页面内容',
            content: state.pageContext, // The full context content
            mimeType: 'text/plain'
        };
        allAttachments.unshift(pageContextAttachment);
    }

    if (state.includePageContext && contextPrefix) {
        state.includePageContext = false;
        if (elements.includePageContext) elements.includePageContext.checked = false;
    }

    const fileAttachments = allAttachments.filter(a => a.type === 'image' || a.type === 'pdf');

    state.lastUserMessage = userInput;
    state.lastUserAttachments = [...allAttachments];

    const attachmentsCopy = [...allAttachments];
    clearAllAttachments();

    // 添加消息（支持多附件）
    function addMessage(role: 'user' | 'assistant' | 'error', content: string, attachments: Attachment[] | null = null) {
        let savedAttachments: Attachment[] | null = null;
        if (attachments && attachments.length > 0) {
            savedAttachments = attachments.map(att => ({
                id: att.id,
                type: att.type,
                name: att.name,
                content: (att.type === 'text' || att.type === 'file') ? att.content : undefined,
                base64: (att.type === 'image' || att.type === 'pdf') ? att.base64 : undefined,
                mimeType: att.mimeType
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
    }
    
    addMessage('user', content, attachmentsCopy);
    if (elements.messageInput) {
        elements.messageInput.value = '';
        elements.messageInput.style.height = 'auto';
    }

    state.abortController = new AbortController();
    state.isLoading = true;
    updateSendButtonState();

    const assistantMsgEl = createStreamingMessage();
    state.streamingMessageElement = assistantMsgEl;

    try {
        await callLLMAPIStreaming(content, fileAttachments, assistantMsgEl);
        const finalContent = assistantMsgEl.dataset.rawContent || '';
        
        // 保存助手消息
        const message = {
            role: 'assistant' as const,
            content: finalContent,
            timestamp: Date.now(),
            attachments: null
        };
        state.messages.push(message);
        chrome.storage.local.set({ messages: state.messages });

    } catch (error: any) {
        if (error.name === 'AbortError') {
            return;
        }
        const contentEl = assistantMsgEl.querySelector('.message-content');
        if (contentEl) {
            contentEl.innerHTML = `<span style="color: var(--error-color)">错误: ${escapeHtml(error.message)}</span>`;
        }
    } finally {
        state.isLoading = false;
        state.abortController = null;
        state.streamingMessageElement = null;
        updateSendButtonState();
    }
}

// 取消正在进行的消息发送
function cancelMessage() {
    if (!state.isLoading) return;

    if (state.abortController) {
        state.abortController.abort();
    }

    if (state.streamingMessageElement) {
        state.streamingMessageElement.remove();
    }

    if (state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'user') {
        state.messages.pop();
        chrome.storage.local.set({ messages: state.messages });
    }

    const userMessages = elements.chatContainer?.querySelectorAll('.message.user');
    if (userMessages && userMessages.length > 0) {
        userMessages[userMessages.length - 1].remove();
    }

    if (state.lastUserMessage && elements.messageInput) {
        elements.messageInput.value = state.lastUserMessage;
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = elements.messageInput.scrollHeight + 'px';
        elements.messageInput.focus();
        elements.messageInput.setSelectionRange(
            elements.messageInput.value.length,
            elements.messageInput.value.length
        );
    }

    if (state.lastUserAttachments && state.lastUserAttachments.length > 0) {
        state.attachments = [...state.lastUserAttachments];
        // 恢复附件并绑定事件
        renderAttachments({
            onRemove: removeAttachment,
            onPreview: (type, id) => {
                 const numId = typeof id === 'string' ? parseInt(id) : id;
                 const att = state.attachments.find(a => a.id === numId);
                 if (!att) return;
                 if (type === 'text' || type === 'file') {
                     showPreviewModal('text', att.content, att.name || '选中文本');
                 } else if (type === 'image') {
                     showPreviewModal('image', att.base64, att.name);
                 } else if (type === 'pdf') {
                     if (att.base64) openPdfFromBase64(att.base64);
                 }
            }
        });
    }

    state.isLoading = false;
    state.abortController = null;
    state.streamingMessageElement = null;
    state.lastUserMessage = null;
    state.lastUserAttachments = null;

    updateSendButtonState();
}

// 清空对话
async function clearChat() {
    state.messages = [];
    await chrome.storage.local.set({ messages: [] });

    state.includePageContext = true;
    if (elements.includePageContext) elements.includePageContext.checked = true;

    clearChatUI();
    updateSendButtonState();
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

// 启动
init();
