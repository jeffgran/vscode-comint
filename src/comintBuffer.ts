import * as vscode from 'vscode';

import {getCoreNodeModule} from './getCoreNodeModule';
const {spawn} = getCoreNodeModule('node-pty');
import { Token, tokenRe } from './token';
import { passwordPrompt } from './passwordPrompt';

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
  content: string = '';
  proc?: any; // not sure how to import typings from the core module
  promptRanges: [number, number][];

  inCR: boolean = false;
  openSgrSegments: SgrSegment[] = [];
  writeIndex: number = 0;

  sgrSegments: SgrSegment[] = [];

  outputCallback?: ((data: string) => void);

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

  get data(): Uint8Array {
    return Buffer.from(this.content);
  }

  startComint(uri: vscode.Uri, editor: vscode.TextEditor) {
    console.log('startComint');
    this.editor = editor;

    const shellFile = vscode.workspace.getConfiguration('comint').get('shellFile', 'bash');
    const shellFileArgs = vscode.workspace.getConfiguration('comint').get('shellFileArgs', []);
    const initCommands = vscode.workspace.getConfiguration('comint').get('shellInitCommands', []);

    this.proc = spawn(shellFile, shellFileArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: this._rootPath(),
      env: process.env
    });

    initCommands.forEach(c => {
      this.proc?.write(`${c}\n`);
    });

    this.proc.onData(this.dispatchData.bind(this));
  }

  dispatchData(data: string) {
    if (this.outputCallback !== undefined) {
      this.outputCallback(data);
    } else {
      this.applyChunk(data);
    }
  }

  applyChunk(chunkString: string): Thenable<string | undefined> | undefined {
    //console.log('[proc.onData] new data:', chunkString.replace(/\r/g, "/r").replace(/\n/g, "/n\n").replace(/\x1b/g, '/x1b'));
    //console.log('[proc.onData] new data raw:', Buffer.from(chunkString));
    let match: RegExpExecArray | null;

    let lastTokenEndIndex = -1;
    const tokens: Token[] = [];
    while((match = tokenRe.exec(chunkString)) !== null) {
      const thisToken = new Token(match);
      if (thisToken.startIndex > lastTokenEndIndex + 1) {
        tokens.push(new Token(chunkString.slice(lastTokenEndIndex + 1, thisToken.startIndex), lastTokenEndIndex + 1, thisToken.startIndex - 1));
      }
      tokens.push(thisToken);
      lastTokenEndIndex = thisToken.endIndex;
    }
    if (lastTokenEndIndex < chunkString.length - 1) {
      tokens.push(new Token(chunkString.slice(lastTokenEndIndex + 1, chunkString.length), lastTokenEndIndex + 1, chunkString.length - 1));
    }

    tokens.forEach(token => {
      this.sgrSegments.push(...this.handleToken(token, chunkString));
    });

    // console.log('this.sgrSegments', JSON.stringify(this.sgrSegments));
    // console.log('this.openSgrSegments', JSON.stringify(this.openSgrSegments));

    this._sync(true);

    return this.checkForPasswordPrompt();
  }

  withRedirection(cmd: string, cb: (data: string) => void): Promise<void> {
    return new Promise((resolve) => {
      this.outputCallback = (data: string) => {
        if (data.slice(data.lastIndexOf('\n')+1).match(this.promptRegex())) {
          cb(data.slice(0, data.lastIndexOf('\n')));
          console.log('resolving');
          this.outputCallback = undefined;
          resolve();
        } else {
          cb(data);
        }
      };
      this.sendChars(cmd);
    });
  }

  handleToken(token: Token, chunkString: string): SgrSegment[] {
    const nextSgrSegments: SgrSegment[] = [];

    console.log(`token: ${token.str}, ${new Uint8Array(Buffer.from(token.str))} - startIndex:${token.startIndex}, endIndex: ${token.endIndex}`);
    if (token.isCrlfSequence()) {
      this.inCR = false;
      this.writeIndex = this.write(token.outputString(), this.writeIndex);
    } else if (token.isCrSequence()) {
      if (token.endIndex === chunkString.length - 1) {
        this.inCR = true;
      } else {
        this.writeIndex = this.content.lastIndexOf('\n') + 1;
      }
    } else if (token.isKillLine()) {
      if (this.writeIndex !== this.content.length) {
        this.delete(this.writeIndex, this.content.length - 1);
      }
    } else if (token.isKillWholeLine()) {
      this.delete(this.content.lastIndexOf('\n') + 1, this.content.length - 1);
    } else if (token.isCHA()) {
      const n = token.n() || 1;
      this.writeIndex = this.content.slice(0, this.writeIndex).lastIndexOf('\n') + n;
    } else if (token.isSgrCode()) {
      nextSgrSegments.push(...this.processSgrCodes(token));
      this.inCR = false;
    } else if (token.isAnsiCode()) {
      // other ANSI codes, ignore for now
      console.log(`ignoring ansi code: ${new Uint8Array(Buffer.from(token.str))}`);
    } else { // any other character/sequence
      if (this.inCR) {
        this.writeIndex = this.content.lastIndexOf('\n') + 1;
      }
      this.writeIndex = this.write(token.outputString(), this.writeIndex);
      this.inCR = false;
    }
    return nextSgrSegments;
  }

  processSgrCodes(token: Token): SgrSegment[] {
    const sgrcodes = token.sgrCodes();
    console.log('sgrCodes:', sgrcodes);
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
          const ret: boolean = s.code >= 30 && s.code <= 38;
          if (ret) {
            this.openSgrSegments.splice(i, 1);
          }
          return ret;
        }).forEach(s => {
          s.endIndex = this.writeIndex - 1;
          ret.push(s);
        });

      } else if (sgrcode === 49) { // "default background"
        this.openSgrSegments.filter((s, i)=> {
          const ret: boolean = s.code >= 40 && s.code <= 48;
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

  promptRegex(): RegExp {
    const promptRegexStr = vscode.workspace.getConfiguration('comint').get('promptRegex', '');
    return new RegExp(`${promptRegexStr}`, 'mg');
  }

  getPromptRanges(): vscode.Range[] {
    if (this.editor === undefined) { return []; }

    return this.promptRanges.map(([start, end]) => {
      return new vscode.Range( this.editor!.document.positionAt(start), this.editor!.document.positionAt(end));
    });
  }

  updatePromptRanges() {
    const ranges: [number, number][] = [];
    let match: RegExpExecArray | null;
    const pre = this.promptRegex();
    while((match = pre.exec(this.content)) !== null) {
      const startpos = match.index;
      const endpos = startpos + match[0].length;
      ranges.push([startpos, endpos]);
    }
    this.promptRanges = ranges;
  }

  pushInput() {
    const cmd = this.getInput();
    this.proc?.write(`${cmd}\n`);
    const str = `${cmd}\n`;
    this.writeIndex = this.write(str, this.content.length);
    this._sync(true);
    this._inputRing.push(cmd);
    this._inputRingIndex = this._inputRing.length;
  }

  getInput(): string {
    if (this.editor === undefined) { return ''; }

    const range = this.editor.selection;
    let cmd: string;
    if (this.editor.selection.isEmpty) {
      const line = this.editor.document.lineAt(this.editor.selection.end);
      const prompts = this.getPromptRanges();
      const intersection = prompts.map(p => line.range.intersection(p)).find(p => p);
      if (intersection) {
        cmd = this.editor.document.getText(new vscode.Range(intersection.end, line.range.end));
      } else {
        cmd = line.text;
      }
    } else {
      cmd = this.editor.document.getText(range);
    }
    return cmd;
  }

  sendChars(chars: string) {
    this.proc?.write(chars);
  }

  checkForPasswordPrompt(): Thenable<string | undefined> | undefined {
    const m = this.content.match(passwordPrompt);
    if (m && m.index !== undefined && m.index + m[0].length === this.content.length) {
      return vscode.window.showInputBox({password: true, title: m[0]}).then(val => {
        this.proc?.write(val + "\n");
        return val;
      });
    }
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
    return new vscode.Range(lastPrompt.end, this.editor.document.lineAt(this.editor.document.lineCount - 1).range.end);
  }

  delete(startIndex: number, endIndex: number) {
    this._delete(startIndex, endIndex);

    const deleteIndexes: number[] = [];
    const shift = (endIndex - startIndex) + 1;
    this.sgrSegments.forEach((segment, i) => {
      if (segment.startIndex >= startIndex && segment.endIndex <= endIndex) {
        // wholly contained in the deleted section
        deleteIndexes.push(i);
      } else if (segment.endIndex >= startIndex && segment.startIndex < startIndex) {
        // end of segment overlaps deleted section
        segment.endIndex = startIndex - 1;
      } else if (segment.startIndex <= endIndex && segment.endIndex > endIndex) {
        // beginning of segment overlaps deleted section
        segment.startIndex = endIndex + 1;
        segment.startIndex -= shift;
        segment.endIndex -= shift;
      } else if (segment.startIndex > endIndex) {
        // wholly after the deleted section
        segment.startIndex -= shift;
        segment.endIndex -= shift;
      }
    });

    deleteIndexes.sort((a,b) => b - a).forEach(i => this.sgrSegments.splice(i, 1));

    if (this.writeIndex > startIndex) {
      this.writeIndex -= shift;
    }

    this._sync(true);
  }

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

  write(value: string, atIndex: number): number {
    const endIndex = (atIndex + value.length) - 1;

    const deleteIndexes: number[] = [];

    this.sgrSegments.forEach((segment, i) => {
      if (segment.startIndex >= atIndex && segment.endIndex <= endIndex) {
        // wholly contained in the deleted section
        deleteIndexes.push(i);
      } else if (segment.endIndex >= atIndex && segment.startIndex < atIndex) {
        // end of segment overlaps deleted section
        segment.endIndex = atIndex - 1;
      } else if (segment.startIndex <= endIndex && segment.endIndex > endIndex) {
        // beginning of segment overlaps deleted section
        segment.startIndex = endIndex + 1;
      }
    });

    deleteIndexes.sort((a,b) => b - a).forEach(i => this.sgrSegments.splice(i, 1));

    const headroom = this.content.length - atIndex;
    if (headroom >= value.length) {
      // there's enough room
      this.content = this.content.slice(0, atIndex) + value + this.content.slice(atIndex + value.length);
      return atIndex + value.length;
    } else {
      // there's not enough room
      this.content = this.content.slice(0, atIndex) + value;
      return this.content.length;
    }
  }

  _delete(startIndex: number, endIndex: number) {
    if (!this.content) { throw new Error("Tried to delete but there is no data."); }
    if (endIndex < startIndex) { throw new Error(`Invalid indices. startIndex (${startIndex}) is greater than endIndex ${endIndex}.`); }

    const sizeToDelete = (endIndex - startIndex) + 1;
    if (sizeToDelete > this.content.length) { throw new Error(`Cannot delete more data than is in the buffer! startIndex: ${startIndex}, endIndex: ${endIndex}, buffer size: ${this.content.length}`); }

    this.content = this.content.slice(0, startIndex) + this.content.slice(endIndex+1, this.content.length);
  }

  _rootPath() {
    if (!vscode.workspace.workspaceFolders) { return process.env.HOME; }
    return vscode.workspace.workspaceFolders![0].uri.path;
  }
}