const { app, BrowserWindow, Tray, Menu, clipboard, nativeImage, Notification, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;
let renderWindow = null;
let lastProcessedText = '';
let lastProcessedHash = '';
let isProcessing = false;

// Prevent dock icon from showing on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

// 获取开机自启动状态
function getAutoLaunch() {
  return app.getLoginItemSettings().openAtLogin;
}

// 设置开机自启动
function setAutoLaunch(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,  // 隐藏启动（托盘模式）
  });
  console.log('Auto launch:', enable ? 'enabled' : 'disabled');
}

app.whenReady().then(() => {
  createTray();
  registerGlobalShortcut();
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
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Convert Clipboard to Image',
      accelerator: shortcutKey,
      click: () => {
        convertClipboardToImage();
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
  
  tray.setToolTip(`Markdown to Image Service\nPress ${shortcutKey} to convert`);
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

