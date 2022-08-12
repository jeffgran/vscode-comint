import { text } from 'stream/consumers';
import * as vscode from 'vscode';
import { MemFS } from './fileSystemProvider';
import { Comint } from './comint';

// TODO
// - kill the process when closing the document.
// - cursorHome should go back to the end of the prompt if on a prompt line
// - keep track of the insertion point so we can keep the user input if more output comes
// - make the prompt detection more performant
// - input ring should have an empty item at the end/beginning
// - ANSI decorations


const comint = new Comint();

export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "comint" is now active!');

	// fake filesystem provider to handle the non-file-backed shell buffers.
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('comint', comint.memFs, { isCaseSensitive: true, isReadonly: false }));

	// commands
	// context.subscriptions.push(vscode.commands.registerCommand('comint.initialize', comint.initialize));
	context.subscriptions.push(vscode.commands.registerCommand('comint.newShell', comint.newShell));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.sendInput', comint.sendInput));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.setDecorations', comint.setDecorations));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.stickyBottom', comint.stickyBottom));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.inputRingPrevious', comint.inputRingPrevious));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.inputRingNext', comint.inputRingNext));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.clear', comint.clear));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.sendCtrlC', comint.sendCtrlC));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('type', comint.type));

	// event callbacks
	// context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(comint.onDidChangeWorkspaceFolders));
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(comint.onDidOpenTextDocument));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(comint.onDidChangeTextDocument));
	context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(comint.onDidChangeVisibleTextEditors));
}

// this method is called when your extension is deactivated
export function deactivate() {}
