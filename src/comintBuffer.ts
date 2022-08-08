import * as vscode from 'vscode';
import {IPty, spawn} from 'node-pty';
import { MemFS } from './fileSystemProvider';

export class ComintBuffer implements vscode.FileStat {
  
  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;
  uri: vscode.Uri;
  
  name: string;
  data?: Uint8Array;
  proc?: IPty;
  promptRanges: vscode.Range[];
  _inputRing: string[];
  _inputRingIndex: number = 0;
  
  constructor(name: string, uri: vscode.Uri) {
    this.type = vscode.FileType.File;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = 0;
    this.name = name;
    this.promptRanges = [];
    this._inputRing = [];
    this.uri = uri;
  }
  
  startComint(uri: vscode.Uri, memfs: MemFS) {
    console.log('startComint');
    this.proc = spawn("/opt/homebrew/bin/bash", ["-l"], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });
    // TODO more general/configurable solution for these extras to set the shell up right
    this.proc.write("stty echo\n");
    this.proc.write("bind 'set enable-bracketed-paste off'\n");
    
    let thenable: Thenable<undefined>;
    
    this.proc.onData((data: string) => {
      try {
        console.log('this.data.length', this.data?.length);
        const oldLength = this.data?.length || 0;
        const newdata = new Uint8Array(oldLength + data.length);
        newdata.set(this.data || Buffer.from(''), 0);
        newdata.set(Buffer.from(data), oldLength);
        memfs.writeFile(uri, newdata, { create: false, overwrite: false });
      } catch(e) {
        console.log(e);
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
    this.proc?.write(`${cmd}\n`);
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