import { state } from './state.js';
import { PROVIDERS, DEFAULT_SYSTEM_PROMPT } from './config.js';
import { 
    initElements, elements, updateSendButtonState, 
    renderMessages, renderMessage, renderAttachments, 
    showPendingSelection, hidePendingSelection,
    createStreamingMessage, updatePageContextAvailability, clearChatUI,
    closePreviewModal, showPreviewModal, updateAttachmentsBarPosition
} from './ui.js';
import { isTextFile, escapeHtml, formatContent, showToast, openPdfFromBase64 } from './utils.js';
import { callLLMAPIStreaming } from './api.js';

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
            if (result.settings.apiKey && (!state.settings.apiKeys || !state.settings.apiKeys[state.settings.provider])) {
                if (!state.settings.apiKeys) state.settings.apiKeys = {};
                state.settings.apiKeys[state.settings.provider] = result.settings.apiKey;
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

            elements.providerSelect.value = state.settings.provider;
            elements.apiKeyInput.value = state.settings.apiKeys[state.settings.provider] || '';
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
    // 保存当前输入框的 API Key 到当前 provider
    const currentProvider = elements.providerSelect.value;
    state.settings.apiKeys[currentProvider] = elements.apiKeyInput.value;

    state.settings.provider = currentProvider;
    state.settings.model = elements.modelSelect.value;
    state.settings.systemPrompt = elements.systemPrompt.value;

    // 移除废弃的 apiKey 字段
    delete state.settings.apiKey;

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
    const currentModelId = state.settings.model;
    const modelExists = models.find(m => m.id === currentModelId);
    
    // 如果之前选中的模型属于当前提供商，则保持选中；否则选中第一个
    // 注意：这里有一个逻辑问题，state.settings.model 可能还存着上一个提供商的模型
    // 所以我们应该检查它是否在当前 list 中
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
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsPanel.classList.remove('hidden');
        // 打开面板时，确保显示的 API Key 是当前选择的提供商的
        const provider = elements.providerSelect.value;
        elements.apiKeyInput.value = state.settings.apiKeys[provider] || '';
    });

    elements.closeSettings.addEventListener('click', () => {
        elements.settingsPanel.classList.add('hidden');
    });

    elements.saveSettings.addEventListener('click', saveSettings);

    elements.providerSelect.addEventListener('change', () => {
        // 在切换提供商之前，先保存当前输入框的 Key 到内存（state），以免丢失
        // 注意：这里我们无法知道"上一个"选中的是谁，除非我们在 change 之前记录
        // 但 simpler approach: 
        // 每次 input 变化时更新 state? 或者在 change 事件中处理？
        // 由于 change 事件触发时 value 已经是新的了，我们需要一个变量记录 oldProvider
        // 或者简单的：假设用户切换前必须保存？不，那样体验不好。
        
        // 更好的方案：
        // providerSelect 的 focus 事件记录旧值？
        // 或者：每次修改 apiKeyInput，直接同步到 state.settings.apiKeys[currentProvider]
    });
    
    // 监听 API Key 输入，实时同步到 state
    elements.apiKeyInput.addEventListener('input', () => {
        const provider = elements.providerSelect.value;
        state.settings.apiKeys[provider] = elements.apiKeyInput.value;
    });

    // 监听 Provider 切换
    elements.providerSelect.addEventListener('change', () => {
        updateModelOptions();
        const provider = elements.providerSelect.value;
        elements.apiKeyInput.value = state.settings.apiKeys[provider] || '';
    });

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

    // 发送消息或取消
    elements.sendBtn.addEventListener('click', () => {
        if (state.isLoading) {
            cancelMessage();
        } else {
            sendMessage();
        }
    });

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

// 生成附件ID
function generateAttachmentId() {
    return ++state.attachmentIdCounter;
}

// 添加附件
function addAttachment(attachment) {
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
                 openPdfFromBase64(att.base64);
             }
        }
    });
    updateSendButtonState();
}

// 删除附件
function removeAttachment(id) {
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
                 openPdfFromBase64(att.base64);
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
function handleFileUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
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

    e.target.value = '';
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
                addAttachment({
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
async function requestPageContext(silent = false) {
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
    const userInput = elements.messageInput.value.trim();

    const hasAttachments = state.attachments.length > 0;
    const hasPendingSelection = !!state.pendingSelection;
    const hasPageContext = state.includePageContext && !elements.includePageContext.disabled;
    
    if (!userInput && !hasAttachments && !hasPendingSelection && !hasPageContext) return;
    if (state.isLoading) return;

    if (!state.settings.apiKeys[state.settings.provider]) {
        showToast('请先在设置中配置 API Key', 'error');
        return;
    }

    if (state.includePageContext && !elements.includePageContext.disabled) {
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

    let pendingSelectionAttachment = null;
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

    if (state.includePageContext && contextPrefix) {
        state.includePageContext = false;
        elements.includePageContext.checked = false;
    }

    const fileAttachments = allAttachments.filter(a => a.type === 'image' || a.type === 'pdf');

    state.lastUserMessage = userInput;
    state.lastUserAttachments = [...allAttachments];

    const attachmentsCopy = [...allAttachments];
    clearAllAttachments();

    // 添加消息（支持多附件）
    function addMessage(role, content, attachments = null) {
        let savedAttachments = null;
        if (attachments && attachments.length > 0) {
            savedAttachments = attachments.map(att => ({
                type: att.type,
                name: att.name,
                content: (att.type === 'text' || att.type === 'file') ? att.content : null,
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
    }
    
    addMessage('user', content, attachmentsCopy);
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';

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
            role: 'assistant',
            content: finalContent,
            timestamp: Date.now(),
            attachments: null
        };
        state.messages.push(message);
        chrome.storage.local.set({ messages: state.messages });

    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        assistantMsgEl.querySelector('.message-content').innerHTML =
            `<span style="color: var(--error-color)">错误: ${escapeHtml(error.message)}</span>`;
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

    const userMessages = elements.chatContainer.querySelectorAll('.message.user');
    if (userMessages.length > 0) {
        userMessages[userMessages.length - 1].remove();
    }

    if (state.lastUserMessage) {
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
            onPreview: (type, id) => { /* ... preview logic repeated ... */ }
        });
        // 简化起见，这里先调一次 renderAttachments 恢复视觉，具体回调绑定在 addAttachment 里更优
        // 但这里是恢复，所以需要重新走一遍 add流程或者 render流程
        // 由于 renderAttachments 依赖 state.attachments，我们已经恢复了 state，只需要调用 render
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
                     openPdfFromBase64(att.base64);
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
    elements.includePageContext.checked = true;

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
