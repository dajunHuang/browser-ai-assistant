import { state } from './state.js';
import { escapeHtml, formatContent, openPdfFromBase64, parseUserMessage } from './utils.js';

// DOM 元素缓存
export const elements = {
    settingsBtn: null,
    settingsPanel: null,
    providerSelect: null,
    apiKeyInput: null,
    modelSelect: null,
    systemPrompt: null,
    saveSettings: null,
    closeSettings: null,
    pendingSelectionBar: null,
    pendingSelectionText: null,
    clearPendingSelection: null,
    attachmentsBar: null,
    attachmentsList: null,
    clearAllAttachments: null,
    uploadFileBtn: null,
    fileInput: null,
    chatContainer: null,
    messageInput: null,
    sendBtn: null,
    clearChatBtn: null,
    includePageContext: null
};

// 初始化 DOM 元素
export function initElements() {
    elements.settingsBtn = document.getElementById('settingsBtn');
    elements.settingsPanel = document.getElementById('settingsPanel');
    elements.providerSelect = document.getElementById('providerSelect');
    elements.apiKeyInput = document.getElementById('apiKeyInput');
    elements.modelSelect = document.getElementById('modelSelect');
    elements.systemPrompt = document.getElementById('systemPrompt');
    elements.saveSettings = document.getElementById('saveSettings');
    elements.closeSettings = document.getElementById('closeSettings');
    elements.pendingSelectionBar = document.getElementById('pendingSelectionBar');
    elements.pendingSelectionText = document.getElementById('pendingSelectionText');
    elements.clearPendingSelection = document.getElementById('clearPendingSelection');
    elements.attachmentsBar = document.getElementById('attachmentsBar');
    elements.attachmentsList = document.getElementById('attachmentsList');
    elements.clearAllAttachments = document.getElementById('clearAllAttachments');
    elements.uploadFileBtn = document.getElementById('uploadFileBtn');
    elements.fileInput = document.getElementById('fileInput');
    elements.chatContainer = document.getElementById('chatContainer');
    elements.messageInput = document.getElementById('messageInput');
    elements.sendBtn = document.getElementById('sendBtn');
    elements.clearChatBtn = document.getElementById('clearChatBtn');
    elements.includePageContext = document.getElementById('includePageContext');
}

// 更新发送按钮状态
export function updateSendButtonState() {
    if (state.isLoading) {
        // 加载中：显示取消按钮
        elements.sendBtn.innerHTML = '✕';
        elements.sendBtn.disabled = false;
        elements.sendBtn.style.opacity = '1';
        elements.sendBtn.style.cursor = 'pointer';
        elements.sendBtn.title = '取消回复';
    } else {
        // 非加载中：显示发送按钮
        elements.sendBtn.innerHTML = '➤';
        const userInput = elements.messageInput.value.trim();
        const hasAttachments = state.attachments.length > 0;
        const hasPendingSelection = !!state.pendingSelection;
        const hasPageContext = state.includePageContext && !elements.includePageContext.disabled;

        const canSend = userInput || hasAttachments || hasPendingSelection || hasPageContext;

        elements.sendBtn.disabled = !canSend;
        elements.sendBtn.style.opacity = canSend ? '1' : '0.5';
        elements.sendBtn.style.cursor = canSend ? 'pointer' : 'not-allowed';
        elements.sendBtn.title = '发送消息 (Enter)';
    }
}

// 显示待发送的选中文本提示
export function showPendingSelection() {
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
export function hidePendingSelection() {
    elements.pendingSelectionBar.classList.add('hidden');
    updateAttachmentsBarPosition();
    if (!state.isLoading) {
        updateSendButtonState();
    }
}

// 更新附件列表的位置
export function updateAttachmentsBarPosition() {
    const isPendingVisible = !elements.pendingSelectionBar.classList.contains('hidden');
    const pendingHeight = isPendingVisible ? elements.pendingSelectionBar.offsetHeight : 0;
    elements.attachmentsBar.style.top = `${pendingHeight}px`;
}

// 渲染附件列表
export function renderAttachments(callbacks = {}) {
    // callbacks: { removeAttachment, previewText, previewFile, previewImage, previewPdf }
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
            if (callbacks.onPreview) callbacks.onPreview(type, id);
        });
    });

    // 绑定删除按钮事件
    elements.attachmentsList.querySelectorAll('.attachment-remove').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(el.dataset.removeId);
            if (callbacks.onRemove) callbacks.onRemove(id);
        });
    });
}

// 显示预览弹窗
export function showPreviewModal(type, content, title) {
    // 移除已存在的弹窗
    const existingModal = document.querySelector('.preview-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'preview-modal';

    let bodyContent = '';
    if (type === 'text') {
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

    const closeModal = () => {
        if (modal) modal.remove();
    };

    modal.querySelector('.preview-modal-backdrop').addEventListener('click', closeModal);
    modal.querySelector('.preview-modal-close').addEventListener('click', closeModal);

    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

export function closePreviewModal() {
    const modal = document.querySelector('.preview-modal');
    if (modal) {
        modal.remove();
    }
}

// 创建流式输出的消息元素
export function createStreamingMessage() {
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
    scrollToBottom(true);
    return msgEl;
}

// 更新流式消息内容
export function updateStreamingMessage(msgEl, content) {
    msgEl.dataset.rawContent = content;
    const contentEl = msgEl.querySelector('.message-content');
    contentEl.innerHTML = formatContent(content) + '<span class="streaming-cursor">▊</span>';
    scrollToBottom(false, msgEl);
}

// 完成流式消息
export function finalizeStreamingMessage(msgEl) {
    const content = msgEl.dataset.rawContent || '';
    const contentEl = msgEl.querySelector('.message-content');
    contentEl.innerHTML = formatContent(content);
}

// 渲染所有消息
export function renderMessages() {
    // 清除欢迎消息
    const welcomeMsg = elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg && state.messages.length > 0) {
        welcomeMsg.remove();
    } else if (state.messages.length === 0 && !welcomeMsg) {
        // 如果没有消息，显示欢迎消息 (这里可以简化，或者在 clearChat 中处理)
    }

    // 清空容器但不删除欢迎消息（如果它应该存在）
    if (state.messages.length > 0) {
        elements.chatContainer.innerHTML = ''; 
        state.messages.forEach(msg => renderMessage(msg));
        scrollToBottom(true);
    }
}

// 渲染单条消息
export function renderMessage(message) {
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
            if (att.type === 'image' && att.base64) {
                innerHTML += `
          <div class="attachment-card image-card msg-preview-image" style="cursor:pointer" data-base64="${att.base64}" data-name="${escapeHtml(att.name)}">
            <img class="message-image" src="${att.base64}" alt="${escapeHtml(att.name)}">
          </div>`;
            } else if (att.type === 'pdf') {
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
                const preview = att.content.length > 100 ? att.content.substring(0, 100) + '...' : att.content;
                innerHTML += `
          <div class="attachment-card selection-card msg-preview-text" style="cursor:pointer" data-content="${encodeURIComponent(att.content)}" title="点击查看完整文本">
            <div class="card-label">📝 选中文本</div>
            <div class="card-content">${escapeHtml(preview)}</div>
          </div>`;
            } else if (att.type === 'file') {
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

    // 兼容旧数据的代码省略，假设新数据结构完整

    // 对用户消息提取并格式化显示
    if (message.role === 'user') {
        const parsed = parseUserMessage(message.content);
        if (parsed.question) {
            const formattedContent = formatContent(parsed.question);
            innerHTML += `<div class="message-content">${formattedContent}</div>`;
        }
    } else {
        const formattedContent = formatContent(message.content);
        innerHTML += `<div class="message-content">${formattedContent}</div>`;
    }

    msgEl.innerHTML = innerHTML;
    elements.chatContainer.appendChild(msgEl);

    // 绑定消息内附件的点击事件
    msgEl.querySelectorAll('.msg-preview-image').forEach(el => {
        el.addEventListener('click', () => {
            showPreviewModal('image', el.dataset.base64, el.dataset.name);
        });
    });

    msgEl.querySelectorAll('.msg-preview-pdf').forEach(el => {
        el.addEventListener('click', () => {
            openPdfFromBase64(el.dataset.base64);
        });
    });

    msgEl.querySelectorAll('.msg-preview-text').forEach(el => {
        el.addEventListener('click', () => {
            const content = decodeURIComponent(el.dataset.content);
            showPreviewModal('text', content, '选中文本');
        });
    });
}

// 智能滚动：只有当用户已经在底部时才自动滚动
function scrollToBottom(force = false, currentMessageEl = null) {
    const container = elements.chatContainer;

    // 如果是强制滚动，直接滚动到底部
    if (force) {
        container.scrollTop = container.scrollHeight;
        return;
    }

    // 如果提供了当前消息元素，检查消息开头是否还在可视区域内
    if (currentMessageEl) {
        const msgRect = currentMessageEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // 如果消息的顶部距离容器顶部小于60px（留出标签和内边距的空间），停止自动滚动
        // 这样可以避免第一行内容被"LLM智能助手"标签遮挡
        if (msgRect.top - containerRect.top < 25) {
            return;
        }
    }

    // 判断用户是否在底部
    // 使用更大的容差(200px)来处理快速内容增长的情况
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = scrollBottom <= 200;

    // 只有在底部时才滚动
    if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

// 清空对话
export function clearChatUI() {
    elements.chatContainer.innerHTML = `
    <div class="welcome-message">
      <p>👋 对话已清空！</p>
      <p>你可以开始新的对话了。</p>
    </div>
  `;
}

// 更新附带页面选项的可用状态
export function updatePageContextAvailability(available) {
    const toggleBtn = elements.includePageContext.parentElement;
    if (available) {
        elements.includePageContext.disabled = false;
        toggleBtn.classList.remove('disabled');
        toggleBtn.title = '附带当前页面内容';
    } else {
        elements.includePageContext.disabled = true;
        toggleBtn.classList.add('disabled');
        toggleBtn.title = '当前页面无法获取内容（PDF、本地文件或浏览器内部页面）';
    }
}
