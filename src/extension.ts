import * as vscode from 'vscode';
import {getCoreNodeModule} from './getCoreNodeModule';
import { Comint } from './comint';
import { ComintCompletionProvider } from './completion';

// TODO
// - kill the process when closing the document?
//   - warn that the process will be killed before closing the document
//   - OR: add feature to re-open closed shells?
// - keep track of the insertion point so we can keep the user input if more output comes
// - make the prompt detection more performant?
//   - only keep track of the last one? that's all we need really...
// - prompt: keep track of which ranges were output vs input, to help with cases like:
//   | `Do you want to continue? [y/N] Do you want to continue? [y/N] y`
//   | `bash: Do: command not found`
// - input ring should have an empty item at the end/beginning
//   - integrate input ring with history file
//   - don't select input after switching input ring
//   - go-to-beg/end of input ring command
//   - (ctrl-r)
// - ansi/sgr
//   - underline/italic/strikethrough/etc styles
//     - improve "paired" on/off codes for dryness
// - tab completion
//   ∆ bash
//   - zsh
//   - generic (python etc?)

export const comint = new Comint();

export function activate(context: vscode.ExtensionContext) {
	if (getCoreNodeModule('node-pty') === null) {
		vscode.window.showErrorMessage('Could not load node-pty. Cannot continue loading comint');
		return;
	}
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

	// Not sure if this will be needed.
	// context.subscriptions.push(vscode.commands.registerTextEditorCommand('type', comint.type));

	// comint "language"
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider({scheme: 'comint'}, new ComintCompletionProvider(comint._memFs), '.', '/', '$', ' '));


	// event callbacks
	// context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(comint.onDidChangeWorkspaceFolders));
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(comint.onDidOpenTextDocument));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(comint.onDidChangeTextDocument));
	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(comint.onDidChangeTextEditorSelection));
	context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(comint.onDidChangeVisibleTextEditors));
}

// this method is called when your extension is deactivated
export function deactivate() {}
