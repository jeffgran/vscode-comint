import { MemFS } from './fileSystemProvider';
import * as vscode from 'vscode';

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
  
  newShell = () => {
    console.log("comint.newShell");
    const num = this._shellCount;
    this._shellCount += 1;
    this._memFs.writeFile(vscode.Uri.parse(`comint:///comint:shell-${num}.sh`), Buffer.from(''), { create: true, overwrite: true });
  };
  
  sendInput = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.sendInput');
    if (editor.document.uri.scheme !== "comint") { return; }
    
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
    
    editor.edit(e => {
      // insert a newline since we are not echoing input
      // TODO also put in the line itself, if it did not come from the "end", after the last prompt.
      edit.insert(editor.document.lineAt(editor.document.lineCount - 1).range.end, "\n");
    }).then(() => {
      comintBuffer.pushInput(cmd);
    });
  };
  
  setDecorations = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit, uri: vscode.Uri) => {
    console.log('comint.setDecorations');
    if (editor.document.uri.scheme !== "comint") { return; }
    if (editor.document.uri !== uri) {
      console.log('wrong document!');
      return;
    }
    
    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    const ranges = comintBuffer.getPromptRanges();
    editor.setDecorations(promptDecoration, ranges);
  };
  
  stickyBottom = (editor: vscode.TextEditor, _edit: vscode.TextEditorEdit, uri: vscode.Uri) => {
    console.log('comint.stickyBottom');
    if (editor.document.uri.scheme !== "comint") { return; }
    if (editor.document.uri !== uri) { return; }
    
    editor.revealRange(editor.document.lineAt(editor.document.lineCount - 1).range);
  };
  
  clear = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.clear');
    if (editor.document.uri.scheme !== "comint") { return; }
    const penultimateLine = editor.document.lineAt(editor.document.lineCount - 2);
    const rangeToDelete = new vscode.Range(new vscode.Position(0, 0), penultimateLine.range.end);
    edit.delete(rangeToDelete);
  };
  
  inputRingPrevious = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.inputRingPrevious');
    if (editor.document.uri.scheme !== "comint") { return; }
    
    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    const rangeToReplace = comintBuffer.lastPromptInputRange(editor);
    comintBuffer.decrementInputRingIndex();
    edit.replace(rangeToReplace, comintBuffer.getInputRingInput());
  };
  
  inputRingNext = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.inputRingNext');
    if (editor.document.uri.scheme !== "comint") { return; }
    
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
  
  onDidOpenTextDocument = (doc: vscode.TextDocument) => {
    if (doc.uri.scheme !== "comint") { return; }
    console.log("comint.onDidOpenTextDocument");
    
    const comintBuffer = this._memFs.getComintBuffer(doc.uri);
    comintBuffer.startComint(doc.uri, this._memFs);
  };
  
  onDidChangeTextDocument = (e: vscode.TextDocumentChangeEvent) => {
    if (e.document.uri.scheme !== "comint") { return; }
    console.log('comint.onDidChangeTextDocument');
    
    // no content was changed, we can ignore this event.
    if (e.contentChanges.length === 0) { return; }
    
    const comintBuffer = this._memFs.getComintBuffer(e.document.uri);

    const ranges: vscode.Range[] = [];
    // TODO be more efficient here and only replace the ranges for the 
    // parts of the document that changed.
    for(let i = 0; i < e.document.lineCount; i++) {
      const line = e.document.lineAt(i);
      const match = line.text.match(promptRegex);
      if (match) {
        const len = match[0].length;
        const startpos = line.range.start;
        ranges.push(new vscode.Range(startpos, new vscode.Position(line.lineNumber, len)));
      }
    }
    comintBuffer.setPromptRanges(ranges);
    vscode.commands.executeCommand('comint.setDecorations', e.document.uri);
    vscode.commands.executeCommand('comint.stickyBottom', e.document.uri);
  };
  
  onDidChangeVisibleTextEditors = (e: readonly vscode.TextEditor[]) => {
    e.forEach(editor => {
      vscode.commands.executeCommand('comint.setDecorations', editor.document.uri);
    });
  };
}