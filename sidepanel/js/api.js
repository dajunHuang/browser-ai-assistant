import { state } from './state.js';
import { updateStreamingMessage, finalizeStreamingMessage } from './ui.js';
import { DEFAULT_SYSTEM_PROMPT } from './config.js';

// 调用 LLM API - 流式输出
export async function callLLMAPIStreaming(userMessage, fileAttachments, msgEl) {
    const { provider, apiKeys, model, systemPrompt } = state.settings;
    const apiKey = apiKeys[provider];
    const effectiveSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    
    // 排除最后一条消息
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
        case 'deepseek':
            return await callDeepSeekStreaming(apiKey, model, userMessage, history, effectiveSystemPrompt, fileAttachments, msgEl);
        default:
            throw new Error('不支持的提供商');
    }
}

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
        }),
        signal: state.abortController?.signal
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
        }),
        signal: state.abortController?.signal
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
        }),
        signal: state.abortController?.signal
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

// DeepSeek 流式 API (OpenAI Compatible)
async function callDeepSeekStreaming(apiKey, model, userMessage, history, systemPrompt, fileAttachments, msgEl) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push(...history);

    // DeepSeek 目前主要支持文本，图片/PDF 处理同 OpenAI (忽略 PDF，图片视模型而定，这里简单处理为仅文本)
    // DeepSeek V3/R1 支持程度不同，暂时只传文本
    const pdfs = fileAttachments.filter(f => f.type === 'pdf');
    const images = fileAttachments.filter(f => f.type === 'image');
    
    let text = userMessage;
    if (images.length > 0 || pdfs.length > 0) {
        text += `\n\n（注意：已忽略 ${images.length + pdfs.length} 个附件，DeepSeek 当前接口暂时仅支持纯文本交互）`;
    }
    messages.push({ role: 'user', content: text });

    const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: model === 'deepseek-reasoner' ? undefined : 0.7, // R1 不建议设置 temperature
            stream: true
        }),
        signal: state.abortController?.signal
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let isThinking = false;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                    const data = JSON.parse(line.slice(6));
                    const delta = data.choices?.[0]?.delta;
                    
                    // 处理思维链内容 (DeepSeek R1)
                    if (delta?.reasoning_content) {
                        if (!isThinking) {
                            fullContent += '> **深度思考中...**\n\n';
                            isThinking = true;
                        }
                        // 暂时不展示具体思考过程，或者可以选择展示
                        // fullContent += delta.reasoning_content; 
                    } else if (delta?.content) {
                        fullContent += delta.content;
                        updateStreamingMessage(msgEl, fullContent);
                    }
                } catch (e) {}
            }
        }
    }

    finalizeStreamingMessage(msgEl);
    return fullContent;
}
