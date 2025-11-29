// Content Script - 监听网页上的文本选择和页面上下文
(function() {
  // 检测当前页面是否为 PDF
  function isPDFPage() {
    // 检查 URL 是否以 .pdf 结尾
    if (window.location.href.toLowerCase().endsWith('.pdf')) {
      return true;
    }
    // 检查 Content-Type（通过 embed 或 object 标签）
    const embedPdf = document.querySelector('embed[type="application/pdf"]');
    const objectPdf = document.querySelector('object[type="application/pdf"]');
    if (embedPdf || objectPdf) {
      return true;
    }
    // Chrome 内置 PDF 查看器的特征
    if (document.body && document.body.children.length === 1) {
      const child = document.body.children[0];
      if (child.tagName === 'EMBED' && child.type === 'application/pdf') {
        return true;
      }
    }
    // Firefox PDF.js 查看器
    if (document.getElementById('viewer') && document.querySelector('.pdfViewer')) {
      return true;
    }
    return false;
  }

  // 获取页面主要文本内容
  function getPageContent() {
    // 如果是 PDF 页面，返回提示信息
    if (isPDFPage()) {
      return '[当前页面是 PDF 文件，无法直接提取文本内容。如需分析 PDF，请使用上传功能将 PDF 文件发送给 AI。]';
    }
    
    // 尝试获取主要内容区域的多种选择器
    const mainSelectors = [
      'article',
      'main', 
      '[role="main"]',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.markdown-body',
      '.doc-content',
      '.documentation',
      '#content',
      '#main',
      '#article',
      '.page-content'
    ];
    
    let mainElement = null;
    let maxTextLength = 0;
    
    // 找到文本内容最多的主要区域
    for (const selector of mainSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const textLen = (el.innerText || '').length;
        if (textLen > maxTextLength) {
          maxTextLength = textLen;
          mainElement = el;
        }
      }
    }
    
    // 如果找不到主要内容区域或内容太少，使用 body
    const contentElement = (mainElement && maxTextLength > 500) ? mainElement : document.body;
    
    // 获取文本内容，排除脚本和样式
    const clone = contentElement.cloneNode(true);
    
    // 移除不需要的元素
    const removeSelectors = [
      'script', 'style', 'noscript', 'iframe', 
      'nav', 'header', 'footer', 'aside',
      '.sidebar', '.nav', '.navigation', '.menu',
      '.ad', '.ads', '.advertisement', '.advert',
      '.comments', '.comment-section',
      '.social-share', '.share-buttons',
      '.related-posts', '.recommended',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'
    ];
    removeSelectors.forEach(sel => {
      try {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      } catch (e) {}
    });
    
    // 提取文本并清理
    let text = clone.innerText || clone.textContent || '';
    
    // 清理多余空白，但保留合理的换行
    text = text
      .replace(/[ \t]+/g, ' ')           // 合并空格
      .replace(/\n{3,}/g, '\n\n')         // 最多保留两个换行
      .replace(/^\s+|\s+$/gm, '')         // 去除每行首尾空白
      .trim();
    
    return text;
  }

  // 监听来自 background script 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SELECTION') {
      sendResponse({ text: window.getSelection().toString().trim() });
    }
    if (message.type === 'GET_PAGE_CONTEXT') {
      // 发送页面上下文到侧边栏
      chrome.runtime.sendMessage({
        type: 'PAGE_CONTEXT',
        content: getPageContent(),
        title: document.title,
        url: window.location.href
      });
    }
  });

  // 监听选择变化，自动准备选中文本
  let selectionTimeout = null;
  document.addEventListener('selectionchange', () => {
    // 防抖处理
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : '';
      // 发送选择变化消息到侧边栏
      chrome.runtime.sendMessage({
        type: 'SELECTION_CHANGED',
        text: text
      }).catch(() => {}); // 忽略错误（侧边栏可能未打开）
    }, 300);
  });

  // 监听 Ctrl+Enter 快捷键发送消息
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      chrome.runtime.sendMessage({
        type: 'TRIGGER_SEND'
      }).catch(() => {}); // 忽略错误（侧边栏可能未打开）
    }
  });

  // 页面加载完成后自动发送上下文
  if (document.readyState === 'complete') {
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'PAGE_CONTEXT',
        content: getPageContent(),
        title: document.title,
        url: window.location.href
      });
    }, 1000);
  } else {
    window.addEventListener('load', () => {
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'PAGE_CONTEXT',
          content: getPageContent(),
          title: document.title,
          url: window.location.href
        });
      }, 1000);
    });
  }

  console.log('LLM 助手: Content script 已加载');
})();
