import { write } from "fs";

export type SgrSegment = {
  code: number,
  startIndex: number,
  endIndex: number,
};

type FilterResponse = {
  filteredBuffer: number[],
  openSegments: SgrSegment[],
  sgrSegments: SgrSegment[],
  writePosition: number[],
  killLine: boolean,
  inCR: boolean,
};

const tokenRe = /(\x1b\[[0-9]*[ABCDEFGJKST]|\x1b\[\?25[hl]|\x1b\[(?<code>[0-9]*;?)+m|\r+\n?|.)/g;

export class CursorMovement {
  inCR: boolean = false;
  openSgrSegments: SgrSegment[] = [];
  sgrSegments: SgrSegment[] = [];
  writeIndex: number = 0;
  
  write(value: Uint8Array, to: Uint8Array): Uint8Array {
    const headroom = to.length - this.writeIndex;
    if (headroom >= value.length) {
      // there's enough room, just write it
      to.set(value, this.writeIndex);
      this.writeIndex += value.length;
      return to;
    } else {
      // there's not enough room, make a bigger array and then write it
      const ret = new Uint8Array(to.length + (value.length - headroom));
      ret.set(to, 0);
      ret.set(value, this.writeIndex);
      this.writeIndex = ret.length;
      return ret;
    }
  }
  
  delete(from: Uint8Array, start: number, end: number): Uint8Array {
    const ret = new Uint8Array(from.length - (end - start));
    ret.set(from.slice(0, start+1), 0);
    ret.set(from.slice(end+1, from.length), start+1);
    return ret;
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
  
  applyChunk(fileData: Uint8Array, chunk: Uint8Array): Uint8Array {
    const chunkString = chunk.toString();
    let match: RegExpExecArray | null;
    
    
    while((match = tokenRe.exec(chunkString)) !== null) {
      const token = new Token(match[0]);
      //console.log(`token: ${token[0]}`, Buffer.from(token[0]));
      if (token.isCrlfSequence()) {
        this.inCR = false;
        fileData = this.write(token.outputCharCodes(), fileData);
      } else if (token.isCrSequence()) {
        if (match.index + match[0].length === chunkString.length) {
          this.inCR = true;
        } else {
          this.writeIndex = fileData.lastIndexOf(10) + 1;
        }
      } else if (token.isKillLine()) {
        fileData = this.delete(fileData, this.writeIndex - 1, fileData.length - 1);
      } else if (token.isSgrCode()) {
        this.processSgrCodes(token);
        this.inCR = false;
      } else if (token.isAnsiCode()) {
        // other ANSI codes, ignore for now
      } else { // any other character
        if (this.inCR) {
          this.writeIndex = fileData.lastIndexOf(10) + 1;
        }
        fileData = this.write(token.outputCharCodes(), fileData);
        this.inCR = false;
      }
    }
    
    return fileData;
  }
  }

class Token {
  str: string;
  constructor(str: string) {
    this.str = str;
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