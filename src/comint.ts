import { MemFS } from './fileSystemProvider';
import * as vscode from 'vscode';

// decorations
const promptDecoration = vscode.window.createTextEditorDecorationType({
  textDecoration: 'underline'
});

const ansiBlackDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBlack'),
});
const ansiRedDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiRed'),
});
const ansiGreenDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiGreen'),
});
const ansiYellowDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiYellow'),
});
const ansiBlueDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBlue'),
});
const ansiMagentaDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiMagenta'),
});
const ansiCyanDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiCyan'),
});
const ansiWhiteDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiWhite'),
});
const ansiBrightBlackDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBrightBlack'),
});
const ansiBrightRedDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBrightRed'),
});
const ansiBrightGreenDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBrightGreen'),
});
const ansiBrightYellowDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBrightYellow'),
});
const ansiBrightBlueDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBrightBlue'),
});
const ansiBrightMagentaDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBrightMagenta'),
});
const ansiBrightCyanDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBrightCyan'),
});
const ansiBrightWhiteDecoration = vscode.window.createTextEditorDecorationType({
  color: new vscode.ThemeColor('terminal.ansiBrightWhite'),
});

const sgrCodeMap = new Map([
  [30, ansiBlackDecoration],
  [31, ansiRedDecoration],
  [32, ansiGreenDecoration],
  [33, ansiYellowDecoration],
  [34, ansiBlueDecoration],
  [35, ansiMagentaDecoration],
  [36, ansiCyanDecoration],
  [37, ansiWhiteDecoration],

  [90, ansiBrightBlackDecoration],
  [91, ansiBrightRedDecoration],
  [92, ansiBrightGreenDecoration],
  [93, ansiBrightYellowDecoration],
  [94, ansiBrightBlueDecoration],
  [95, ansiBrightMagentaDecoration],
  [96, ansiBrightCyanDecoration],
  [97, ansiBrightWhiteDecoration],
]);

type TextObject = {
  text: string
};

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
    this._memFs.writeFile(vscode.Uri.parse(`comint:///bash-${num}.comint`), Buffer.from(''), { create: true, overwrite: true });
  };

  type = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit, { text }: TextObject) => {
    console.log('comint.type');
    if (editor.document.uri.scheme !== "comint") {
      vscode.commands.executeCommand('default:type', {text});
      return;
    }
    // TODO some fancy stuff here?
    vscode.commands.executeCommand('default:type', {text});
  };

  sendInput = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.sendInput');
    if (editor.document.uri.scheme !== "comint") { return; }

    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    comintBuffer.pushInput();
  };

  sendCtrlC = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.sendCtrlC');
    if (editor.document.uri.scheme !== "comint") { return; }

    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);

    comintBuffer.sendChars("\x03");
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

    const allCodes = new Map<number, vscode.Range[]>();
    sgrCodeMap.forEach((decorationType, code) => {
      allCodes.set(code, []);
    });

    const sgrSegments = comintBuffer.sgrSegments;
    const sgrRanges = sgrSegments.reduce<Map<number, vscode.Range[]>>((acc, segment) => {
      const range = new vscode.Range(editor.document.positionAt(segment.startIndex), editor.document.positionAt(segment.endIndex + 1));
      acc.get(segment.code)?.push(range);
      return acc;
    }, allCodes);
    sgrRanges.forEach((ranges, code) => {
      const decoration = sgrCodeMap.get(code);
      if (decoration !== undefined) {
        editor.setDecorations(decoration, ranges);
      }
    });
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
    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    const penultimateLine = editor.document.lineAt(editor.document.lineCount - 2);
    const rangeToDelete = new vscode.Range(new vscode.Position(0, 0), penultimateLine.range.end);
    const endByteOffset = Buffer.byteLength(editor.document.getText(rangeToDelete));
    comintBuffer.delete(0, endByteOffset);
  };

  inputRingPrevious = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.inputRingPrevious');
    if (editor.document.uri.scheme !== "comint") { return; }

    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    const rangeToReplace = comintBuffer.lastPromptInputRange();
    comintBuffer.decrementInputRingIndex();
    edit.replace(rangeToReplace, comintBuffer.getInputRingInput());

    // kill the selection (doesn't work)
    //editor.selections = editor.selections.map((selection) => new vscode.Selection(selection.active, selection.active));
  };

  inputRingNext = (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
    console.log('comint.inputRingNext');
    if (editor.document.uri.scheme !== "comint") { return; }

    const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
    const rangeToReplace = comintBuffer.lastPromptInputRange();
    comintBuffer.incrementInputRingIndex();
    edit.replace(rangeToReplace, comintBuffer.getInputRingInput());

    // kill the selection (doesn't work)
    //editor.selections = editor.selections.map((selection) => new vscode.Selection(selection.active, selection.active));
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
    const e = vscode.window.activeTextEditor;
    if (e !== undefined) {
      comintBuffer.startComint(doc.uri, e);
    }
  };

  onDidChangeTextDocument = (e: vscode.TextDocumentChangeEvent) => {
    if (e.document.uri.scheme !== "comint") { return; }
    console.log('comint.onDidChangeTextDocument');

    // no content was changed, we can ignore this event.
    if (e.contentChanges.length === 0) { return; }
    e.contentChanges.forEach(cc => {
      //console.log(cc);
    });
    //console.log('fulltext:', e.document.getText());

    const comintBuffer = this._memFs.getComintBuffer(e.document.uri);
    comintBuffer.updatePromptRanges();

    vscode.commands.executeCommand('comint.setDecorations', e.document.uri);
    vscode.commands.executeCommand('comint.stickyBottom', e.document.uri);
  };

  onDidChangeVisibleTextEditors = (e: readonly vscode.TextEditor[]) => {
    e.forEach(editor => {
      if (editor.document.uri.scheme === 'comint') {
        const comintBuffer = this._memFs.getComintBuffer(editor.document.uri);
        comintBuffer.editor = editor;
        if (comintBuffer.proc === undefined) {
          comintBuffer.startComint(editor.document.uri, editor);
        }
        vscode.commands.executeCommand('workbench.action.files.revert'); // active editor
        vscode.commands.executeCommand('comint.setDecorations', editor.document.uri);
      }
    });
  };

  onDidChangeTextEditorSelection = (e: vscode.TextEditorSelectionChangeEvent) => {
    if (e.selections.length < 1) { return; }
    const selection = e.selections[0];
    if (selection.isEmpty) {
      const comintBuffer = this._memFs.getComintBuffer(e.textEditor.document.uri);
      const prompts = comintBuffer.getPromptRanges();
      if (prompts.length === 0) { return; }
      const prompt = prompts[prompts.length - 1];
      if (prompt.contains(selection)) {
        e.textEditor.selection = new vscode.Selection(prompt.end, prompt.end);
      }
    }
  };
}