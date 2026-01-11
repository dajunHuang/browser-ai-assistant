import { Providers } from './types';

// 默认系统提示词
export const DEFAULT_SYSTEM_PROMPT = `你是一个智能助手，正在帮助用户阅读和理解网页内容。

你的职责：
1. 不要超过 400 字的回答长度
2. 根据提供的页面上下文和用户选中的文本，或发送的图片等文件，准确回答用户的问题
3. 如果用户选中了文本，优先围绕选中内容进行分析、解释或总结
4. 回答要简洁明了, 保持回答结构清晰但不过度格式化，使用段落形式而非过多的列表嵌套
5. 如果页面内容不足以回答问题，请诚实说明并提供你所知道的相关信息
6. 对于代码片段，提供清晰的解释；
7. 请用中文回答，除非用户要求使用其他语言。`;

// LLM 提供商配置
export const PROVIDERS: Providers = {
    gemini: {
        name: 'Google Gemini',
        models: [
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
            { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
            { id: 'gemini-2.0-flash-lite-preview-02-05', name: 'Gemini 2.0 Flash Lite' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
        ],
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    },
    openai: {
        name: 'OpenAI',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'o1', name: 'o1 (Reasoning)' },
            { id: 'o3-mini', name: 'o3-mini (Reasoning)' }
        ],
        endpoint: 'https://api.openai.com/v1/chat/completions'
    },
    anthropic: {
        name: 'Anthropic',
        models: [
            { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
            { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
        ],
        endpoint: 'https://api.anthropic.com/v1/messages'
    },
    deepseek: {
        name: 'DeepSeek',
        models: [
            { id: 'deepseek-chat', name: 'DeepSeek V3' },
            { id: 'deepseek-reasoner', name: 'DeepSeek R1' }
        ],
        endpoint: 'https://api.deepseek.com/chat/completions'
    }
};
