const { app, BrowserWindow, Tray, Menu, clipboard, nativeImage, Notification, globalShortcut, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');

let tray = null;
let renderWindow = null;
let grammarWindow = null;
let settingsWindow = null;
let lastProcessedText = '';
let lastProcessedHash = '';
let isProcessing = false;
let isGrammarProcessing = false;
let isTranslateProcessing = false;
let translateWindow = null;

// SiliconFlow API 配置
const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const DEFAULT_MODEL = 'Qwen/Qwen2.5-7B-Instruct';

// 配置文件路径
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// 读取配置
function loadConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return {
    apiKey: '',
    model: DEFAULT_MODEL
  };
}

// 保存配置
function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log('Config saved to:', configPath);
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

// 获取 API Key
function getApiKey() {
  const config = loadConfig();
  return config.apiKey || process.env.SILICONFLOW_API_KEY || '';
}

// 获取模型
function getModel() {
  const config = loadConfig();
  return config.model || DEFAULT_MODEL;
}

// Prevent dock icon from showing on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

// 获取开机自启动状态
function getAutoLaunch() {
  const settings = app.getLoginItemSettings();
  console.log('Login item settings:', settings);
  return settings.openAtLogin;
}

// 设置开机自启动
function setAutoLaunch(enable) {
  // 获取应用路径
  const appPath = process.platform === 'darwin' 
    ? app.getPath('exe').replace(/\.app\/Contents\/MacOS\/.*$/, '.app')
    : app.getPath('exe');
  
  console.log('Setting auto launch:', enable);
  console.log('App path:', appPath);
  
  const settings = {
    openAtLogin: enable,
    openAsHidden: true,  // 隐藏启动（托盘模式）
    path: appPath,
  };
  
  // macOS 特殊处理
  if (process.platform === 'darwin') {
    settings.name = 'Md2Img';
  }
  
  app.setLoginItemSettings(settings);
  
  // 验证设置
  const newSettings = app.getLoginItemSettings();
  console.log('Auto launch set to:', newSettings.openAtLogin);
}

app.whenReady().then(() => {
  createTray();
  registerGlobalShortcut();
  registerGrammarShortcut();
  registerTranslateShortcut();
  setupIpcHandlers();
  // Auto-detection disabled - use shortcut instead
  // startClipboardWatcher();
  
  console.log('App ready. Auto launch:', getAutoLaunch() ? 'ON' : 'OFF');
});

app.on('window-all-closed', (e) => {
  // Prevent app from closing when windows are closed
  e.preventDefault();
});

app.on('before-quit', () => {
  if (renderWindow) {
    renderWindow.destroy();
  }
});

function createTray() {
  console.log('=== Creating Tray ===');
  
  // Create tray icon
  const iconPath = path.join(__dirname, 'icon.png');
  console.log('Icon path:', iconPath);
  console.log('Icon exists:', fs.existsSync(iconPath));
  
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    console.log('Loading icon from file...');
    trayIcon = nativeImage.createFromPath(iconPath);
    console.log('Icon loaded, isEmpty:', trayIcon.isEmpty());
    console.log('Icon size:', trayIcon.getSize());
  } else {
    console.log('Using fallback base64 icon...');
    // Create a simple "M" icon for Markdown (16x16 PNG, base64)
    // This is a simple dark "M" icon that works as a template image
    const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABzSURBVDiNY2AYBaNgGAAmJP7/////MzAwMPxnYGD4z4CF/v///38GBgaG/0xoiv8zMDAwsCDx/zMwMDAwMqPJ/2dgYGBgxqH4PwMDA0a4MDIyMjAyMv5nRDKAkYn5/39GJkZGBkZGJoYhFROjbUgDAOQ+InWXsTS2AAAAAElFTkSuQmCC';
    trayIcon = nativeImage.createFromDataURL('data:image/png;base64,' + iconBase64);
  }
  
  // Resize for menu bar (macOS prefers 16x16 or 22x22)
  trayIcon = trayIcon.resize({ width: 16, height: 16 });
  console.log('After resize, isEmpty:', trayIcon.isEmpty());
  console.log('After resize, size:', trayIcon.getSize());
  
  // On macOS, set as template image for proper menu bar styling
  // Template images should be black with transparency - macOS will handle colors
  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true);
    console.log('Set as template image for macOS');
  }
  
  try {
    tray = new Tray(trayIcon);
    console.log('✅ Tray created successfully');
  } catch (err) {
    console.error('❌ Failed to create tray:', err);
    return;
  }
  
  const shortcutKey = process.platform === 'darwin' ? 'Cmd+Shift+M' : 'Ctrl+Shift+M';
  const grammarShortcutKey = process.platform === 'darwin' ? 'Cmd+Shift+G' : 'Ctrl+Shift+G';
  const translateShortcutKey = process.platform === 'darwin' ? 'Cmd+Shift+T' : 'Ctrl+Shift+T';
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Convert Clipboard to Image',
      accelerator: shortcutKey,
      click: () => {
        convertClipboardToImage();
      }
    },
    {
      label: 'Grammar Correction (AI)',
      accelerator: grammarShortcutKey,
      click: () => {
        correctGrammar();
      }
    },
    {
      label: 'Translate (AI)',
      accelerator: translateShortcutKey,
      click: () => {
        translateText();
      }
    },
    { type: 'separator' },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: getAutoLaunch(),
      click: (menuItem) => {
        setAutoLaunch(menuItem.checked);
        if (Notification.isSupported()) {
          new Notification({
            title: menuItem.checked ? '✅ Auto Start Enabled' : '❌ Auto Start Disabled',
            body: menuItem.checked ? 'App will start automatically at login' : 'Auto start disabled',
            silent: true
          }).show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Settings...',
      click: () => {
        showSettingsWindow();
      }
    },
    {
      label: 'Show Debug Window',
      click: () => {
        if (renderWindow) {
          renderWindow.show();
          renderWindow.webContents.openDevTools();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip(`Markdown to Image Service\n${shortcutKey}: Convert to Image\n${grammarShortcutKey}: Grammar Correction\n${translateShortcutKey}: Translate`);
  tray.setContextMenu(contextMenu);
}

function registerGlobalShortcut() {
  // Register global shortcut: Cmd+Shift+M (Mac) or Ctrl+Shift+M (Windows/Linux)
  const shortcut = 'CommandOrControl+Shift+M';
  
  console.log('Attempting to register shortcut:', shortcut);
  console.log('Platform:', process.platform);
  
  const ret = globalShortcut.register(shortcut, () => {
    console.log('=== SHORTCUT TRIGGERED ===');
    console.log('Global shortcut pressed:', shortcut);
    console.log('Calling convertClipboardToImage...');
    convertClipboardToImage().then(() => {
      console.log('convertClipboardToImage completed');
    }).catch(err => {
      console.error('convertClipboardToImage error:', err);
    });
  });

  if (!ret) {
    console.error('❌ Failed to register global shortcut:', shortcut);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Shortcut Registration Failed',
        body: `Could not register ${shortcut}. It may be in use by another app.`,
        silent: false
      }).show();
    }
  } else {
    console.log('✅ Global shortcut registered:', shortcut);
    // Verify it's actually registered
    const isRegistered = globalShortcut.isRegistered(shortcut);
    console.log('Verification - isRegistered:', isRegistered);
  }
  
  // Unregister all shortcuts when app quits
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}

// Duplicate function removed - see above

function isMarkdown(text) {
  if (!text || typeof text !== 'string') return false;
  
  // Check for common Markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/,           // Headers
    /\*\*.*\*\*/,         // Bold
    /\*.*\*/,             // Italic
    /`.*`/,               // Inline code
    /```[\s\S]*```/,      // Code blocks
    /^[-*+]\s/,           // Lists
    /^\d+\.\s/,           // Numbered lists
    /\[.*\]\(.*\)/,       // Links
    /!\[.*\]\(.*\)/,      // Images
    /^>\s/,               // Blockquotes
    /^---/,               // Horizontal rules
    /\|\s*\|/,            // Tables
  ];
  
  return markdownPatterns.some(pattern => pattern.test(text));
}

async function createRenderWindow() {
  // Always create a new window to avoid state issues
  if (renderWindow && !renderWindow.isDestroyed()) {
    console.log('Destroying old window');
    renderWindow.destroy();
    renderWindow = null;
  }
  
  console.log('Creating render window...');
  renderWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    // 不用 offscreen，改用普通隐藏窗口
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  
  console.log('renderMarkdownToImage: Render window created');
  
  // Handle window closed
  renderWindow.on('closed', () => {
    console.log('renderMarkdownToImage: Window closed');
    renderWindow = null;
  });
  
  return renderWindow;
}

async function renderMarkdownToImage(markdownText) {
  try {
    console.log('renderMarkdownToImage: Starting...');
    const win = await createRenderWindow();
    console.log('renderMarkdownToImage: Window created');
    
    // Load marked.js from node_modules (prefer minified)
    console.log('renderMarkdownToImage: Loading marked.js...');
    const markedMinPath = path.join(__dirname, 'node_modules', 'marked', 'marked.min.js');
    const markedPath = path.join(__dirname, 'node_modules', 'marked', 'lib', 'marked.umd.js');
    let markedScript = '';
    
    if (fs.existsSync(markedMinPath)) {
      markedScript = fs.readFileSync(markedMinPath, 'utf-8');
      console.log('Loaded marked.min.js, size:', markedScript.length);
    } else if (fs.existsSync(markedPath)) {
      markedScript = fs.readFileSync(markedPath, 'utf-8');
      console.log('Loaded marked.umd.js, size:', markedScript.length);
    } else {
      throw new Error('Could not find marked.js in node_modules. Please run: npm install');
    }
    
    // Load the HTML template
    const htmlTemplate = fs.readFileSync(
      path.join(__dirname, 'renderer-template.html'),
      'utf-8'
    );
    
    // Inject the markdown and marked.js into the template
    // Use JSON.stringify to properly escape the markdown text
    const base64Markdown = Buffer.from(markdownText, 'utf-8').toString('base64');
    let html = htmlTemplate.replace('{{MARKDOWN_CONTENT}}', base64Markdown);
    html = html.replace('{{MARKED_SCRIPT}}', markedScript);
    
    // Ensure UTF-8 encoding in the HTML
    if (!html.includes('charset=utf-8')) {
      html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">');
    }
    
    // Load the HTML
    console.log('renderMarkdownToImage: Loading HTML into render window...');
    console.log('renderMarkdownToImage: HTML size:', html.length);
    console.log('renderMarkdownToImage: Markdown preview:', markdownText.substring(0, 50));
    
    // Use a promise to handle loadURL
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('loadURL timeout after 5 seconds'));
      }, 5000);
      
      win.webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        console.log('renderMarkdownToImage: Page did-finish-load event fired');
        resolve();
      });
      
      win.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to load page: ${errorCode} - ${errorDescription}`));
      });
      
      // Use data URL with proper UTF-8 encoding
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      win.loadURL(dataUrl).catch(reject);
    });
    
    console.log('renderMarkdownToImage: HTML loaded, waiting for rendering...');
    
    // Wait for the page to be fully rendered (with timeout)
    await new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds max
      let resolved = false;
      
      const checkReady = async () => {
        if (resolved) return;
        
        attempts++;
        if (attempts % 10 === 0) {
          console.log(`renderMarkdownToImage: Checking render status (attempt ${attempts}/${maxAttempts})...`);
        }
        
        if (attempts > maxAttempts) {
          resolved = true;
          console.error('renderMarkdownToImage: Timeout waiting for markdown to render');
          reject(new Error('Timeout waiting for markdown to render (10s)'));
          return;
        }
        
        try {
          // Check if page is loaded and marked is available
          const pageReady = await win.webContents.executeJavaScript(`
            (() => {
              try {
                return {
                  readyState: document.readyState,
                  markedLoaded: typeof marked !== 'undefined',
                  markdownRendered: window.markdownRendered === true,
                  containerExists: !!document.getElementById('markdown-container'),
                  contentExists: !!document.getElementById('markdown-content')
                };
              } catch (e) {
                return { error: e.message };
              }
            })()
          `);
          
          if (pageReady.error) {
            console.error('renderMarkdownToImage: Error in page check:', pageReady.error);
            setTimeout(checkReady, 100);
            return;
          }
          
          if (attempts % 10 === 0) {
            console.log('renderMarkdownToImage: Status:', pageReady);
          }
          
          if (pageReady.readyState === 'complete' && pageReady.markedLoaded) {
            if (pageReady.markdownRendered) {
              console.log('renderMarkdownToImage: Markdown rendered successfully!');
              resolved = true;
              setTimeout(resolve, 300); // Give time for styles to apply
              return;
            }
          }
          
          // Continue checking
          setTimeout(checkReady, 100);
        } catch (error) {
          console.error('renderMarkdownToImage: Error checking render status:', error);
          setTimeout(checkReady, 100);
        }
      };
      
      // Start checking after a short delay
      setTimeout(checkReady, 200);
    });
    
    // 1. 设置超大窗口确保内容完全展开
    console.log('Setting large window...');
    win.setSize(1200, 10000);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 2. 获取容器完整尺寸和 devicePixelRatio
    const dims = await win.webContents.executeJavaScript(`
      (() => {
        const c = document.getElementById('markdown-container');
        if (!c) return null;
        
        // 强制重排
        void c.offsetHeight;
        
        const rect = c.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        console.log('devicePixelRatio:', dpr);
        console.log('Container rect:', rect.x, rect.y, rect.width, rect.height);
        
        return {
          x: Math.floor(rect.x),
          y: Math.floor(rect.y),
          w: Math.ceil(rect.width),
          h: Math.ceil(rect.height),
          dpr: dpr
        };
      })()
    `);
    
    if (!dims) throw new Error('Container not found');
    console.log('Measured:', dims);
    
    // 3. 调整窗口大小
    const winW = dims.x + dims.w + 100;
    const winH = dims.y + dims.h + 100;
    console.log('Window:', winW, 'x', winH);
    win.setSize(winW, winH);
    await new Promise(resolve => setTimeout(resolve, 400));
    
    // 4. 再次测量（窗口调整后坐标可能变化）
    const final = await win.webContents.executeJavaScript(`
      (() => {
        const c = document.getElementById('markdown-container');
        const rect = c.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return {
          x: Math.floor(rect.x),
          y: Math.floor(rect.y),
          w: Math.ceil(rect.width),
          h: Math.ceil(rect.height),
          dpr: dpr
        };
      })()
    `);
    console.log('Final:', final);
    
    // 5. 截图
    const img = await win.webContents.capturePage();
    const imgSize = img.getSize();
    console.log('Image:', imgSize.width, 'x', imgSize.height);
    
    // 6. 裁剪 - 需要乘以 devicePixelRatio！
    const dpr = final.dpr;
    const x = Math.floor(final.x * dpr);
    const y = Math.floor(final.y * dpr);
    const w = Math.ceil(final.w * dpr);
    const h = Math.ceil(final.h * dpr);
    
    // 确保不超出图片边界
    const cropX = Math.max(0, Math.min(x, imgSize.width - 1));
    const cropY = Math.max(0, Math.min(y, imgSize.height - 1));
    const cropW = Math.min(w, imgSize.width - cropX);
    const cropH = Math.min(h, imgSize.height - cropY);
    
    console.log('DPR:', dpr);
    console.log('Crop (device pixels):', cropX, cropY, cropW, cropH);
    
    const cropped = img.crop({ x: cropX, y: cropY, width: cropW, height: cropH });
    console.log('✅ Done, cropped size:', cropped.getSize());
    
    return cropped;
  } catch (error) {
    console.error('Error rendering markdown:', error);
    throw error;
  }
}

// Simple hash function for text
function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

// New function: Convert clipboard to image (triggered by shortcut)
async function convertClipboardToImage() {
  console.log('=== convertClipboardToImage START ===');
  console.log('isProcessing:', isProcessing);
  
  if (isProcessing) {
    console.log('Already processing, skipping...');
    if (Notification.isSupported()) {
      new Notification({
        title: 'Already Processing',
        body: 'Please wait for the current conversion to complete.',
        silent: false
      }).show();
    }
    return;
  }
  
  try {
    console.log('Reading clipboard text...');
    const clipboardText = clipboard.readText();
    console.log('Clipboard text length:', clipboardText ? clipboardText.length : 0);
    
    // Check if empty
    if (!clipboardText || clipboardText.trim().length === 0) {
      if (Notification.isSupported()) {
        new Notification({
          title: 'Empty Clipboard',
          body: 'Clipboard is empty. Please copy some text first.',
          silent: false
        }).show();
      }
      console.log('Clipboard is empty');
      return;
    }
    
    // Check if it's markdown (optional, but warn if not)
    if (!isMarkdown(clipboardText)) {
      console.log('Clipboard content does not appear to be Markdown, but proceeding anyway...');
      // Still proceed, user might want to convert anyway
    }
    
    isProcessing = true;
    console.log('Converting clipboard to image...');
    console.log('Content preview:', clipboardText.substring(0, 100) + '...');
    
    // Render markdown to image (with timeout wrapper)
    let image;
    try {
      image = await Promise.race([
        renderMarkdownToImage(clipboardText),
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Render timeout after 15 seconds'));
          }, 15000);
        })
      ]);
      console.log('renderMarkdownToImage completed successfully');
    } catch (renderError) {
      console.error('Render error:', renderError);
      throw renderError;
    }
    
    if (!image || image.isEmpty()) {
      throw new Error('Failed to capture image');
    }
    
    console.log('Image captured, size:', image.getSize());
    
    // Write image to clipboard
    clipboard.writeImage(image);
    
    // Verify image was written to clipboard
    const clipboardImage = clipboard.readImage();
    if (clipboardImage && !clipboardImage.isEmpty()) {
      console.log('Image successfully written to clipboard, size:', clipboardImage.getSize());
    } else {
      console.warn('Warning: Image may not have been written to clipboard correctly');
    }
    
    // Show notification
    if (Notification.isSupported()) {
      new Notification({
        title: '✅ Converted!',
        body: 'Markdown converted to Image! Ready to paste.',
        silent: false
      }).show();
    }
    
    console.log('✅ Markdown converted to image and copied to clipboard - Ready to paste!');
    console.log('=== convertClipboardToImage SUCCESS ===');
    
  } catch (error) {
    console.error('=== convertClipboardToImage ERROR ===');
    console.error('Error converting clipboard:', error);
    console.error('Stack:', error.stack);
    
    // Show error notification
    if (Notification.isSupported()) {
      new Notification({
        title: 'Conversion Error',
        body: 'Failed to convert: ' + error.message,
        silent: false
      }).show();
    }
  } finally {
    isProcessing = false;
    console.log('=== convertClipboardToImage END ===');
  }
}

// Keep the old function for automatic detection (optional, currently disabled)
async function processClipboard() {
  if (isProcessing) {
    console.log('Already processing, skipping...');
    return;
  }
  
  try {
    // Check if clipboard has image (skip if it's an image we just wrote)
    const hasImage = clipboard.readImage();
    if (hasImage && !hasImage.isEmpty()) {
      // If we just processed something, this might be our image
      // Skip processing images
      return;
    }
    
    const clipboardText = clipboard.readText();
    
    // Skip if empty
    if (!clipboardText || clipboardText.trim().length === 0) {
      return;
    }
    
    // Check if it's markdown
    if (!isMarkdown(clipboardText)) {
      return;
    }
    
    // Check if this is new content (using hash for efficiency)
    const currentHash = hashText(clipboardText);
    if (currentHash === lastProcessedHash) {
      // Same content, skip
      return;
    }
    
    // Debug: log what we see
    console.log('New markdown detected:', clipboardText.substring(0, 100) + '...');
    console.log('Content hash:', currentHash);
    
    isProcessing = true;
    lastProcessedText = clipboardText;
    lastProcessedHash = currentHash;
    
    console.log('Processing markdown:', clipboardText.substring(0, 50) + '...');
    console.log('About to call renderMarkdownToImage...');
    
    // Render markdown to image (with timeout wrapper)
    let image;
    try {
      console.log('Calling renderMarkdownToImage with timeout wrapper...');
      image = await Promise.race([
        renderMarkdownToImage(clipboardText),
        new Promise((_, reject) => {
          console.log('Setting up 15 second timeout...');
          setTimeout(() => {
            console.error('Render timeout triggered after 15 seconds');
            reject(new Error('Render timeout after 15 seconds'));
          }, 15000);
        })
      ]);
      console.log('renderMarkdownToImage completed successfully');
    } catch (renderError) {
      console.error('Render error:', renderError);
      console.error('Render error stack:', renderError.stack);
      throw renderError;
    }
    
    if (!image || image.isEmpty()) {
      throw new Error('Failed to capture image');
    }
    
    console.log('Image captured, size:', image.getSize());
    
    // Write image to clipboard
    clipboard.writeImage(image);
    
    // Verify image was written to clipboard
    const clipboardImage = clipboard.readImage();
    if (clipboardImage && !clipboardImage.isEmpty()) {
      console.log('Image successfully written to clipboard, size:', clipboardImage.getSize());
    } else {
      console.warn('Warning: Image may not have been written to clipboard correctly');
    }
    
    // Clear text tracking to allow detection of new markdown content
    // The hash will prevent re-processing the same content
    // But we need to clear lastProcessedText so clipboard.readText() won't match
    
    // Show notification
    if (Notification.isSupported()) {
      new Notification({
        title: 'Markdown Converted!',
        body: 'Markdown converted to Image! Ready to paste.',
        silent: false
      }).show();
    }
    
    console.log('✅ Markdown converted to image and copied to clipboard - Ready to paste!');
    
  } catch (error) {
    console.error('Error processing clipboard:', error);
    console.error('Stack:', error.stack);
    
    // Reset processing state on error so we can try again
    lastProcessedHash = '';
    
    // Show error notification
    if (Notification.isSupported()) {
      new Notification({
        title: 'Conversion Error',
        body: 'Failed to convert markdown: ' + error.message,
        silent: false
      }).show();
    }
  } finally {
    isProcessing = false;
  }
}

function startClipboardWatcher() {
  // Check clipboard every 1 second
  setInterval(() => {
    processClipboard();
  }, 1000);
  
  // Also check immediately
  processClipboard();
}

// ==================== 语法修正功能 ====================

// 模拟键盘操作 (macOS 使用 AppleScript)
function simulateKeyboard(key) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'darwin') {
      // macOS: 使用 AppleScript 模拟按键
      let script;
      if (key === 'copy') {
        script = 'tell application "System Events" to keystroke "c" using command down';
      } else if (key === 'paste') {
        script = 'tell application "System Events" to keystroke "v" using command down';
      } else {
        reject(new Error('Unknown key: ' + key));
        return;
      }
      
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          reject(error);
        } else {
          // 等待一下让系统处理
          setTimeout(resolve, 100);
        }
      });
    } else if (process.platform === 'win32') {
      // Windows: 使用 PowerShell
      let script;
      if (key === 'copy') {
        script = 'powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^c\')"';
      } else if (key === 'paste') {
        script = 'powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"';
      } else {
        reject(new Error('Unknown key: ' + key));
        return;
      }
      
      exec(script, (error) => {
        if (error) {
          reject(error);
        } else {
          setTimeout(resolve, 100);
        }
      });
    } else {
      // Linux: 使用 xdotool
      let script;
      if (key === 'copy') {
        script = 'xdotool key ctrl+c';
      } else if (key === 'paste') {
        script = 'xdotool key ctrl+v';
      } else {
        reject(new Error('Unknown key: ' + key));
        return;
      }
      
      exec(script, (error) => {
        if (error) {
          reject(error);
        } else {
          setTimeout(resolve, 100);
        }
      });
    }
  });
}

// 调用 SiliconFlow API
function callSiliconFlowAPI(text) {
  return new Promise((resolve, reject) => {
    const apiKey = getApiKey();
    const model = getModel();
    
    if (!apiKey) {
      reject(new Error('请先在设置中配置 SiliconFlow API Key'));
      return;
    }

    const requestBody = JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: `你是一个专业的语言润色助手。用户会给你一段文字，你需要：
1. 修正其中的语法错误，并给出更好、更自然的表达方式
2. 提供中英文对照翻译（如果原文是中文，翻译成英文；如果原文是英文，翻译成中文）

请严格按照以下 JSON 格式返回，不要有任何其他内容：
{
  "corrected": "修正后的文本（保持原文语言）",
  "original_translation": "原文的翻译",
  "corrected_translation": "修正后文本的翻译"
}`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.7,
      max_tokens: 2048
    });

    const url = new URL(SILICONFLOW_API_URL);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || 'API 返回错误'));
            return;
          }
          if (response.choices && response.choices[0] && response.choices[0].message) {
            const content = response.choices[0].message.content.trim();
            // 尝试解析 JSON 格式的响应
            try {
              // 移除可能的 markdown 代码块标记
              let jsonStr = content;
              if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.slice(7);
              } else if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.slice(3);
              }
              if (jsonStr.endsWith('```')) {
                jsonStr = jsonStr.slice(0, -3);
              }
              jsonStr = jsonStr.trim();
              
              const result = JSON.parse(jsonStr);
              resolve({
                corrected: result.corrected || content,
                originalTranslation: result.original_translation || '',
                correctedTranslation: result.corrected_translation || ''
              });
            } catch (parseErr) {
              // 如果解析失败，返回原始内容
              resolve({
                corrected: content,
                originalTranslation: '',
                correctedTranslation: ''
              });
            }
          } else {
            reject(new Error('API 返回格式不正确'));
          }
        } catch (e) {
          reject(new Error('解析 API 响应失败: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error('API 请求失败: ' + e.message));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('API 请求超时'));
    });

    req.write(requestBody);
    req.end();
  });
}

// 注册语法修正快捷键
function registerGrammarShortcut() {
  const shortcut = 'CommandOrControl+Shift+G';
  
  console.log('Attempting to register grammar shortcut:', shortcut);
  
  const ret = globalShortcut.register(shortcut, () => {
    console.log('=== GRAMMAR SHORTCUT TRIGGERED ===');
    correctGrammar().then(() => {
      console.log('correctGrammar completed');
    }).catch(err => {
      console.error('correctGrammar error:', err);
    });
  });

  if (!ret) {
    console.error('❌ Failed to register grammar shortcut:', shortcut);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Shortcut Registration Failed',
        body: `Could not register ${shortcut}. It may be in use by another app.`,
        silent: false
      }).show();
    }
  } else {
    console.log('✅ Grammar shortcut registered:', shortcut);
  }
}

// 设置 IPC 处理程序
function setupIpcHandlers() {
  ipcMain.on('grammar-confirm', (event, confirmed) => {
    if (grammarWindow && !grammarWindow.isDestroyed()) {
      grammarWindow.close();
    }
  });
  
  ipcMain.on('grammar-replace', async (event, newText) => {
    // 将修正后的文本写入剪贴板
    clipboard.writeText(newText);
    
    // 关闭对话框
    if (grammarWindow && !grammarWindow.isDestroyed()) {
      grammarWindow.close();
    }
    
    // 等待窗口关闭
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 自动粘贴替换选中的文本
    try {
      await simulateKeyboard('paste');
      
      if (Notification.isSupported()) {
        new Notification({
          title: '✅ 已替换',
          body: '选中的文本已被修正后的版本替换',
          silent: true
        }).show();
      }
    } catch (error) {
      console.error('Paste error:', error);
      if (Notification.isSupported()) {
        new Notification({
          title: '✅ 已复制到剪贴板',
          body: '自动粘贴失败，请手动粘贴 (Cmd+V)',
          silent: true
        }).show();
      }
    }
  });
  
  // 设置页面相关 IPC
  ipcMain.on('get-settings', (event) => {
    const config = loadConfig();
    event.reply('settings-data', config);
  });
  
  ipcMain.on('save-settings', (event, config) => {
    const success = saveConfig(config);
    event.reply('settings-saved', success);
    
    if (success && Notification.isSupported()) {
      new Notification({
        title: '✅ 设置已保存',
        body: 'API 配置已更新',
        silent: true
      }).show();
    }
  });
  
  ipcMain.on('close-settings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });
  
  // 翻译相关 IPC
  ipcMain.on('translate-cancel', () => {
    if (translateWindow && !translateWindow.isDestroyed()) {
      translateWindow.close();
    }
  });
  
  ipcMain.on('translate-copy', (event, text) => {
    clipboard.writeText(text);
    
    if (Notification.isSupported()) {
      new Notification({
        title: '✅ 已复制',
        body: '译文已复制到剪贴板',
        silent: true
      }).show();
    }
    
    if (translateWindow && !translateWindow.isDestroyed()) {
      translateWindow.close();
    }
  });
  
  ipcMain.on('translate-replace', async (event, text) => {
    clipboard.writeText(text);
    
    if (translateWindow && !translateWindow.isDestroyed()) {
      translateWindow.close();
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await simulateKeyboard('paste');
      
      if (Notification.isSupported()) {
        new Notification({
          title: '✅ 已替换',
          body: '原文已被译文替换',
          silent: true
        }).show();
      }
    } catch (error) {
      console.log('Auto paste not available:', error.message);
      if (Notification.isSupported()) {
        new Notification({
          title: '✅ 已复制到剪贴板',
          body: '请按 Cmd+V 粘贴译文',
          silent: true
        }).show();
      }
    }
  });
}

// 显示设置窗口
function showSettingsWindow() {
  // 如果窗口已存在，直接显示
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  
  settingsWindow = new BrowserWindow({
    width: 500,
    height: 400,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '设置',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  
  const config = loadConfig();
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>设置</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 30px;
      background: #f5f5f7;
      color: #1d1d1f;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 25px;
      color: #1d1d1f;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #86868b;
      margin-bottom: 8px;
    }
    input, select {
      width: 100%;
      padding: 12px;
      font-size: 14px;
      border: 1px solid #d2d2d7;
      border-radius: 8px;
      background: white;
      color: #1d1d1f;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus {
      border-color: #0071e3;
    }
    input::placeholder {
      color: #86868b;
    }
    .hint {
      font-size: 12px;
      color: #86868b;
      margin-top: 6px;
    }
    .hint a {
      color: #0071e3;
      text-decoration: none;
    }
    .buttons {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 30px;
    }
    button {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-cancel {
      background: #e8e8ed;
      border: none;
      color: #1d1d1f;
    }
    .btn-cancel:hover {
      background: #d2d2d7;
    }
    .btn-save {
      background: #0071e3;
      border: none;
      color: white;
    }
    .btn-save:hover {
      background: #0077ed;
    }
    .status {
      font-size: 13px;
      margin-top: 15px;
      padding: 10px;
      border-radius: 6px;
      display: none;
    }
    .status.success {
      display: block;
      background: #d4edda;
      color: #155724;
    }
    .status.error {
      display: block;
      background: #f8d7da;
      color: #721c24;
    }
  </style>
</head>
<body>
  <h2>⚙️ SiliconFlow API 设置</h2>
  
  <div class="form-group">
    <label>API Key</label>
    <input type="password" id="apiKey" placeholder="sk-xxxxxxxxxxxxxxxx" value="${config.apiKey || ''}">
    <div class="hint">在 <a href="#" onclick="openExternal('https://cloud.siliconflow.cn/')">SiliconFlow</a> 获取你的 API Key</div>
  </div>
  
  <div class="form-group">
    <label>模型</label>
    <select id="model">
      <option value="Qwen/Qwen2.5-7B-Instruct" ${config.model === 'Qwen/Qwen2.5-7B-Instruct' ? 'selected' : ''}>Qwen2.5-7B-Instruct (推荐)</option>
      <option value="Qwen/Qwen2.5-14B-Instruct" ${config.model === 'Qwen/Qwen2.5-14B-Instruct' ? 'selected' : ''}>Qwen2.5-14B-Instruct</option>
      <option value="Qwen/Qwen2.5-32B-Instruct" ${config.model === 'Qwen/Qwen2.5-32B-Instruct' ? 'selected' : ''}>Qwen2.5-32B-Instruct</option>
      <option value="deepseek-ai/DeepSeek-V2.5" ${config.model === 'deepseek-ai/DeepSeek-V2.5' ? 'selected' : ''}>DeepSeek-V2.5</option>
      <option value="THUDM/glm-4-9b-chat" ${config.model === 'THUDM/glm-4-9b-chat' ? 'selected' : ''}>GLM-4-9B-Chat</option>
    </select>
  </div>
  
  <div id="status" class="status"></div>
  
  <div class="buttons">
    <button class="btn-cancel" onclick="cancel()">取消</button>
    <button class="btn-save" onclick="save()">保存</button>
  </div>
  
  <script>
    function openExternal(url) {
      window.electronSettings.openExternal(url);
    }
    
    function cancel() {
      window.electronSettings.close();
    }
    
    function save() {
      const apiKey = document.getElementById('apiKey').value.trim();
      const model = document.getElementById('model').value;
      
      if (!apiKey) {
        showStatus('请输入 API Key', 'error');
        return;
      }
      
      window.electronSettings.save({ apiKey, model });
    }
    
    function showStatus(message, type) {
      const status = document.getElementById('status');
      status.textContent = message;
      status.className = 'status ' + type;
    }
    
    window.electronSettings.onSaved((success) => {
      if (success) {
        showStatus('设置已保存！', 'success');
        setTimeout(() => {
          window.electronSettings.close();
        }, 1000);
      } else {
        showStatus('保存失败，请重试', 'error');
      }
    });
  </script>
</body>
</html>
  `;
  
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
  
  settingsWindow.loadURL(dataUrl);
  settingsWindow.show();
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// 创建语法修正确认窗口
async function showGrammarConfirmDialog(originalText, result) {
  // 关闭之前的窗口
  if (grammarWindow && !grammarWindow.isDestroyed()) {
    grammarWindow.destroy();
  }
  
  const correctedText = result.corrected;
  const originalTranslation = result.originalTranslation || '';
  const correctedTranslation = result.correctedTranslation || '';
  
  grammarWindow = new BrowserWindow({
    width: 700,
    height: 650,
    show: false,
    alwaysOnTop: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-grammar.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  
  // 构建 HTML
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>语法修正</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 20px;
      background: #f5f5f7;
      color: #1d1d1f;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #1d1d1f;
    }
    .comparison {
      display: flex;
      gap: 15px;
      flex: 1;
      min-height: 0;
      margin-bottom: 15px;
    }
    .column {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .section {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin-bottom: 10px;
      min-height: 0;
    }
    .label {
      font-size: 13px;
      font-weight: 500;
      color: #86868b;
      margin-bottom: 6px;
    }
    .text-box {
      flex: 1;
      padding: 10px;
      background: white;
      border: 1px solid #d2d2d7;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.5;
      overflow-y: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .text-box.original {
      color: #86868b;
      background: #fafafa;
    }
    .text-box.corrected {
      color: #1d1d1f;
      background: #fff;
      border-color: #0071e3;
    }
    .text-box.translation {
      color: #555;
      background: #f0f7ff;
      border-color: #b3d4fc;
      font-size: 12px;
    }
    .column-header {
      font-size: 14px;
      font-weight: 600;
      color: #1d1d1f;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e8e8ed;
    }
    .column-header.corrected-header {
      border-bottom-color: #0071e3;
    }
    .buttons {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 10px;
      border-top: 1px solid #e8e8ed;
    }
    button {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-cancel {
      background: #e8e8ed;
      border: none;
      color: #1d1d1f;
    }
    .btn-cancel:hover {
      background: #d2d2d7;
    }
    .btn-confirm {
      background: #0071e3;
      border: none;
      color: white;
    }
    .btn-confirm:hover {
      background: #0077ed;
    }
  </style>
</head>
<body>
  <h2>🔤 语法修正建议</h2>
  
  <div class="comparison">
    <div class="column">
      <div class="column-header">原文</div>
      <div class="section">
        <div class="label">内容：</div>
        <div class="text-box original" id="original"></div>
      </div>
      <div class="section">
        <div class="label">翻译对照：</div>
        <div class="text-box translation" id="original-translation"></div>
      </div>
    </div>
    
    <div class="column">
      <div class="column-header corrected-header">✨ 修正后</div>
      <div class="section">
        <div class="label">内容：</div>
        <div class="text-box corrected" id="corrected"></div>
      </div>
      <div class="section">
        <div class="label">翻译对照：</div>
        <div class="text-box translation" id="corrected-translation"></div>
      </div>
    </div>
  </div>
  
  <div class="buttons">
    <button class="btn-cancel" onclick="cancel()">取消</button>
    <button class="btn-confirm" onclick="confirm()">使用修正版本</button>
  </div>
  
  <script>
    const originalText = decodeURIComponent(atob('${Buffer.from(encodeURIComponent(originalText)).toString('base64')}'));
    const correctedText = decodeURIComponent(atob('${Buffer.from(encodeURIComponent(correctedText)).toString('base64')}'));
    const originalTranslation = decodeURIComponent(atob('${Buffer.from(encodeURIComponent(originalTranslation)).toString('base64')}'));
    const correctedTranslation = decodeURIComponent(atob('${Buffer.from(encodeURIComponent(correctedTranslation)).toString('base64')}'));
    
    document.getElementById('original').textContent = originalText;
    document.getElementById('corrected').textContent = correctedText;
    document.getElementById('original-translation').textContent = originalTranslation || '(无翻译)';
    document.getElementById('corrected-translation').textContent = correctedTranslation || '(无翻译)';
    
    function cancel() {
      window.electronGrammar.cancel();
    }
    
    function confirm() {
      window.electronGrammar.replace(correctedText);
    }
  </script>
</body>
</html>
  `;
  
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
  
  await grammarWindow.loadURL(dataUrl);
  grammarWindow.show();
  grammarWindow.focus();
  
  // 窗口关闭时清理
  grammarWindow.on('closed', () => {
    grammarWindow = null;
  });
}

// 语法修正主函数
async function correctGrammar() {
  console.log('=== correctGrammar START ===');
  
  if (isGrammarProcessing) {
    console.log('Already processing grammar, skipping...');
    if (Notification.isSupported()) {
      new Notification({
        title: '处理中',
        body: '请等待当前处理完成',
        silent: true
      }).show();
    }
    return;
  }
  
  try {
    isGrammarProcessing = true;
    
    // 等待用户松开快捷键，避免焦点问题
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 保存当前剪贴板内容
    const originalClipboard = clipboard.readText();
    console.log('Original clipboard:', originalClipboard ? originalClipboard.substring(0, 50) + '...' : '(empty)');
    
    // 清空剪贴板，以便检测复制是否成功
    clipboard.writeText('');
    
    // 模拟 Cmd+C / Ctrl+C 复制选中的文本
    console.log('Simulating copy command...');
    await simulateKeyboard('copy');
    
    // 等待剪贴板更新（增加等待时间）
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 读取剪贴板中选中的文本
    const selectedText = clipboard.readText();
    console.log('After copy, clipboard:', selectedText ? selectedText.substring(0, 50) + '...' : '(empty)');
    
    if (!selectedText || selectedText.trim().length === 0) {
      console.log('No text selected, showing notification...');
      // 恢复原来的剪贴板内容
      if (originalClipboard) {
        clipboard.writeText(originalClipboard);
      }
      
      new Notification({
        title: '没有选中文本',
        body: '请先用鼠标拖选文字（使其高亮），再按快捷键',
        silent: false
      }).show();
      console.log('Notification shown');
      return;
    }
    
    console.log('Selected text:', selectedText.substring(0, 100) + '...');
    
    // 显示处理中通知
    new Notification({
      title: '🔄 正在处理...',
      body: '正在调用 AI 修正语法，请稍候',
      silent: true
    }).show();
    
    // 调用 API
    const result = await callSiliconFlowAPI(selectedText);
    
    console.log('Corrected text:', result.corrected.substring(0, 100) + '...');
    console.log('Original translation:', result.originalTranslation);
    console.log('Corrected translation:', result.correctedTranslation);
    
    // 显示确认对话框
    await showGrammarConfirmDialog(selectedText, result);
    
  } catch (error) {
    console.error('Grammar correction error:', error);
    
    if (Notification.isSupported()) {
      new Notification({
        title: '❌ 修正失败',
        body: error.message,
        silent: false
      }).show();
    }
  } finally {
    isGrammarProcessing = false;
    console.log('=== correctGrammar END ===');
  }
}

// ==================== 翻译功能 ====================

// 调用翻译 API
function callTranslateAPI(text) {
  return new Promise((resolve, reject) => {
    const apiKey = getApiKey();
    const model = getModel();
    
    if (!apiKey) {
      reject(new Error('请先在设置中配置 SiliconFlow API Key'));
      return;
    }

    const requestBody = JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: `你是一个专业的翻译助手。用户会给你一段文字，请翻译成另一种语言：
- 如果原文是中文，翻译成英文
- 如果原文是英文，翻译成中文
- 如果原文是其他语言，翻译成中文

只需要直接返回翻译后的文字，不需要任何解释、说明或其他额外内容。`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
      max_tokens: 2048
    });

    const url = new URL(SILICONFLOW_API_URL);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || 'API 返回错误'));
            return;
          }
          if (response.choices && response.choices[0] && response.choices[0].message) {
            resolve(response.choices[0].message.content.trim());
          } else {
            reject(new Error('API 返回格式不正确'));
          }
        } catch (e) {
          reject(new Error('解析 API 响应失败: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error('API 请求失败: ' + e.message));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('API 请求超时'));
    });

    req.write(requestBody);
    req.end();
  });
}

// 注册翻译快捷键
function registerTranslateShortcut() {
  const shortcut = 'CommandOrControl+Shift+T';
  
  console.log('Attempting to register translate shortcut:', shortcut);
  
  const ret = globalShortcut.register(shortcut, () => {
    console.log('=== TRANSLATE SHORTCUT TRIGGERED ===');
    translateText().then(() => {
      console.log('translateText completed');
    }).catch(err => {
      console.error('translateText error:', err);
    });
  });

  if (!ret) {
    console.error('❌ Failed to register translate shortcut:', shortcut);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Shortcut Registration Failed',
        body: `Could not register ${shortcut}. It may be in use by another app.`,
        silent: false
      }).show();
    }
  } else {
    console.log('✅ Translate shortcut registered:', shortcut);
  }
}

// 创建翻译结果窗口
async function showTranslateDialog(originalText, translatedText) {
  // 关闭之前的窗口
  if (translateWindow && !translateWindow.isDestroyed()) {
    translateWindow.destroy();
  }
  
  translateWindow = new BrowserWindow({
    width: 600,
    height: 450,
    show: false,
    alwaysOnTop: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-translate.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  
  // 构建 HTML
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>翻译</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 20px;
      background: #f5f5f7;
      color: #1d1d1f;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #1d1d1f;
    }
    .section {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin-bottom: 15px;
      min-height: 0;
    }
    .label {
      font-size: 13px;
      font-weight: 500;
      color: #86868b;
      margin-bottom: 8px;
    }
    .text-box {
      flex: 1;
      padding: 12px;
      background: white;
      border: 1px solid #d2d2d7;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.6;
      overflow-y: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .text-box.original {
      color: #86868b;
      background: #fafafa;
    }
    .text-box.translated {
      color: #1d1d1f;
      background: #fff;
      border-color: #34c759;
    }
    .buttons {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 10px;
    }
    button {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-cancel {
      background: #e8e8ed;
      border: none;
      color: #1d1d1f;
    }
    .btn-cancel:hover {
      background: #d2d2d7;
    }
    .btn-copy {
      background: #34c759;
      border: none;
      color: white;
    }
    .btn-copy:hover {
      background: #2db550;
    }
    .btn-replace {
      background: #0071e3;
      border: none;
      color: white;
    }
    .btn-replace:hover {
      background: #0077ed;
    }
  </style>
</head>
<body>
  <h2>🌐 翻译结果</h2>
  
  <div class="section">
    <div class="label">原文：</div>
    <div class="text-box original" id="original"></div>
  </div>
  
  <div class="section">
    <div class="label">译文：</div>
    <div class="text-box translated" id="translated"></div>
  </div>
  
  <div class="buttons">
    <button class="btn-cancel" onclick="cancel()">关闭</button>
    <button class="btn-copy" onclick="copyOnly()">仅复制</button>
    <button class="btn-replace" onclick="replace()">替换原文</button>
  </div>
  
  <script>
    const originalText = decodeURIComponent(atob('${Buffer.from(encodeURIComponent(originalText)).toString('base64')}'));
    const translatedText = decodeURIComponent(atob('${Buffer.from(encodeURIComponent(translatedText)).toString('base64')}'));
    
    document.getElementById('original').textContent = originalText;
    document.getElementById('translated').textContent = translatedText;
    
    function cancel() {
      window.electronTranslate.cancel();
    }
    
    function copyOnly() {
      window.electronTranslate.copy(translatedText);
    }
    
    function replace() {
      window.electronTranslate.replace(translatedText);
    }
  </script>
</body>
</html>
  `;
  
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
  
  await translateWindow.loadURL(dataUrl);
  translateWindow.show();
  translateWindow.focus();
  
  // 窗口关闭时清理
  translateWindow.on('closed', () => {
    translateWindow = null;
  });
}

// 翻译主函数
async function translateText() {
  console.log('=== translateText START ===');
  
  if (isTranslateProcessing) {
    console.log('Already processing translation, skipping...');
    if (Notification.isSupported()) {
      new Notification({
        title: '处理中',
        body: '请等待当前翻译完成',
        silent: true
      }).show();
    }
    return;
  }
  
  try {
    isTranslateProcessing = true;
    
    // 等待用户松开快捷键，避免焦点问题
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 保存当前剪贴板内容
    const originalClipboard = clipboard.readText();
    console.log('Original clipboard:', originalClipboard ? originalClipboard.substring(0, 50) + '...' : '(empty)');
    
    // 清空剪贴板，以便检测复制是否成功
    clipboard.writeText('');
    
    // 模拟 Cmd+C / Ctrl+C 复制选中的文本
    console.log('Simulating copy command...');
    await simulateKeyboard('copy');
    
    // 等待剪贴板更新（增加等待时间）
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 读取剪贴板中选中的文本
    const selectedText = clipboard.readText();
    console.log('After copy, clipboard:', selectedText ? selectedText.substring(0, 50) + '...' : '(empty)');
    
    if (!selectedText || selectedText.trim().length === 0) {
      console.log('No text selected, showing notification...');
      // 恢复原来的剪贴板内容
      if (originalClipboard) {
        clipboard.writeText(originalClipboard);
      }
      
      new Notification({
        title: '没有选中文本',
        body: '请先用鼠标拖选文字（使其高亮），再按快捷键',
        silent: false
      }).show();
      console.log('Notification shown');
      return;
    }
    
    console.log('Selected text:', selectedText.substring(0, 100) + '...');

    // 显示处理中通知
    new Notification({
      title: '🔄 正在翻译...',
      body: '正在调用 AI 翻译，请稍候',
      silent: true
    }).show();
    
    // 调用 API
    const translatedText = await callTranslateAPI(selectedText);
    
    console.log('Translated text:', translatedText.substring(0, 100) + '...');
    
    // 显示结果对话框
    await showTranslateDialog(selectedText, translatedText);
    
  } catch (error) {
    console.error('Translation error:', error);
    
    if (Notification.isSupported()) {
      new Notification({
        title: '❌ 翻译失败',
        body: error.message,
        silent: false
      }).show();
    }
  } finally {
    isTranslateProcessing = false;
    console.log('=== translateText END ===');
  }
}

