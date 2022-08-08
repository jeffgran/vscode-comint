import { MemFS } from './fileSystemProvider';
import * as vscode from 'vscode';
import { ComintBuffer } from './comintBuffer';

// decorations
const promptDecoration = vscode.window.createTextEditorDecorationType({
  textDecoration: 'underline'
});

// TODO needs to be configurable.
const promptRegex = /^[^#$%>\n]*[#$%>] */;

export class Comint {
  _shellCount: number = 0;
  _memFs = new MemFS();
  
  get memFs() { return this._memFs; }
  
  constructor() {
    this._memFs.onDidChangeFile(this._handleMemfsFileChangeEvents);
  }
  
  // initialize = () => {
  //   vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('comint:/'), name: "Comint Buffers" });
  // };
  
  newShell = () => {
    console.log("comint.newShell");
    // if (!vscode.workspace.getWorkspaceFolder(vscode.Uri.parse('comint:/'))) {
    //   console.log('workspace folder does not exist, running comint.initialize...');
    //   vscode.commands.executeCommand('comint.initialize');
    // } else {
    //   console.log('workspace folder exists! creating the memfs file...');
    const num = this._shellCount;
    this._shellCount += 1;
    this._memFs.writeFile(vscode.Uri.parse(`comint:///comint:shell-${num}.sh`), Buffer.from(''), { create: true, overwrite: true });
    // }
  };
  
  sendInput = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.sendInput');
    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    const range = editor.selection;
    let cmd: string;
    if (editor.selection.isEmpty) {
      const line = editor.document.lineAt(editor.selection.end);
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
      comintBuffer.pushInput(cmd);
      this._memFs.sendInput(editor.document.uri, cmd);
    });
  };
  
  onData = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit, _uri: vscode.Uri, data: string) => {
    console.log('comint.onData', data);
    edit.insert(editor.document.lineAt(editor.document.lineCount - 1).range.end, data);
  };
  
  setDecorations = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.setDecorations');
    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    const ranges = comintBuffer.getPromptRanges();
    editor.setDecorations(promptDecoration, ranges);
  };
  
  stickyBottom = (editor: vscode.TextEditor) => {
    console.log('comint.stickyBottom');
    editor.revealRange(editor.document.lineAt(editor.document.lineCount - 1).range);
  };
  
  clear = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.clear');
    const penultimateLine = editor.document.lineAt(editor.document.lineCount - 2);
    const rangeToDelete = new vscode.Range(new vscode.Position(0, 0), penultimateLine.range.end);
    edit.delete(rangeToDelete);
  };
  
  inputRingPrevious = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.inputRingPrevious');
    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    const rangeToReplace = comintBuffer.lastPromptInputRange(editor);
    comintBuffer.decrementInputRingIndex();
    edit.replace(rangeToReplace, comintBuffer.getInputRingInput());
  };

  inputRingNext = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.inputRingNext');
    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    const rangeToReplace = comintBuffer.lastPromptInputRange(editor);
    comintBuffer.incrementInputRingIndex();
    edit.replace(rangeToReplace, comintBuffer.getInputRingInput());
  };
  
  _handleMemfsFileChangeEvents = (events: vscode.FileChangeEvent[]) => {
    console.log('comint._handleMemfsFileChangeEvents');
    events.forEach(async e => {
      if (e.type === vscode.FileChangeType.Created) {
        console.log('file was created! opening ', e.uri.toString());
        const doc = await vscode.workspace.openTextDocument(e.uri);
        const editor = await vscode.window.showTextDocument(doc);
      }
    });
  };
  
  // onDidChangeWorkspaceFolders = (e: vscode.WorkspaceFoldersChangeEvent) => {
  //   e.added.find(wf => {
  //     if (wf.uri === vscode.Uri.parse('comint:/')) {
  //       vscode.commands.executeCommand('comint.newShell');
  //       return true;
  //     }
  //   });
  // };
  
  onDidOpenTextDocument = (doc: vscode.TextDocument) => {
    if (doc.uri.scheme !== "comint") { return; }
    console.log("comint.onDidOpenTextDocument");
    
    const comintBuffer = this._memFs.getComintBuffer(doc.uri);
    comintBuffer.startComint(doc.uri);
  };
  
  onDidChangeTextDocument = (e: vscode.TextDocumentChangeEvent) => {
    if (e.document.uri.scheme !== "comint") { return; }
    console.log('comint.onDidChangeTextDocument');
    
    const comintBuffer = this._memFs.getComintBuffer(e.document.uri);
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
        ranges.push(new vscode.Range(startpos, new vscode.Position(line.lineNumber, len)));
      }
    }
    comintBuffer.setPromptRanges(ranges);
    vscode.commands.executeCommand('comint.setDecorations');
    vscode.commands.executeCommand('comint.stickyBottom');
  };
}