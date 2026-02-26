# Node Runner Pro 🚀

一个专为极致开发效率打造的 VS Code 脚本运行插件。支持 Node.js、TypeScript 和 Python，告别繁琐的终端输入，一键右键即可优雅运行代码。

## ✨ 核心特性 (Features)

* **🌐 多语言无缝支持**：自动识别 `.js`, `.mjs`, `.ts`, `.py` 文件，智能调用底层的 `node`, `tsx`, `python` 环境。
* **✂️ 局部试运行 (Smart Snippet Run)**：鼠标高亮任意一段代码，右键即可单独运行！
    * 支持多光标（Multi-cursor）碎片代码组合。
    * 智能整行扩充，拒绝“半截子代码”引发的语法错误。
    * **ESM 智能嗅探**：自动识别 `import`/`export` 语法并以 `.mjs` 模式运行，告别 CommonJS 报错。
* **💉 环境变量静默注入**：自动寻找当前工作区根目录的 `.env` 文件，运行脚本前自动将变量注入进程，完全不弄脏系统环境。
* **🎛️ 魔法注释与动态参数 (Magic Arguments)**：脚本需要传参？只需在代码顶部写一行注释，右键运行时自动弹出优雅的下拉选择框。
* **🖨️ 专属输出通道 (Output Channel)**：彻底告别黑框弹窗和终端污染！运行结果实时流式输出至底部专属面板，并自动统计**执行耗时**。
* **🛑 进程树强杀 (Process Tree Kill)**：告别失控的死循环和 `setInterval` 僵尸进程。点击右上角停止按钮，连根拔起清理后台进程。

---

## 💡 使用指南 (Usage)

### 1. 基础运行
在资源管理器或代码编辑区，**右键**点击代码，选择：
* 🚀 `运行脚本`：运行当前完整文件。
* ✂️ `运行选中的片段`：仅运行鼠标高亮选中的代码。

### 2. 动态参数配置 (魔法注释)
在你的脚本文件最顶部添加 `// @runner-args: [...]`（Python 使用 `#`），即可启用动态参数选择框。

**支持简单字符串模式：**
```javascript
// @runner-args: ["--env dev", "--env prod", "--id 1001 --debug"]

console.log("启动参数:", process.argv.slice(2));
```
**支持高级键值对模式（带中文菜单）：**
```javascript

# @runner-args: [{"label": "🚀 抓取正式服", "value": "--mode prod"}, {"label": "🐛 抓取测试服", "value": "--mode test"}]

import sys
print("运行模式:", sys.argv[1:])
```