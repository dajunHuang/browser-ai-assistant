import { state } from './state';
import { escapeHtml, formatContent, openPdfFromBase64, parseUserMessage } from './utils';
import { Message, Attachment } from './types';

// DOM 元素接口
interface DOMElements {
    settingsBtn: HTMLElement | null;
    settingsPanel: HTMLElement | null;
    providerSelect: HTMLSelectElement | null;
    apiKeyInput: HTMLInputElement | null;
    modelSelect: HTMLSelectElement | null;
    systemPrompt: HTMLTextAreaElement | null;
    saveSettings: HTMLElement | null;
    closeSettings: HTMLElement | null;
    pendingSelectionBar: HTMLElement | null;
    pendingSelectionText: HTMLElement | null;
    clearPendingSelection: HTMLElement | null;
    attachmentsBar: HTMLElement | null;
    attachmentsList: HTMLElement | null;
    clearAllAttachments: HTMLElement | null;
    uploadFileBtn: HTMLElement | null;
    fileInput: HTMLInputElement | null;
    chatContainer: HTMLElement | null;
    messageInput: HTMLTextAreaElement | null;
    sendBtn: HTMLButtonElement | null;
    clearChatBtn: HTMLElement | null;
    includePageContext: HTMLInputElement | null;
}

// DOM 元素缓存
export const elements: DOMElements = {
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
export function initElements(): void {
    elements.settingsBtn = document.getElementById('settingsBtn');
    elements.settingsPanel = document.getElementById('settingsPanel');
    elements.providerSelect = document.getElementById('providerSelect') as HTMLSelectElement;
    elements.apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
    elements.modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
    elements.systemPrompt = document.getElementById('systemPrompt') as HTMLTextAreaElement;
    elements.saveSettings = document.getElementById('saveSettings');
    elements.closeSettings = document.getElementById('closeSettings');
    elements.pendingSelectionBar = document.getElementById('pendingSelectionBar');
    elements.pendingSelectionText = document.getElementById('pendingSelectionText');
    elements.clearPendingSelection = document.getElementById('clearPendingSelection');
    elements.attachmentsBar = document.getElementById('attachmentsBar');
    elements.attachmentsList = document.getElementById('attachmentsList');
    elements.clearAllAttachments = document.getElementById('clearAllAttachments');
    elements.uploadFileBtn = document.getElementById('uploadFileBtn');
    elements.fileInput = document.getElementById('fileInput') as HTMLInputElement;
    elements.chatContainer = document.getElementById('chatContainer');
    elements.messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
    elements.sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
    elements.clearChatBtn = document.getElementById('clearChatBtn');
    elements.includePageContext = document.getElementById('includePageContext') as HTMLInputElement;
}

// 更新发送按钮状态
export function updateSendButtonState(): void {
    if (!elements.sendBtn || !elements.messageInput) return;

    if (state.isLoading) {
        // 加载中：显示停止按钮
        elements.sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>';
        elements.sendBtn.disabled = false;
        elements.sendBtn.style.opacity = '1';
        elements.sendBtn.style.cursor = 'pointer';
        elements.sendBtn.title = '停止生成';
        elements.sendBtn.classList.add('stop-btn');
    } else {
        // 非加载中：显示发送按钮
        elements.sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
        const userInput = elements.messageInput.value.trim();
        const hasAttachments = state.attachments.length > 0;
        const hasPendingSelection = !!state.pendingSelection;
        const hasPageContext = state.includePageContext && elements.includePageContext && !elements.includePageContext.disabled;

        const canSend = userInput || hasAttachments || hasPendingSelection || hasPageContext;

        const btn = elements.sendBtn;
        btn.disabled = !canSend;
        btn.style.opacity = canSend ? '1' : '0.5';
        btn.style.cursor = canSend ? 'pointer' : 'not-allowed';
        btn.title = '发送消息 (Enter)';
        btn.classList.remove('stop-btn');
    }
}

// 显示待发送的选中文本提示
export function showPendingSelection(): void {
    if (!state.pendingSelection || !elements.pendingSelectionText || !elements.pendingSelectionBar) return;
    const preview = state.pendingSelection.length > 50 
        ? state.pendingSelection.substring(0, 50) + '...' 
        : state.pendingSelection;
    // 恢复为纯文本渲染
    elements.pendingSelectionText.textContent = preview;
    elements.pendingSelectionBar.classList.remove('hidden');
    updateAttachmentsBarPosition();
    updateSendButtonState();
}

// 隐藏待发送的选中文本提示
export function hidePendingSelection(): void {
    if (!elements.pendingSelectionBar) return;
    elements.pendingSelectionBar.classList.add('hidden');
    updateAttachmentsBarPosition();
    if (!state.isLoading) {
        updateSendButtonState();
    }
}

// 更新附件列表的位置
export function updateAttachmentsBarPosition(): void {
    // 布局已改为静态流式布局，不再需要手动计算位置
}

interface AttachmentCallbacks {
    onRemove?: (id: number) => void;
    onPreview?: (type: string, id: number) => void;
}

// 渲染附件列表
export function renderAttachments(callbacks: AttachmentCallbacks = {}): void {
    if (!elements.attachmentsBar || !elements.attachmentsList) return;

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
        item.dataset.id = att.id.toString();

        let content = '';
        if (att.type === 'text') {
            const preview = att.content && att.content.length > 100 ? att.content.substring(0, 100) + '...' : att.content;
            // 文本附件预览恢复为纯文本
            content = `
        <div class="attachment-icon clickable-preview" data-preview-type="text" data-preview-id="${att.id}" style="cursor:pointer">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </div>
        <div class="attachment-info clickable-preview" data-preview-type="text" data-preview-id="${att.id}" style="cursor:pointer">
          <span class="attachment-name">选中文本</span>
          <div class="attachment-preview">${escapeHtml(preview || '')}</div>
        </div>`;
        } else if (att.type === 'file') {
            const preview = att.content && att.content.length > 80 ? att.content.substring(0, 80) + '...' : att.content;
            // 文件预览也恢复为纯文本
            content = `
        <div class="attachment-icon clickable-preview" data-preview-type="file" data-preview-id="${att.id}" style="cursor:pointer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
        </div>
        <div class="attachment-info clickable-preview" data-preview-type="file" data-preview-id="${att.id}" style="cursor:pointer">
          <span class="attachment-name">${escapeHtml(att.name || '')}</span>
          <div class="attachment-preview">${escapeHtml(preview || '')}</div>
        </div>`;
        } else if (att.type === 'image') {
            content = `
        <div class="attachment-thumb clickable-preview" data-preview-type="image" data-preview-id="${att.id}" style="cursor:pointer">
          <img src="${att.base64}" alt="${att.name}">
        </div>
        <div class="attachment-info clickable-preview" data-preview-type="image" data-preview-id="${att.id}" style="cursor:pointer">
          <span class="attachment-name">${escapeHtml(att.name || '')}</span>
          <span class="attachment-size">图片 · 点击预览</span>
        </div>`;
        } else if (att.type === 'pdf') {
            content = `
        <div class="attachment-icon clickable-preview" data-preview-type="pdf" data-preview-id="${att.id}" style="cursor:pointer">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <div class="attachment-info clickable-preview" data-preview-type="pdf" data-preview-id="${att.id}" style="cursor:pointer">
          <span class="attachment-name">${escapeHtml(att.name || '')}</span>
          <span class="attachment-size">PDF · 点击预览</span>
        </div>`;
        }

        item.innerHTML = `
      ${content}
      <button class="attachment-remove" data-remove-id="${att.id}" title="删除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

        elements.attachmentsList?.appendChild(item);
    });

    // 绑定预览点击事件
    elements.attachmentsList.querySelectorAll('.clickable-preview').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = (el as HTMLElement).dataset.previewType;
            const id = parseInt((el as HTMLElement).dataset.previewId || '0');
            if (callbacks.onPreview && type) callbacks.onPreview(type, id);
        });
    });

    // 绑定删除按钮事件
    elements.attachmentsList.querySelectorAll('.attachment-remove').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt((el as HTMLElement).dataset.removeId || '0');
            if (callbacks.onRemove) callbacks.onRemove(id);
        });
    });
}

// 显示预览弹窗
export function showPreviewModal(type: string, content: string | undefined, title: string | undefined): void {
    if (!content) return;
    
    // 移除已存在的弹窗
    const existingModal = document.querySelector('.preview-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'preview-modal';

    let bodyContent = '';
    if (type === 'text') {
        // 预览弹窗改为纯文本显示
        bodyContent = `<div class="preview-text">${escapeHtml(content)}</div>`;
    } else if (type === 'image') {
        bodyContent = `<img class="preview-image" src="${content}" alt="${escapeHtml(title || '')}">`;
    }

    modal.innerHTML = `
    <div class="preview-modal-backdrop"></div>
    <div class="preview-modal-content">
      <div class="preview-modal-header">
        <span class="preview-modal-title">${escapeHtml(title || '')}</span>
        <button class="preview-modal-close">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
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

    modal.querySelector('.preview-modal-backdrop')?.addEventListener('click', closeModal);
    modal.querySelector('.preview-modal-close')?.addEventListener('click', closeModal);

    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

export function closePreviewModal(): void {
    const modal = document.querySelector('.preview-modal');
    if (modal) {
        modal.remove();
    }
}

// 创建流式输出的消息元素
export function createStreamingMessage(): HTMLElement {
    // 移除欢迎消息
    const welcomeMsg = elements.chatContainer?.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    const msgEl = document.createElement('div');
    msgEl.className = 'message assistant';
    msgEl.innerHTML = '<div class="message-content"><span class="streaming-cursor">▊</span></div>';
    msgEl.dataset.rawContent = '';
    elements.chatContainer?.appendChild(msgEl);
    scrollToBottom(true);
    return msgEl;
}

// 更新流式消息内容
export function updateStreamingMessage(msgEl: HTMLElement, content: string): void {
    msgEl.dataset.rawContent = content;
    const contentEl = msgEl.querySelector('.message-content');
    if (contentEl) {
        contentEl.innerHTML = formatContent(content) + '<span class="streaming-cursor">▊</span>';
    }
    scrollToBottom(false, msgEl);
}

// 完成流式消息
export function finalizeStreamingMessage(msgEl: HTMLElement): void {
    const content = msgEl.dataset.rawContent || '';
    const contentEl = msgEl.querySelector('.message-content');
    if (contentEl) {
        contentEl.innerHTML = formatContent(content);
    }
}

// 渲染所有消息
export function renderMessages(shouldScroll: boolean = true): void {
    if (!elements.chatContainer) return;

    // 清除欢迎消息
    const welcomeMsg = elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg && state.messages.length > 0) {
        welcomeMsg.remove();
    }

    // 清空容器但不删除欢迎消息（如果它应该存在）
    if (state.messages.length > 0) {
        elements.chatContainer.innerHTML = ''; 
        state.messages.forEach((msg, i) => renderMessage(msg, i));
        if (shouldScroll) scrollToBottom(true);
    }
}

// 渲染单条消息
export function renderMessage(message: Message, index: number = -1): void {
    if (!elements.chatContainer) return;

    // 移除欢迎消息
    const welcomeMsg = elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    const msgEl = document.createElement('div');
    msgEl.className = `message ${message.role}`;
    if (index >= 0) msgEl.dataset.index = index.toString();

    // 构建消息内容
    let innerHTML = '';

    // 渲染多附件
    if (message.attachments && message.attachments.length > 0) {
        innerHTML += '<div class="message-attachments">';
        message.attachments.forEach((att) => {
            if (att.type === 'image' && att.base64) {
                innerHTML += `
          <div class="attachment-card image-card msg-preview-image" style="cursor:pointer" data-base64="${att.base64}" data-name="${escapeHtml(att.name || '')}">
            <img class="message-image" src="${att.base64}" alt="${escapeHtml(att.name || '')}">
          </div>`;
            } else if (att.type === 'pdf') {
                if (att.base64) {
                    innerHTML += `
            <div class="attachment-card pdf-card msg-preview-pdf" style="cursor:pointer" data-base64="${att.base64}" title="点击预览 PDF">
              <span class="pdf-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></span>
              <span class="pdf-name">${escapeHtml(att.name || '')}</span>
            </div>`;
                } else {
                    innerHTML += `
            <div class="attachment-card pdf-card">
              <span class="pdf-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></span>
              <span class="pdf-name">${escapeHtml(att.name || '')}</span>
            </div>`;
                }
            } else if (att.type === 'text') {
                const preview = att.content && att.content.length > 100 ? att.content.substring(0, 100) + '...' : att.content;
                // 聊天记录中的选中文本卡片恢复为纯文本处理
                innerHTML += `
          <div class="attachment-card selection-card msg-preview-text" style="cursor:pointer" data-content="${encodeURIComponent(att.content || '')}" data-name="选中文本" title="点击查看完整文本">
            <div class="card-label">📝 选中文本</div>
            <div class="card-content">${escapeHtml(preview || '')}</div>
          </div>`;
            } else if (att.type === 'file') {
                const preview = att.content ? (att.content.length > 100 ? att.content.substring(0, 100) + '...' : att.content) : '';
                // 文件预览恢复为纯文本，并复用 selection-card 样式以保持标题独占一行
                innerHTML += `
          <div class="attachment-card file-card selection-card msg-preview-text" style="cursor:pointer" data-content="${encodeURIComponent(att.content || '')}" data-name="${escapeHtml(att.name || '文件内容')}" title="点击查看文件内容">
            <div class="card-label">📄 ${escapeHtml(att.name || '')}</div>
            <div class="card-content">${escapeHtml(preview || '')}</div>
          </div>`;
            }
        });
        innerHTML += '</div>';
    }

    // 对用户消息提取并格式化显示
    if (message.role === 'user') {
        const parsed = parseUserMessage(message.content);
        let actionsHTML = '';
        if (index >= 0) {
            actionsHTML = `
            <div class="message-actions">
                <button class="action-btn restore-btn" data-action="restore" data-index="${index}" title="撤销至此 (删除此条及之后)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>
                </button>
                <button class="action-btn delete-btn" data-action="delete" data-index="${index}" title="删除此条对话">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>`;
        }

        if (parsed.question) {
            const formattedContent = formatContent(parsed.question);
            innerHTML += `<div class="message-content">${actionsHTML}${formattedContent}</div>`;
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
            showPreviewModal('image', (el as HTMLElement).dataset.base64, (el as HTMLElement).dataset.name);
        });
    });

    msgEl.querySelectorAll('.msg-preview-pdf').forEach(el => {
        el.addEventListener('click', () => {
            openPdfFromBase64((el as HTMLElement).dataset.base64 || '');
        });
    });

    msgEl.querySelectorAll('.msg-preview-text').forEach(el => {
        el.addEventListener('click', () => {
            const content = decodeURIComponent((el as HTMLElement).dataset.content || '');
            const title = (el as HTMLElement).dataset.name || '选中文本';
            showPreviewModal('text', content, title);
        });
    });
}

// 智能滚动
export function scrollToBottom(force = false, currentMessageEl: HTMLElement | null = null): void {
    const container = elements.chatContainer;
    if (!container) return;

    if (force) {
        container.scrollTop = container.scrollHeight;
        return;
    }

    if (currentMessageEl) {
        const msgRect = currentMessageEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (msgRect.top - containerRect.top < 25) {
            return;
        }
    }

    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = scrollBottom <= 200;

    if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

// 清空对话
export function clearChatUI(): void {
    if (!elements.chatContainer) return;
    elements.chatContainer.innerHTML = `
        <div class="welcome-message">
          <div class="welcome-icon">👋</div>
          <h3>对话已清空</h3>
          <p>你可以开始新的对话了。</p>
          <div class="welcome-tips">
            <div class="tip-item">
              <span class="tip-icon">🖱️</span>
              <span>选中网页文本右键发送</span>
            </div>
            <div class="tip-item">
              <span class="tip-icon">📄</span>
              <span>上传 PDF 或图片提问</span>
            </div>
          </div>
        </div>
    `;
}

// 更新附带页面选项的可用状态
export function updatePageContextAvailability(available: boolean): void {
    if (!elements.includePageContext || !elements.includePageContext.parentElement) return;
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