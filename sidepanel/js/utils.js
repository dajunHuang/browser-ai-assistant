// 工具函数

// HTML 转义
export function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 判断是否为文本文件
export function isTextFile(file) {
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

// 格式化内容 - 使用 marked 渲染 Markdown，KaTeX 渲染公式
export function formatContent(content) {
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

// 解析用户消息，提取选中文本和问题
export function parseUserMessage(content) {
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

// 从 base64 打开 PDF
export function openPdfFromBase64(base64Data) {
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

// 显示提示
export function showToast(message, type = 'success') {
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
