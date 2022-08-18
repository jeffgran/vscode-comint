export const tokenRe = /(\x1b\[[0-9]*[ABCDEFGJKST]|\x1b\[\?25[hl]|\x1b\[(?<code>[0-9]*;?)+m|\r+\n?|.)/g;

export class Token {
  str: string;
  startIndex: number;
  endIndex: number;

  constructor(match: RegExpExecArray) {
    this.str = match[0];
    this.startIndex = match.index;
    this.endIndex = match.index + match[0].length - 1;
  }
  
  isCrlfSequence(): boolean {
    return this.str.startsWith('\r') && this.str.endsWith('\n');
  }
  
  isCrSequence(): boolean {
    return this.str.startsWith('\r') && this.str.endsWith('\r');
  }
  
  isKillLine(): boolean {
    return this.str === '\x1b\[K';
  }
  
  isAnsiCode(): boolean {
    return this.str.startsWith('\x1b[');
  }
  
  isSgrCode(): boolean {
    return this.str.match(/^\x1b\[([0-9];?)*m/) !== null;
  }
  
  sgrCodes(): number[] | null {
    if (!this.isSgrCode()) { return null; }
    const match = this.str.match(/^\x1b\[(.*)m/);
    return match![1].split(';').map(s => s === '' ? 0 : parseInt(s, 10));
  }
  
  outputCharCodes(): Uint8Array {
    if (this.isCrlfSequence()) {
      return Buffer.from('\n');
    } else if (!this.isAnsiCode()) {
      return Buffer.from(this.str);
    } else {
      return new Uint8Array(0);
    }
  }
}