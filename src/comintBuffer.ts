import * as vscode from 'vscode';
import {IPty, spawn} from 'node-pty';
import { MemFS } from './fileSystemProvider';
import { OutputFilterFunctions } from './outputFilterFunctions';

export class ComintBuffer implements vscode.FileStat {
  
  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;
  uri: vscode.Uri;
  _memFs: MemFS;
  editor?: vscode.TextEditor;
  
  name: string;
  data?: Uint8Array;
  proc?: IPty;
  promptRanges: vscode.Range[];
  outputFilterFunctions: OutputFilterFunctions;

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
    this.outputFilterFunctions = new OutputFilterFunctions();
  }
  
  startComint(uri: vscode.Uri, editor: vscode.TextEditor) {
    console.log('startComint');
    this.editor = editor;
    
    this.proc = spawn("/bin/bash", ["-c", "bind 'set enable-bracketed-paste off' 2>/dev/null; /opt/homebrew/bin/bash"], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: this._rootPath(),
      env: process.env
    });
    
    // TODO more general/configurable solution for these extras to set the shell up right
    this.proc.write("stty -echo\n");
    
    let thenable: Thenable<undefined>;
    
    this.proc.onData((data: string) => {
      try {
        //console.log('[proc.onData] this.data.length', this.data?.length);
        console.log('[proc.onData] new data:', data.toString().replace(/\r/g, "/r").replace(/\n/g, "/n\n"));
        
        const databuffer = Buffer.from(data);
        const filteredDataBuffer = this.outputFilterFunctions.filter(databuffer);
        
        const oldLength = this.data?.length || 0;
        // console.log('[proc.onData] incomingdata.length', databuffer.length);
        const newdata = new Uint8Array(oldLength + filteredDataBuffer.length);
        newdata.set(this.data || Buffer.from(''), 0);
        newdata.set(filteredDataBuffer, oldLength);
        // console.log('[proc.onData] newdata.length', newdata.length);
        // console.log('newdata', Buffer.from(newdata).toJSON().data.toString());
        
        
        
        
        this._sync(newdata, true);
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
    this._insert(this.data!.length, `${cmd}\n`);
    this._sync(this.data!, true);
    this._inputRing.push(cmd);
    this._inputRingIndex = this._inputRing.length;
  }
  
  sendChars(chars: string) {
    this.proc?.write(chars);
  }
  
  getEndPosition(): vscode.Position {
    if (this.editor === undefined) {
      return new vscode.Position(0, 0);
    }
    return this.editor.document.lineAt(this.editor.document.lineCount - 1).range.end;
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
  
  lastPromptInputRange(): vscode.Range {
    if (this.editor === undefined) {
      throw new Error('No Editor!');
    }
    
    const ranges = this.getPromptRanges();
    if (ranges.length === 0) {
      return this.editor.selection;
    }
    const lastPrompt = ranges[ranges.length - 1];
    return new vscode.Range(new vscode.Position(lastPrompt.end.line, lastPrompt.end.character), this.editor.document.lineAt(this.editor.document.lineCount - 1).range.end);
  }
  
  delete(startIndex: number, endIndex: number) {
    this._delete(startIndex, endIndex);
    //this._memFs.writeFile(this.uri, this.data!, {create: false, overwrite: true});
    this._sync(this.data!, true);
  }
  
  // replaceRange(rangeToReplace: vscode.Range, replacement: string, document: vscode.TextDocument) {
  //   const startIndex = Buffer.byteLength(document.getText(new vscode.Range(new vscode.Position(0, 0), rangeToReplace.start)));
  //   const endIndex = Buffer.byteLength(document.getText(new vscode.Range(new vscode.Position(0, 0), rangeToReplace.end)));
  //   this.replace(startIndex, endIndex, replacement);
  // }
  
  // replace(startIndex: number, endIndex: number, replacement: string) {
  //   console.log('comintBuffer.replace');
  //   // console.log(`startIndex: ${startIndex}`);
  //   // console.log(`endIndex: ${endIndex}`);
  //   // console.log(`replacement: ${replacement}`);
  //   if (endIndex > startIndex) {
  //     this._delete(startIndex, endIndex);
  //   }
  //   this._insert(startIndex, replacement);
  //   //this._memFs.writeFile(this.uri, this.data!, {create: false, overwrite: true});
  //   this._sync(this.data!, false);
  // }
  
  _sync(data: Uint8Array, revert: boolean = false) {
    this._memFs.writeFile(this.uri, data, {create: false, overwrite: false});
    if (revert) {
      // after writing to the underlying virtual file/buffer, immediately 
      // "revert" the textdocument, so it reflects the new data, and doesn't show as "unsaved"
      console.log(`reverting ${this.uri}`);
      if (vscode.window.activeTextEditor === this.editor) {
        vscode.commands.executeCommand('workbench.action.files.revert'); // active editor
      } else {
        console.log('focused on a different editor - not reverting.');
      }
    }
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
  
  _rootPath() {
    if (!vscode.workspace.workspaceFolders) { return process.env.HOME; }
    return vscode.workspace.workspaceFolders![0].uri.path;
  }
}