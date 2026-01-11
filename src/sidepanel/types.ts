export interface Model {
    id: string;
    name: string;
}

export interface Provider {
    name: string;
    models: Model[];
    endpoint: string;
}

export interface Providers {
    [key: string]: Provider;
}

export interface ApiKeys {
    [key: string]: string;
}

export interface Settings {
    provider: string;
    apiKeys: ApiKeys;
    model: string;
    systemPrompt: string;
}

export interface Attachment {
    id: number;
    type: 'text' | 'image' | 'pdf' | 'file';
    content?: string;
    base64?: string;
    name?: string;
    mimeType?: string;
}

export interface Message {
    role: 'user' | 'assistant' | 'error' | 'system';
    content: string;
    timestamp: number;
    attachments: Attachment[] | null;
}

export interface State {
    settings: Settings;
    messages: Message[];
    attachments: Attachment[];
    pageContext: string;
    pageTitle: string;
    pageUrl: string;
    includePageContext: boolean;
    isLoading: boolean;
    attachmentIdCounter: number;
    pageContextResolve: ((value: boolean) => void) | null;
    pageContextReject: (() => void) | null;
    pendingSelection: string | null;
    abortController: AbortController | null;
    lastUserMessage: string | null;
    lastUserAttachments: Attachment[] | null;
    streamingMessageElement: HTMLElement | null;
}
