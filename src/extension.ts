import * as vscode from 'vscode';
import { MemFS } from './fileSystemProvider';

// TODO
// - make sure it shows the initial prompt?
// - kill the process when closing the document.
// - auto-load the extension using onDidChangeWorkspaceFolders somehow instead of loading it on launch
// - decorate the buffer with readonly for prompt
// - auto filter out the prompt from the line when pressing return
// - follow the cursor down if output flows off the screen.


// TODO needs to be configurable.
const promptRegex = /^[^#$%>\n]*[#$%>] */;

export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "comint" is now active!');
	
	const memFs = new MemFS();
	vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('comint:///'), name: "Comint-mode" });
	
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

	const promptDecoration = vscode.window.createTextEditorDecorationType({
		textDecoration: 'underline'
	});

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
		const lastLine = e.document.lineAt(e.document.lineCount - 1);
		const match = lastLine.text.match(promptRegex);
		if (match) {
			console.log('match');
			const len = match[0].length;
			const startpos = lastLine.range.start;
			vscode.commands.executeCommand('comint.setDecorations', new vscode.Range(startpos, new vscode.Position(lastLine.lineNumber, len - 1)));
		}
	}));
	
	
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.setDecorations', (editor, edit, range) => {
		editor.setDecorations(promptDecoration, [range]);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('comint.newShell', _ => {
		console.log("comint.newShell");
		memFs.writeFile(vscode.Uri.parse(`comint:///foo.sh`), Buffer.from(''), { create: true, overwrite: true });
	}));

	memFs.onDidChangeFile(events => {
		console.log('memFs.onDidChangeFile');
		events.forEach(async e => {
			if (e.type === vscode.FileChangeType.Created) {
				console.log('file was created! opening ', e.uri.toString());
				const doc = await vscode.workspace.openTextDocument(e.uri);
				const editor = await vscode.window.showTextDocument(doc);
			}
		});
	});
	
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(e => {
		console.log("workspaces.onDidOpenTextDocument");
		memFs.startComint(e);
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {}
