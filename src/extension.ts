// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MemFS } from './fileSystemProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "comint" is now active!');
	
	const memFs = new MemFS();
	vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('comint:///'), name: "MemFS - Sample" });
	
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.sendInput', (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
		console.log('comint.sendInput');
		const range = editor.selection;
		let line: string;
		if (editor.selection.isEmpty) {
			line = editor.document.lineAt(editor.selection.end).text;
		} else {
			line = editor.document.getText(range);
		}
		
		console.log("uri:", editor.document.uri);
		console.log("line:", line);
		
		memFs.sendInput(editor.document.uri, line);
	}));
	
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.onData', (editor, edit, _uri, data) => {
		console.log('inserting data:', data);
		edit.insert(editor.document.lineAt(editor.document.lineCount - 1).range.end, data);
	}));
	
	
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('comint', memFs, { isCaseSensitive: true, isReadonly: false }));
	
	context.subscriptions.push(vscode.commands.registerCommand('comint.newShell', _ => {
		console.log("comint.newShell");
		memFs.writeFile(vscode.Uri.parse(`comint:///foo`), Buffer.from('foo'), { create: true, overwrite: true });
	}));
	
	context.subscriptions.push(vscode.workspace.onDidCreateFiles(e => {
		// TODO loop
		const uri = e.files[0];
		vscode.workspace.openTextDocument(uri);
	}));
	
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(e => {
		console.log("opened text document!", e);
		memFs.startComint(e);
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {}
