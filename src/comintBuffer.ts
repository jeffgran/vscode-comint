import * as vscode from 'vscode';
import {IPty, spawn} from 'node-pty';
import { MemFS } from './fileSystemProvider';

export class ComintBuffer implements vscode.FileStat {
  
  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;
  uri: vscode.Uri;
  _memFs: MemFS;
  
  name: string;
  data?: Uint8Array;
  proc?: IPty;
  promptRanges: vscode.Range[];
  _inputRing: string[];
  _inputRingIndex: number = 0;
  
  constructor(name: string, uri: vscode.Uri, memFs: MemFS) {
    this.type = vscode.FileType.File;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = 0;
    this.name = name;
    this.promptRanges = [];
    this._inputRing = [];
    this.uri = uri;
    this._memFs = memFs;
  }
  
  startComint(uri: vscode.Uri) {
    console.log('startComint');

    this.proc = spawn("/opt/homebrew/bin/bash", ["-c", "bind 'set enable-bracketed-paste off' 2>/dev/null; /opt/homebrew/bin/bash"], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });
    
    // TODO more general/configurable solution for these extras to set the shell up right
    this.proc.write("stty -echo\n");
    
    let thenable: Thenable<undefined>;
    
    this.proc.onData((data: string) => {
      try {
        console.log('[proc.onData] this.data.length', this.data?.length);
        const databuffer = Buffer.from(data).filter(c => c !== 13); // strip out CR for now
        const oldLength = this.data?.length || 0;
        // console.log('[proc.onData] incomingdata.length', databuffer.length);
        const newdata = new Uint8Array(oldLength + databuffer.length);
        newdata.set(this.data || Buffer.from(''), 0);
        newdata.set(databuffer, oldLength);
        // console.log('[proc.onData] newdata.length', newdata.length);
        // console.log('newdata', Buffer.from(newdata).toJSON().data.toString());
        this._memFs.writeFile(uri, newdata, { create: false, overwrite: true });
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
    this._insert(this.data!.length, "\r\n");
    this._memFs.writeFile(this.uri, this.data!, {create: false, overwrite: true});
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
  
  delete(startIndex: number, endIndex: number) {
    this._delete(startIndex, endIndex);
    this._memFs.writeFile(this.uri, this.data!, {create: false, overwrite: true});
  }
  
  replace(startIndex: number, endIndex: number, replacement: string) {
    console.log('comintBuffer.replace');
    // console.log(`startIndex: ${startIndex}`);
    // console.log(`endIndex: ${endIndex}`);
    if (endIndex > startIndex) {
      this._delete(startIndex, endIndex);
    }
    this._insert(startIndex, replacement);
    this._memFs.writeFile(this.uri, this.data!, {create: false, overwrite: true});
  }
  
  _insert(index: number, insertion: string) {
    if (!this.data) { throw new Error("Tried to insert but there is no data."); }
    if (index > this.data.length) { throw new Error(`Invalid index. index (${index}) is greater than the data length (${this.data.length}).`); }
    
    const insertionBuffer = Buffer.from(insertion);
    const newlen = this.data.length + insertion.length;
    const newdata = new Uint8Array(newlen);
    newdata.set(this.data, 0);
    newdata.set(insertionBuffer, this.data.length);
    this.data = newdata;
  }
  
  _delete(startIndex: number, endIndex: number) {
    if (!this.data) { throw new Error("Tried to delete but there is no data."); }
    if (endIndex < startIndex) { throw new Error(`Invalid indices. startIndex (${startIndex}) is greater than endIndex ${endIndex}.`); }
    
    const sizeToDelete = endIndex - startIndex;
    if (sizeToDelete > this.data.length) { throw new Error(`Cannot delete more data than is in the buffer! startIndex: ${startIndex}, endIndex: ${endIndex}, buffer size: ${this.data.length}`); }
    
    // console.log(`startIndex: ${startIndex}`);
    // console.log(`endIndex: ${endIndex}`);
    // console.log(`sizeToDelete: ${sizeToDelete}`);
    const newlen = this.data.length - (sizeToDelete);
    // console.log(`origLen: ${this.data.length}`);
    // console.log(`newlen: ${newlen}`);
    const newdata = new Uint8Array(newlen);
    
    const firstSlice = this.data.slice(0, startIndex);
    // console.log(`firstSlice: ${Buffer.from(firstSlice).toString('utf-8')}`);
    // console.log(`firstSlice.length: ${firstSlice.length}`);
    newdata.set(firstSlice, 0);
    const secondSlice = this.data.slice(endIndex, this.data.length);
    // console.log(`secondSlice: ${Buffer.from(secondSlice).toString('utf-8')}`);
    // console.log(`secondSlice.length: ${secondSlice.length}`);
    // console.log(`newTotalLength: ${firstSlice.length + secondSlice.length}`);
    newdata.set(secondSlice, startIndex);
    
    console.log(`newdata: ${newdata}`);
    this.data = newdata;
  }
}