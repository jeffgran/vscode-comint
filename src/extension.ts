import * as vscode from 'vscode';
import {getCoreNodeModule} from './getCoreNodeModule';
import { Comint } from './comint';
import { ComintCompletionProvider } from './completion';

// TODO
// - kill the process when closing the document?
//   - warn that the process will be killed before closing the document
//   - OR: add feature to re-open closed shells?
// - make it survive reloads? would have to save data on FS?
// - keep track of the insertion point so we can keep the user input if more output comes
// - make the prompt detection more performant?
//   - only keep track of the last one? that's all we need really...
// - prompt: instead of prompt regex, keep track of which ranges were output vs input, to help with cases like:
//   | $ vsce package
//   | `Do you want to continue? [y/N] Do you want to continue? [y/N] y`
//   | `bash: Do: command not found`
// - input ring should have an empty item at the end/beginning
//   - integrate input ring with history file
//   - go-to-beg/end of input ring command
//   - (ctrl-r)
// - ansi/sgr
//   - underline/italic/strikethrough/etc styles
//     - improve "paired" on/off codes for dryness
//   - handle \b backspace char
//   - I think there's a bug where if the ANSI CSI is split across two output "chunks" it will not be processed.
// - tab completion
//   ∆ bash
//   - zsh
//   - generic (python etc?)
// - figure out how to default the current directory of the "file" to the `pwd`
//   - use `OSC 7` for dir tracking from the prompt:
//     - https://www.masteringemacs.org/article/running-shells-in-emacs-overview#directory-tracking
//     - https://github.com/mintty/mintty/wiki/CtrlSeqs#working-directory
//   - I think just vscode.activeTextEditor.documet |> getComintBuffer |> getCurrentPwd() |> prefill quick open
//   - use `extensions` api - you can expose an api for other extensions to consume:
//     - https://code.visualstudio.com/api/references/vscode-api#extensions
//     - or just make a command. Others can check if the uri scheme is `comint` and if so call the command(s)
// - filter out all control/unprintable characters we don't understand
// - `comint-process-echoes` - if the process echoes, strip out a copy of the input from the output before processing.
// - BUG: password prompt shows twice and then doesn't work again after that?
// - typing chars should update underlying virtual file
//   - when typing chars in previous output, the decorations should be maintained
//   - when typing at the prompt/end, the input should be preserved e.g. when switching to another window and back.
// - set the width of the virtual pty to the width of the window.

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
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.getCwdUri', comint.getCwdUri));

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
