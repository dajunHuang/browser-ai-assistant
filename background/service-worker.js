// Background Service Worker
// 处理消息传递和侧边栏管理

// 当扩展安装或更新时
chrome.runtime.onInstalled.addListener(() => {
  // 创建右键菜单 - 选中文本
  chrome.contextMenus.create({
    id: 'send-to-llm',
    title: '发送选中文本到 LLM 助手',
    contexts: ['selection']
  });
  
  // 创建右键菜单 - 图片
  chrome.contextMenus.create({
    id: 'send-image-to-llm',
    title: '发送图片到 LLM 助手',
    contexts: ['image']
  });
});

// 检测 URL 是否为特殊文件（PDF、本地文件等）
function isSpecialPage(url) {
  if (!url) return true;
  
  // 检查是否为特殊协议
  if (url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('file://') ||
      url.startsWith('view-source:') ||
      url.startsWith('devtools://')) {
    return true;
  }
  
  // 检查是否为 PDF 文件
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    if (pathname.endsWith('.pdf')) {
      return true;
    }
  } catch (e) {
    return true;
  }
  
  return false;
}

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'send-to-llm' && info.selectionText) {
    // 打开侧边栏
    chrome.sidePanel.open({ tabId: tab.id });
    
    // 等待侧边栏打开后发送消息
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'SELECTED_TEXT',
        text: info.selectionText
      });
    }, 500);
  }
  
  if (info.menuItemId === 'send-image-to-llm' && info.srcUrl) {
    // 打开侧边栏
    chrome.sidePanel.open({ tabId: tab.id });
    
    // 获取图片并转换为 base64
    fetchImageAsBase64(info.srcUrl).then(imageData => {
      if (imageData) {
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: 'IMAGE_FROM_PAGE',
            imageData: imageData
          });
        }, 500);
      }
    });
  }
});

// 获取图片并转换为 base64
async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          base64: reader.result,
          mimeType: blob.type || 'image/png',
          name: url.split('/').pop().split('?')[0] || 'image'
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('获取图片失败:', error);
    return null;
  }
}

// 监听来自 content script 和 sidepanel 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'OPEN_SIDEPANEL':
      if (sender.tab) {
        chrome.sidePanel.open({ tabId: sender.tab.id });
      }
      break;
      
    case 'SEND_TO_SIDEPANEL':
      // 转发选中文本到侧边栏
      chrome.runtime.sendMessage({
        type: 'SELECTED_TEXT',
        text: message.text
      });
      break;
    
    case 'PAGE_CONTEXT':
      // 转发页面上下文到侧边栏
      chrome.runtime.sendMessage({
        type: 'PAGE_CONTEXT',
        content: message.content,
        title: message.title,
        url: message.url
      });
      break;
    
    case 'SELECTION_CHANGED':
      // 转发选择变化到侧边栏
      chrome.runtime.sendMessage({
        type: 'SELECTION_CHANGED',
        text: message.text
      }).catch(() => {}); // 侧边栏可能未打开
      break;
    
    case 'TRIGGER_SEND':
      // 转发发送消息请求到侧边栏
      chrome.runtime.sendMessage({
        type: 'TRIGGER_SEND'
      }).catch(() => {}); // 侧边栏可能未打开
      break;
    
    case 'REQUEST_PAGE_CONTEXT':
      // 侧边栏请求页面上下文，转发给 content script
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]?.id) {
          try {
            await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_CONTEXT' });
          } catch (error) {
            // 通知侧边栏获取失败
            chrome.runtime.sendMessage({
              type: 'PAGE_CONTEXT_ERROR',
              error: error.message
            }).catch(() => {});
          }
        } else {
          // 没有活动标签页
          chrome.runtime.sendMessage({
            type: 'PAGE_CONTEXT_ERROR',
            error: '没有活动标签页'
          }).catch(() => {});
        }
      });
      break;
      
    case 'GET_CURRENT_TAB_SELECTION':
      // 获取当前标签页的选中文本
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]) {
          try {
            const response = await chrome.tabs.sendMessage(tabs[0].id, {
              type: 'GET_SELECTION'
            });
            sendResponse(response);
          } catch (error) {
            sendResponse({ text: '' });
          }
        }
      });
      return true; // 保持消息通道开放
    
    case 'CHECK_PAGE_STATUS':
      // 侧边栏请求检查当前页面状态
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const isSpecial = isSpecialPage(tabs[0].url);
          sendResponse({ 
            isSpecialPage: isSpecial, 
            url: tabs[0].url 
          });
        } else {
          sendResponse({ isSpecialPage: true, url: '' });
        }
      });
      return true; // 保持消息通道开放
  }
});

// 启用侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
