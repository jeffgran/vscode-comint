import * as vscode from 'vscode';
import { MemFS } from './fileSystemProvider';

export class ComintCompletionProvider implements vscode.CompletionItemProvider {
  memFs: MemFS;

  constructor(memfs: MemFS) {
    this.memFs = memfs;
  }

  async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
    const cm = this.memFs.getComintBuffer(document.uri);
    const cmd = cm.getInput();
    const items: vscode.CompletionItem[] = [];
    await cm.withRedirection(`${cmd}\x1b*'\x01echo '\x05\n`, (data) => {
      console.log('here! in withRedirection callback', data);
      // strip out the {cmd} off the front if it is there
      if (data.slice(0, cmd.length) === cmd) {
        data = data.slice(cmd.length);
      }
      data.split(/\s+/).forEach(str => {
        items.push(new vscode.CompletionItem(str));
      });
    });

    return items;
  }
}