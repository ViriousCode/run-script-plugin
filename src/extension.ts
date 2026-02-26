import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as os from 'os';
import { spawn, ChildProcess, exec } from 'child_process'; // 🚨 新增了 exec

let outputChannel: vscode.OutputChannel;
let currentProcess: ChildProcess | undefined;

// 🚨 核心修复：跨平台的进程树强杀函数
function stopCurrentProcess() {
	if (currentProcess && currentProcess.pid) {
		if (os.platform() === 'win32') {
			// Windows: /T 杀掉进程树，/F 强制终止
			exec(`taskkill /pid ${currentProcess.pid} /T /F`);
		} else {
			// Mac/Linux 原生支持 kill 整个进程组（需要一点前置配置，这里用最简单的兼容写法）
			currentProcess.kill();
		}
		currentProcess = undefined;
		outputChannel.appendLine('\n🛑 [用户已强制终止进程]');
	}
}

export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('Node Runner 🚀');
	context.subscriptions.push(outputChannel);

	// 1. 运行文件
	let runDisposable = vscode.commands.registerCommand('node-runner.runScript', (uri: vscode.Uri) => {
		if (!uri || !uri.fsPath) return;
		executeScript(uri.fsPath, editor => vscode.workspace.getWorkspaceFolder(uri));
	});

	let runWithArgsDisposable = vscode.commands.registerCommand('node-runner.runWithArgs', async (uri: vscode.Uri) => {
		if (!uri || !uri.fsPath) return;

		let options: vscode.QuickPickItem[] = [];

		try {
			// 1. 读取文件内容（为了性能，只读取前 1000 个字符进行快速扫描）
			const fileContent = fs.readFileSync(uri.fsPath, 'utf-8').slice(0, 1000);

			// 2. 核心黑魔法：正则匹配魔法注释 @runner-args: [...]
			// 兼容 JS/TS 的 // 以及 Python 的 #
			const match = fileContent.match(/(?:\/\/|#)\s*@runner-args:\s*(\[.*\])/);

			if (match && match[1]) {
				const parsedOptions = JSON.parse(match[1]);

				// 3. 将解析出来的数组转换成 VS Code 要求的选择项格式
				options = parsedOptions.map((opt: any) => {
					if (typeof opt === 'string') {
						return { label: opt }; // 简单模式：["--env dev", "--env prod"]
					} else if (opt.label && opt.value) {
						return { label: opt.label, description: opt.value }; // 高级模式：带中文说明
					}
					return null;
				}).filter(Boolean);
			}
		} catch (error) {
			vscode.window.showErrorMessage('解析脚本参数配置失败，请检查 @runner-args 的 JSON 格式！');
			return;
		}

		// 4. 如果没找到配置，弹个提示，或者你可以把它降级回输入框
		if (options.length === 0) {
			vscode.window.showWarningMessage('未在脚本顶部找到有效的 @runner-args 配置！');
			return;
		}

		// 5. 唤起 VS Code 原生的下拉选择框
		const selected = await vscode.window.showQuickPick(options, {
			placeHolder: '请选择要运行的脚本参数 🖱️',
			ignoreFocusOut: true
		});

		// 如果用户按了 Esc 取消，直接中止
		if (!selected) return;

		// 提取最终要传递的参数字符串 (兼容简单模式和高级模式)
		const userArgsStr = selected.description || selected.label;

		// 将获取到的参数字符串传给 executeScript
		executeScript(uri.fsPath, editor => vscode.workspace.getWorkspaceFolder(uri), undefined, userArgsStr);
	});

	// 2. 局部运行
	let runSelectedDisposable = vscode.commands.registerCommand('node-runner.runSelectedScript', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const selections = editor.selections;
		const selectedText = selections.map(selection => {
			const startPos = new vscode.Position(selection.start.line, 0);
			const endLine = editor.document.lineAt(selection.end.line);
			return editor.document.getText(new vscode.Range(startPos, endLine.range.end));
		}).join('\n');

		if (!selectedText.trim()) return;

		const ext = path.extname(editor.document.uri.fsPath) || '.js';
		const tempFilePath = path.join(os.tmpdir(), `vscode_runner_temp${ext}`);
		fs.writeFileSync(tempFilePath, selectedText);
		executeScript(tempFilePath, () => vscode.workspace.getWorkspaceFolder(editor.document.uri), ext);
	});

	// 🚨 3. 新增：手动停止进程的命令
	let stopDisposable = vscode.commands.registerCommand('node-runner.stopScript', () => {
		if (currentProcess) {
			stopCurrentProcess();
		} else {
			vscode.window.showInformationMessage('当前没有正在运行的脚本。');
		}
	});

	context.subscriptions.push(runDisposable, runWithArgsDisposable, runSelectedDisposable, stopDisposable);
}

// 🚨 注意看第一行，末尾加上了 userArgsStr?: string
function executeScript(targetPath: string, getWorkspaceFolder: (editor: any) => vscode.WorkspaceFolder | undefined, fileExt?: string, userArgsStr?: string) {
	const ext = fileExt || path.extname(targetPath);

	// 强制 Python 输出 UTF-8 解决乱码
	let customEnv = { ...process.env, PYTHONIOENCODING: 'utf8' };
	const activeDocPath = vscode.window.activeTextEditor?.document.uri.fsPath;
	const cwdDir = activeDocPath ? path.dirname(activeDocPath) : path.dirname(targetPath);

	// 解析 .env 环境变量
	const activeUri = vscode.window.activeTextEditor?.document.uri;
	if (activeUri) {
		const workspaceFolder = getWorkspaceFolder(activeUri);
		if (workspaceFolder) {
			const envPath = path.join(workspaceFolder.uri.fsPath, '.env');
			if (fs.existsSync(envPath)) {
				try { customEnv = { ...customEnv, ...dotenv.parse(fs.readFileSync(envPath, 'utf-8')) }; } catch (e) { }
			}
		}
	}

	outputChannel.clear();
	outputChannel.show(true);

	// 🚨 打印日志时，如果带了参数，顺便显示出来
	const argsDisplay = userArgsStr ? ` [参数: ${userArgsStr}]` : '';
	outputChannel.appendLine(`>>> 🚀 开始运行: ${path.basename(targetPath)}${argsDisplay}`);
	outputChannel.appendLine('----------------------------------------');

	// 运行前先杀掉上一个进程
	stopCurrentProcess();

	// 🚨 核心逻辑：把字符串参数拆分成数组
	const extraStr = userArgsStr && userArgsStr.trim() ? ` ${userArgsStr.trim()}` : '';
	let command = '';
	if (ext === '.py') {
		const pyCmd = os.platform() === 'win32' ? 'py' : 'python3';
		command = `${pyCmd} -u "${targetPath}"${extraStr}`;
	} else if (ext === '.ts') {
		command = `npx --yes tsx "${targetPath}"${extraStr}`;
	} else {
		command = `node "${targetPath}"${extraStr}`;
	}

	const startTime = Date.now();

	// 启动子进程
	currentProcess = spawn(command, {
		shell: true,
		env: customEnv,
		cwd: cwdDir
	});
	currentProcess.stdout?.on('data', data => outputChannel.append(data.toString()));
	currentProcess.stderr?.on('data', data => outputChannel.append(data.toString()));

	currentProcess.on('close', code => {
		if (code === 0) {
			const timeDiff = ((Date.now() - startTime) / 1000).toFixed(3);
			outputChannel.appendLine(`\n----------------------------------------\n✅ [运行结束] 退出码: 0  |  ⏱️ 耗时: ${timeDiff} 秒`);
		}
		currentProcess = undefined;
	});

	currentProcess.on('error', (err) => {
		outputChannel.appendLine(`\n❌ [启动进程失败]: ${err.message}`);
		currentProcess = undefined;
	});
}

export function deactivate() {
	stopCurrentProcess(); // VS Code 关闭时，也绝不留下僵尸进程！
}