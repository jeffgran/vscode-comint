import { text } from 'stream/consumers';
import * as vscode from 'vscode';
import { MemFS } from './fileSystemProvider';

// TODO
// - make sure it shows the initial prompt?
// - kill the process when closing the document.
// - auto-load the extension using onDidChangeWorkspaceFolders somehow instead of loading it on launch
// X decorate the buffer with readonly for prompt
//   X BUG: the ranges don't update when the document changes. we might just have to re-calc them all each time. just check all lines.
// X auto filter out the prompt from the line when pressing return
// - follow the cursor down if output flows off the screen.
// - input ring
// - cursorHome should go back to the end of the prompt if on a prompt line
// X don't echo input
// X clear command


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
		let cmd: string;
		if (editor.selection.isEmpty) {
			const line = editor.document.lineAt(editor.selection.end);
			const comintBuffer = memFs.getComintBuffer(editor.document.uri);
			const prompts = comintBuffer.getPromptRanges();
			const intersection = prompts.map(p => line.range.intersection(p)).find(p => p);
			if (intersection) {
				cmd = editor.document.getText(new vscode.Range(intersection.end, line.range.end));
			} else {
				cmd = line.text;
			}
		} else {
			cmd = editor.document.getText(range);
		}
		
		console.log("uri:", editor.document.uri);
		console.log("line:", cmd);
		
		editor.edit(e => {
			// insert a newline since we are not echoing input
			// TODO also put in the line itself, if it did not come from the "end", after the last prompt.
			edit.insert(editor.document.lineAt(editor.document.lineCount - 1).range.end, "\n");
		}).then(() => {
			memFs.sendInput(editor.document.uri, cmd);
		});
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
		const comintBuffer = memFs.getComintBuffer(e.document.uri);
		const ranges: vscode.Range[] = [];
		// TODO be more efficient here and only replace the ranges for the 
		// parts of the document that changed.
		for(let i = 0; i < e.document.lineCount; i++) {
			const line = e.document.lineAt(i);
			console.log('line:', line.text);
			const match = line.text.match(promptRegex);
			console.log('match:', match);
			if (match) {
				const len = match[0].length;
				const startpos = line.range.start;
				ranges.push(new vscode.Range(startpos, new vscode.Position(line.lineNumber, len - 1)));
			}
		}
		comintBuffer.setPromptRanges(ranges);
		vscode.commands.executeCommand('comint.setDecorations');
	}));
	
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.setDecorations', (editor, _edit) => {
		const comintBuffer = memFs.getComintBuffer(editor.document.uri);
		const ranges = comintBuffer.getPromptRanges();
		editor.setDecorations(promptDecoration, ranges);
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
		const comintBuffer = memFs.getComintBuffer(e.uri);
		comintBuffer.startComint(e.uri);
	}));
	
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('comint.clear', (editor, edit) => {
		const penultimateLine = editor.document.lineAt(editor.document.lineCount - 2);
		const rangeToDelete = new vscode.Range(new vscode.Position(0, 0), penultimateLine.range.end);
		edit.delete(rangeToDelete);
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {}
