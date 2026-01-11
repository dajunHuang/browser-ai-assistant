// 状态管理
export const state = {
    settings: {
        provider: 'gemini',
        // apiKey: '', // 废弃，使用 apiKeys 替代
        apiKeys: {
            gemini: '',
            openai: '',
            anthropic: '',
            deepseek: ''
        },
        model: 'gemini-2.0-flash',
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
    pendingSelection: null, // 待发送的选中文本（用户在网页选择但未手动确认的）
    abortController: null, // 用于中止 API 请求
    lastUserMessage: null, // 保存最后发送的用户消息内容（用于取消后恢复）
    lastUserAttachments: null, // 保存最后发送的附件（用于取消后恢复）
    streamingMessageElement: null // 当前流式输出的消息元素
};
