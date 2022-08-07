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
  
  constructor(name: string) {
    this.type = vscode.FileType.File;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = 0;
    this.name = name;
    this.promptRanges = [];
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
      // if (entry.data === undefined) {
      //     entry.data = Buffer.from(data);
      //     entry.size = Buffer.from(data).length;
      // } else {
      //     entry.data.set(Buffer.from(data), entry.data.length);
      //     entry.size = entry.size + Buffer.from(data).length;
      // }
      // this._fireSoon({ type: vscode.FileChangeType.Changed, uri: e.uri });
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
  
}