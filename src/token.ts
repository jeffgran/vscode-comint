// double \\ is because we have to put the literal backslash into the `new RegExp` below.
const escC = "\\x1bc"; // "reset to initial state" - treating this as the same as \e[0m for now..
const escControl = "\\x1b\\[[0-9]*[ABCDEFGJKST]"; // cursor movement and other ansi sequences. mostly ignored but we handle some of them properly
const escQuestion25 = "\\x1b\\[\\?25[hl]"; // hide/show cursor. We are ignoring these, but have to select them in order to drop/ignore the whole sequence
const bracketedPaste = "\\x1b\\[\\?2004[hl]"; // bracketed paste
const ansiSgr = "\\x1b\\[([0-9]+;?)+m"; // sgr codes with at least one number, maybe more separated by ;
const ansiSgrReset = "\\x1b\\[[0-9]*m"; // sgr codes with possibly no numbers, like `\e[m` - this is a synonym for `\e[0m`. I think we don't even need the [0-9]* here... but putting the * above causes issues because of greediness while parsing
const otherUnprintable = "[\\x00-\\x09\\x0b-\\x0c\\x0e-\\x1a\\x1c-\\x1f]+"; // other unprintables. Needs to be mutually exclusive so we are not selecting \r, \n, \e
const crlf = "\\r+\\n?"; // a sequence of 0 or more \r followed by 0 or 1 \n
const tokens = [escC, escControl, escQuestion25, bracketedPaste, ansiSgr, ansiSgrReset, otherUnprintable, crlf];
export const tokenRe = new RegExp(`(${tokens.join("|")})`, 'g');
//export const tokenRe = /(\x1bc|\x1b\[[0-9]*[ABCDEFGJKST]|\x1b\[\?25[hl]|\x1b\[([0-9]+;?)+m|\x1b\[[0-9]*m|[\x00-\x09\x0b-\x0c\x0e-\x1a\x1c-\x1f]+|\r+\n?)/g;
export class Token {
  str: string;
  startIndex: number;
  endIndex: number;

  constructor(one: RegExpExecArray);
  constructor(one: string, startIndex: number, endIndex: number);

  constructor(one: RegExpExecArray | string, startIndex?: number, endIndex?: number) {
    if (typeof one === 'string') {
      this.str = one;
      this.startIndex = startIndex!;
      this.endIndex = endIndex!;
    } else {
      this.str = one[0];
      this.startIndex = one.index;
      this.endIndex = one.index + one[0].length - 1;
    }
  }

  isCrlfSequence(): boolean {
    return this.str.startsWith('\r') && this.str.endsWith('\n');
  }

  isCrSequence(): boolean {
    return this.str.startsWith('\r') && this.str.endsWith('\r');
  }

  // Cursor Horizontal Absolute
  isCHA(): boolean {
    return this.str.match(/\x1b\[[0-9]*G/) !== null;
  }

  n(): number | undefined {
    let match = this.str.match(/^\x1b\[([0-9]*)/);
    if (match && match[1].length) {
      return parseInt(match[1], 10);
    }
  }

  isKillLine(): boolean {
    return this.str === '\x1b\[K' || this.str === '\x1b\[0K';
  }

  isKillLineBackward(): boolean {
    return this.str === '\x1b\[1K';
  }

  isKillWholeLine(): boolean {
    return this.str === '\x1b\[2K';
  }

  isAnsiCode(): boolean {
    return this.str.startsWith('\x1b');
  }

  isSgrCode(): boolean {
    return this.str.match(/^\x1b\[([0-9];?)*m/) !== null || this.isIndependentReset();
  }

  isIndependentReset(): boolean {
    return this.str === '\x1bc';
  }

  sgrCodes(): number[] | null {
    if (!this.isSgrCode()) { return null; }
    if (this.isIndependentReset()) { return [0]; }
    const match = this.str.match(/^\x1b\[(.*)m/);
    return match![1].split(';').map(s => s === '' ? 0 : parseInt(s, 10));
  }

  outputString(): string {
    if (this.isCrlfSequence()) {
      return '\n';
    } else if (!this.isAnsiCode()) {
      return this.str;
    } else {
      return '';
    }
  }
}