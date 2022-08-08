import * as vscode from 'vscode';
import {IPty, spawn} from 'node-pty';

export class ComintBuffer implements vscode.FileStat {
  
  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;
  
  name: string;
  data?: Uint8Array;
  proc?: IPty;
  promptRanges: vscode.Range[];
  _inputRing: string[];
  _inputRingIndex: number = 0;
  
  constructor(name: string) {
    this.type = vscode.FileType.File;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = 0;
    this.name = name;
    this.promptRanges = [];
    this._inputRing = [];
  }
  
  startComint(uri: vscode.Uri) {
    console.log('startComint');
    const entry = this;
    var proc = spawn("/opt/homebrew/bin/bash", ["-l"], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });
    // TODO more general/configurable solution for these extras to set the shell up right
    proc.write("stty echo\n");
    proc.write("bind 'set enable-bracketed-paste off'\n");
    entry.proc = proc;
    
    let thenable: Thenable<undefined>;
    
    proc.onData((data: string) => {
      console.log(`proc.onData: ${data}`);
      console.log("thenable:", thenable);
      if (thenable === undefined) {
        console.log('attempting to executeCommand(comint.onData)');
        thenable = vscode.commands.executeCommand("comint.onData", uri, data);
      } else {
        thenable = thenable.then(() => {
          return vscode.commands.executeCommand("comint.onData", uri, data);
        });
      }
    });
    
  }
  
  addPromptRange(range: vscode.Range) {
    this.promptRanges.push(range);
  }
  
  getPromptRanges(): vscode.Range[] {
    return this.promptRanges;
  }
  
  setPromptRanges(ranges: vscode.Range[]) {
    this.promptRanges = ranges;
  }
  
  pushInput(cmd: string) {
    this._inputRing.push(cmd);
    this._inputRingIndex = this._inputRing.length;
  }
  
  getInputRingInput(): string {
    return this._inputRing[this._inputRingIndex] || '';
  }
  
  decrementInputRingIndex() {
    this._inputRingIndex -= 1;
    if (this._inputRingIndex < 0) {
      this._inputRingIndex = this._inputRing.length - 1;
    }
  }
  
  incrementInputRingIndex() {
    this._inputRingIndex += 1;
    if (this._inputRingIndex >= this._inputRing.length) {
      this._inputRingIndex = 0;
    }
  }
  
  lastPromptInputRange(editor: vscode.TextEditor): vscode.Range {
    const ranges = this.getPromptRanges();
    if (ranges.length === 0) {
      return editor.selection;
    }
    const lastPrompt = ranges[ranges.length - 1];
    return new vscode.Range(new vscode.Position(lastPrompt.end.line, lastPrompt.end.character), editor.document.lineAt(editor.document.lineCount - 1).range.end);
  }
  
}