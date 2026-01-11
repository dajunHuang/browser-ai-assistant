import { State } from './types';

// 状态管理
export const state: State = {
    settings: {
        provider: 'gemini',
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
    attachments: [], 
    pageContext: '', 
    pageTitle: '',   
    pageUrl: '',     
    includePageContext: false, 
    isLoading: false,
    attachmentIdCounter: 0, 
    pageContextResolve: null, 
    pageContextReject: null, 
    pendingSelection: null, 
    abortController: null, 
    lastUserMessage: null, 
    lastUserAttachments: null, 
    streamingMessageElement: null 
};
