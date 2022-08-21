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
    //console.log('[proc.onData] new data:', chunkString.replace(/\r/g, "/r").replace(/\n/g, "/n\n").replace(/\x1b/g, '/x1b'));
    console.log('[proc.onData] new data raw:', Buffer.from(chunkString));
    let match: RegExpExecArray | null;
    
    let lastTokenEndIndex = -1;
    while((match = tokenRe.exec(chunkString)) !== null) {
      const thisToken = new Token(match);
      const tokens: Token[] = [];
      if (thisToken.startIndex > lastTokenEndIndex + 1) {
        tokens.push(new Token(chunkString.slice(lastTokenEndIndex + 1, thisToken.startIndex), lastTokenEndIndex + 1, thisToken.startIndex - 1));
      }
      tokens.push(thisToken);
      tokens.forEach(token => {
        const nextSgrSegments = this.handleToken(token, chunkString);
        this.sgrSegments.push(...nextSgrSegments);
      });
      lastTokenEndIndex = thisToken.endIndex;
    }
    if (lastTokenEndIndex < chunkString.length - 1) {
      const nextSgrSegments = this.handleToken(new Token(chunkString.slice(lastTokenEndIndex + 1, chunkString.length), lastTokenEndIndex + 1, chunkString.length - 1), chunkString);
      this.sgrSegments.push(...nextSgrSegments);
    }
    
    this._sync(true);
  }
  
  handleToken(token: Token, chunkString: string): SgrSegment[] {
    const nextSgrSegments: SgrSegment[] = [];
    
    console.log(`token: ${token.str}, ${new Uint8Array(Buffer.from(token.str))} - startIndex:${token.startIndex}, endIndex: ${token.endIndex}`);
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
      nextSgrSegments.push(...this.processSgrCodes(token));
      this.inCR = false;
    } else if (token.isAnsiCode()) {
      // other ANSI codes, ignore for now
      console.log(`ignoring ansi code: ${new Uint8Array(Buffer.from(token.str))}`);
    } else { // any other character/sequence
      if (this.inCR) {
        this.writeIndex = this.data.lastIndexOf(10) + 1;
      }
      this.writeIndex = this.write(token.outputCharCodes(), this.writeIndex);
      this.inCR = false;
    }
    return nextSgrSegments;
  }
  
  processSgrCodes(token: Token): SgrSegment[] {
    const sgrcodes = token.sgrCodes();
    const ret: SgrSegment[] = [];
    sgrcodes?.forEach(sgrcode => {
      if (sgrcode === 0) {
        this.openSgrSegments.forEach(s => {
          s.endIndex = this.writeIndex - 1;
          ret.push(s);
        });
        this.openSgrSegments = [];
      } else if (sgrcode === 39) { // "default foreground"
        this.openSgrSegments.filter((s, i)=> {
          const ret = s.code >= 30 && s.code <= 38;
          if (ret) {
            this.openSgrSegments.splice(i, 1);
          }
          return ret;
        }).forEach(s => {
          s.endIndex = this.writeIndex - 1;
          ret.push(s);
        });
        
      } else {
        this.openSgrSegments.push({
          code: sgrcode,
          startIndex: this.writeIndex,
          endIndex: this.writeIndex
        });
      }
    });
    return ret;
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
    const buf = Buffer.from(`${cmd}\n`);
    this.write(buf, this.data.length);
    this.writeIndex += buf.length;
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
    
    const deleteIndexes: number[] = [];
    const shift = (endIndex - startIndex) + 1;
    this.sgrSegments.forEach((segment, i) => {
      if (segment.startIndex >= startIndex && segment.endIndex <= endIndex) {
        // wholly contained in the deleted section
        deleteIndexes.push(i);
      } else if (segment.endIndex > startIndex) {
        // end of segment overlaps deleted section
        segment.endIndex = startIndex - 1;
      } else if (segment.startIndex < endIndex && segment.endIndex > startIndex) {
        // beginning of segment overlaps deleted section
        segment.startIndex = endIndex + 1;
        segment.startIndex -= shift;
        segment.endIndex -= shift;
      } else if (segment.startIndex >= endIndex) {
        // wholly after the deleted section
        segment.startIndex -= shift;
        segment.endIndex -= shift;
      }
    });
    
    deleteIndexes.sort((a,b) => b - a).forEach(i => this.sgrSegments.splice(i, 1));
    
    if (this.writeIndex > startIndex) {
      this.writeIndex -= shift;
    }
    // if (this.writeIndex < 0) { 
    //   this.writeIndex = 0;
    // }
    
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
    const endIndex = (atIndex + value.length) - 1;
    
    this.sgrSegments.forEach((segment, i) => {
      if (segment.startIndex >= atIndex && segment.endIndex <= endIndex) {
        // wholly contained in the deleted section
        //deleteIndexes.push(i);
      } else if (segment.endIndex > atIndex) {
        // end of segment overlaps deleted section
        segment.endIndex = atIndex - 1;
      } else if (segment.startIndex < endIndex && segment.endIndex > atIndex) {
        // beginning of segment overlaps deleted section
        segment.startIndex = endIndex + 1;
        // segment.startIndex -= shift;
        // segment.endIndex -= shift;
      } else if (segment.startIndex >= endIndex) {
        // wholly after the deleted section
        // segment.startIndex -= shift;
        // segment.endIndex -= shift;
      }
    });
    
    const deleteIndexes: number[] = [];
    this.sgrSegments.forEach((segment, i) => {
      if (segment.endIndex <= segment.startIndex) {
        deleteIndexes.push(i);
      }
    });
    
    deleteIndexes.sort((a,b) => b - a).forEach(i => this.sgrSegments.splice(i, 1));
    
    const headroom = this.data.length - atIndex;
    if (headroom >= value.length) {
      // there's enough room, just write it
      try {
        this.data.set(value, atIndex);
      } catch(e) {
        console.log('here');
      }
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
    
    // console.log(`newdata: ${newdata}`);
    this.data = newdata;
  }
  
  _rootPath() {
    if (!vscode.workspace.workspaceFolders) { return process.env.HOME; }
    return vscode.workspace.workspaceFolders![0].uri.path;
  }
}