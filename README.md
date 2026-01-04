# Md2Img 📋 → 🖼️

> 一键将剪贴板中的 Markdown 转换为精美图片

![Platform](https://img.shields.io/badge/platform-macOS%20|%20Windows%20|%20Linux-blue)
![Electron](https://img.shields.io/badge/electron-28+-green)
![License](https://img.shields.io/badge/license-MIT-orange)

一个轻量级的系统托盘应用，按下快捷键即可将 Markdown 文本渲染成高质量图片，方便在社交媒体、聊天工具中分享代码和格式化内容。

## ✨ 特性

- 🚀 **一键转换** - `Cmd+Shift+M` 快捷键，即按即用
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

1. **复制** - 选中任意 Markdown 文本，`Cmd+C` 复制
2. **转换** - 按下 `Cmd+Shift+M`（Mac）或 `Ctrl+Shift+M`（Windows/Linux）
3. **粘贴** - 收到通知后，`Cmd+V` 粘贴图片到任意位置

### 托盘菜单

点击菜单栏的 **Md** 图标：

| 选项 | 说明 |
|------|------|
| Convert Clipboard to Image | 手动转换当前剪贴板内容 |
| Start at Login | 开启/关闭开机自启动 |
| Show Debug Window | 显示渲染窗口（调试用） |
| Quit | 退出应用 |

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
├── main.js              # 主进程：托盘、快捷键、窗口管理
├── preload.js           # 预加载脚本
├── renderer-template.html   # 渲染模板：Markdown 样式
├── icon.png             # 托盘图标
└── package.json
```

### 技术栈

- **Electron** - 跨平台桌面应用框架
- **marked.js** - Markdown 解析器
- **highlight.js** - 代码语法高亮

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

- macOS 需要在 **系统偏好设置 → 安全性与隐私 → 隐私 → 辅助功能** 中授权
- 检查快捷键是否被其他应用占用
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

## 📄 License

MIT © 2024

---

**喜欢这个项目？** 给个 ⭐ Star 支持一下！
