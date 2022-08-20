import * as vscode from 'vscode';
import {IPty, spawn} from 'node-pty';
import { Token, tokenRe } from './token';

export type SgrSegment = {
  code: number,
  startIndex: number,
  endIndex: number,
};

export class ComintBuffer implements vscode.FileStat {
  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;
  uri: vscode.Uri;
  editor?: vscode.TextEditor;
  
  name: string;
  data: Uint8Array = Buffer.from('');
  proc?: IPty;
  promptRanges: vscode.Range[];
  
  inCR: boolean = false;
  openSgrSegments: SgrSegment[] = [];
  writeIndex: number = 0;
  
  sgrSegments: SgrSegment[] = [];
  
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
    
    this.proc.onData(this.applyChunk.bind(this));
  }
  
  applyChunk(chunkString: string) {
    // console.log('[proc.onData] new data:', chunkString.replace(/\r/g, "/r").replace(/\n/g, "/n\n"));
    // console.log('[proc.onData] new data raw:', Buffer.from(chunkString));
    
    let match: RegExpExecArray | null;
    
    while((match = tokenRe.exec(chunkString)) !== null) {
      const token = new Token(match);
      //console.log(`token: ${token[0]}`, Buffer.from(token[0]));
      if (token.isCrlfSequence()) {
        this.inCR = false;
        this.writeIndex = this.write(token.outputCharCodes(), this.writeIndex);
      } else if (token.isCrSequence()) {
        if (token.endIndex === chunkString.length - 1) {
          this.inCR = true;
        } else {
          this.writeIndex = this.data!.lastIndexOf(10) + 1;
        }
      } else if (token.isKillLine()) {
        if (this.writeIndex !== this.data.length) {
          this.delete(this.writeIndex, this.data.length - 1);
        }
      } else if (token.isSgrCode()) {
        this.processSgrCodes(token);
        this.inCR = false;
      } else if (token.isAnsiCode()) {
        // other ANSI codes, ignore for now
      } else { // any other character
        if (this.inCR) {
          this.writeIndex = this.data!.lastIndexOf(10) + 1;
        }
        this.writeIndex = this.write(token.outputCharCodes(), this.writeIndex);
        this.inCR = false;
      }
    }
    
    this._sync(true);
  }
  
  processSgrCodes(token: Token) {
    const sgrcodes = token.sgrCodes();
    sgrcodes?.forEach(sgrcode => {
      if (sgrcode === 0) {
        this.openSgrSegments.forEach(s => {
          s.endIndex = this.writeIndex;
          this.sgrSegments.push(s);
        });
        this.openSgrSegments = [];
      } else {
        this.openSgrSegments.push({
          code: sgrcode,
          startIndex: this.writeIndex,
          endIndex: this.writeIndex
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
    this.proc?.write(`${cmd}\n`);
    this.write(Buffer.from(`${cmd}\n`), this.data.length);
    this._sync(true);
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
    this._sync(true);
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
  
  _sync(revert: boolean = false) {
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

  write(value: Uint8Array, atIndex: number): number {
    const headroom = this.data.length - atIndex;
    if (headroom >= value.length) {
      // there's enough room, just write it
      this.data.set(value, atIndex);
      return atIndex + value.length;
    } else {
      // there's not enough room, make a bigger array and then write it
      const ret = new Uint8Array(this.data.length + (value.length - headroom));
      ret.set(this.data, 0);
      ret.set(value, atIndex);
      this.data = ret;
      return ret.length;
    }
  }
  
  // _insert(index: number, insertion: string) {
  //   if (!this.data) { throw new Error("Tried to insert but there is no data."); }
  //   if (index > this.data.length) { throw new Error(`Invalid index. index (${index}) is greater than the data length (${this.data.length}).`); }
    
  //   const insertionBuffer = Buffer.from(insertion);
  //   const newlen = this.data.length + insertion.length;
  //   const newdata = new Uint8Array(newlen);
  //   newdata.set(this.data, 0);
  //   newdata.set(insertionBuffer, this.data.length);
  //   this.data = newdata;
  // }
  
  _delete(startIndex: number, endIndex: number) {
    if (!this.data) { throw new Error("Tried to delete but there is no data."); }
    if (endIndex < startIndex) { throw new Error(`Invalid indices. startIndex (${startIndex}) is greater than endIndex ${endIndex}.`); }
    
    const sizeToDelete = (endIndex - startIndex) + 1;
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
    const secondSlice = this.data.slice(endIndex+1, this.data.length);
    // console.log(`secondSlice: ${Buffer.from(secondSlice).toString('utf-8')}`);
    // console.log(`secondSlice.length: ${secondSlice.length}`);
    // console.log(`newTotalLength: ${firstSlice.length + secondSlice.length}`);
    newdata.set(secondSlice, startIndex);
    
    //console.log(`newdata: ${newdata}`);
    this.data = newdata;
  }
  
  _rootPath() {
    if (!vscode.workspace.workspaceFolders) { return process.env.HOME; }
    return vscode.workspace.workspaceFolders![0].uri.path;
  }
}