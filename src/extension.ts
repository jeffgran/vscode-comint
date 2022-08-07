import { text } from 'stream/consumers';
import * as vscode from 'vscode';
import { MemFS } from './fileSystemProvider';
import { Comint } from './comint';

// TODO
// - make sure it shows the initial prompt?
// - kill the process when closing the document.
// X auto-load the extension using onDidChangeWorkspaceFolders somehow instead of loading it on launch
// - name each shell individually
// X decorate the buffer with readonly for prompt
//   X BUG: the ranges don't update when the document changes. we might just have to re-calc them all each time. just check all lines.
// X auto filter out the prompt from the line when pressing return
// X follow the cursor down if output flows off the screen.
// - input ring
// - cursorHome should go back to the end of the prompt if on a prompt line
// X don't echo input
// X clear command


const comint = new Comint();

export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "comint" is now active!');

	// fake filesystem provider to handle the non-file-backed shell buffers.
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('comint', comint.memFs, { isCaseSensitive: true, isReadonly: false }));

	// commands
	context.subscriptions.push(vscode.commands.registerCommand('comint.newShell', comint.newShell.bind(comint)));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.sendInput', comint.sendInput));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.onData', comint.onData));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.setDecorations', comint.setDecorations));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.stickyBottom', comint.stickyBottom));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.inputRingPrevious', comint.inputRingPrevious));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.clear', comint.clear));
	

	// event callbacks
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(comint.onDidOpenTextDocument));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(comint.onDidChangeTextDocument));
}

// this method is called when your extension is deactivated
export function deactivate() {}
