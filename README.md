# Md2Img 📋 → 🖼️

> Markdown 转图片 + AI 语法修正 + AI 翻译，一键搞定

![Platform](https://img.shields.io/badge/platform-macOS%20|%20Windows%20|%20Linux-blue)
![Electron](https://img.shields.io/badge/electron-28+-green)
![License](https://img.shields.io/badge/license-MIT-orange)

一个轻量级的系统托盘应用，提供三大核心功能：Markdown 转图片、AI 语法修正、AI 翻译。选中文字按快捷键即可使用。

## ✨ 特性

- 🖼️ **Markdown 转图片** - `Cmd+Shift+M` 将剪贴板 Markdown 渲染为精美图片
- ✏️ **AI 语法修正** - `Cmd+Shift+G` 选中文字一键修正语法，附带翻译对照
- 🌐 **AI 翻译** - `Cmd+Shift+T` 选中文字一键中英互译
- 🎨 **精美渲染** - GitHub Dark Dimmed 主题 + Carbon 风格容器
- 📦 **托盘运行** - 无 Dock 图标，安静驻留后台
- 🔄 **开机自启** - 可选的登录启动功能
- 🌏 **中文支持** - 完美支持中英文混排

## 📸 效果预览

转换后的图片效果：

- 支持标题、列表、代码块、表格等 Markdown 语法
- 代码高亮（支持多种编程语言）
- 自适应内容宽度，自动裁剪

## 🚀 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/yourusername/md_to_img.git
cd md_to_img

# 安装依赖
npm install

# 启动应用
npm start
```

### 使用方法

#### 🖼️ Markdown 转图片
1. 复制 Markdown 文本到剪贴板（`Cmd+C`）
2. 按下 `Cmd+Shift+M`
3. 收到通知后，`Cmd+V` 粘贴图片

#### ✏️ AI 语法修正
1. 用鼠标**选中**需要修正的文字（高亮状态）
2. 按下 `Cmd+Shift+G`
3. 弹出对话框显示原文、修正后文本及翻译对照
4. 点击「使用修正版本」自动替换原文

#### 🌐 AI 翻译
1. 用鼠标**选中**需要翻译的文字
2. 按下 `Cmd+Shift+T`
3. 自动检测语言：中文 → 英文，英文 → 中文
4. 选择「仅复制」或「替换原文」

### 快捷键一览

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Cmd+Shift+M` | Markdown 转图片 | 将剪贴板内容转为图片 |
| `Cmd+Shift+G` | AI 语法修正 | 修正选中文字的语法，带翻译对照 |
| `Cmd+Shift+T` | AI 翻译 | 中英互译选中的文字 |

> Windows/Linux 用户请将 `Cmd` 替换为 `Ctrl`

### 托盘菜单

点击菜单栏的 **Md** 图标：

| 选项 | 说明 |
|------|------|
| Convert Clipboard to Image | Markdown 转图片 |
| Grammar Correction (AI) | AI 语法修正 |
| Translate (AI) | AI 翻译 |
| Start at Login | 开启/关闭开机自启动 |
| Settings... | 配置 SiliconFlow API Key |
| Show Debug Window | 显示渲染窗口（调试用） |
| Quit | 退出应用 |

### API 配置

AI 语法修正和翻译功能需要配置 SiliconFlow API：

1. 访问 [SiliconFlow](https://cloud.siliconflow.cn/) 注册并获取 API Key
2. 点击托盘图标 → **Settings...**
3. 输入 API Key 并选择模型
4. 保存即可使用

## ⚙️ 自定义配置

### 修改样式

编辑 `renderer-template.html` 可以自定义：

- 字体、字号
- 配色方案
- 代码高亮主题
- 容器圆角、阴影等

### 修改快捷键

在 `main.js` 中找到 `registerGlobalShortcut()` 函数，修改：

```javascript
const shortcut = 'CommandOrControl+Shift+M';  // 改成你想要的快捷键
```

## 🛠️ 开发

### 项目结构

```
md_to_img/
├── main.js                  # 主进程：托盘、快捷键、窗口管理、API 调用
├── preload.js               # 预加载脚本（Markdown 渲染）
├── preload-grammar.js       # 预加载脚本（语法修正对话框）
├── preload-translate.js     # 预加载脚本（翻译对话框）
├── preload-settings.js      # 预加载脚本（设置窗口）
├── renderer-template.html   # 渲染模板：Markdown 样式
├── icon.png                 # 托盘图标
└── package.json
```

### 技术栈

- **Electron** - 跨平台桌面应用框架
- **marked.js** - Markdown 解析器
- **highlight.js** - 代码语法高亮
- **SiliconFlow API** - AI 语法修正与翻译服务

### 调试

```bash
# 启动并查看控制台日志
npm start

# 查看渲染窗口
# 右键托盘图标 → Show Debug Window
```

## ❓ 常见问题

<details>
<summary><b>快捷键没反应？</b></summary>

- macOS 需要在 **系统设置 → 隐私与安全性 → 辅助功能** 中授权应用
- 检查快捷键是否被其他应用占用
- 重启应用后重试
</details>

<details>
<summary><b>AI 功能提示「没有选中文本」？</b></summary>

- 确保用鼠标**拖选**文字（文字需要高亮显示）
- 需要在辅助功能中授权应用模拟键盘操作
</details>

<details>
<summary><b>AI 功能提示「请先配置 API Key」？</b></summary>

- 点击托盘图标 → Settings...
- 输入你的 SiliconFlow API Key
- 在 [SiliconFlow](https://cloud.siliconflow.cn/) 免费注册获取
</details>

<details>
<summary><b>看不到托盘图标？</b></summary>

- macOS：检查菜单栏是否有足够空间
- 尝试重启应用
</details>

<details>
<summary><b>转换后的图片是空的？</b></summary>

- 确保剪贴板中有文本内容
- 右键托盘 → Show Debug Window 查看渲染情况
</details>

<details>
<summary><b>macOS 提示应用「已损坏」或「恶意软件」？</b></summary>

运行以下命令移除隔离属性：
```bash
xattr -cr /path/to/Md2Img.app
```
</details>

## 📄 License

MIT © 2024

---

**喜欢这个项目？** 给个 ⭐ Star 支持一下！
