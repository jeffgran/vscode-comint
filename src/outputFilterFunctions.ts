import { write } from "fs";

export type SgrSegment = {
  code: number,
  startIndex: number,
  endIndex: number,
};

const tokenRe = /(\x1b\[[0-9]*[ABCDEFGJKST]|\x1b\[\?25[hl]|\x1b\[(?<code>[0-9]*;?)+m|\r+\n?|.)/g;

export class CursorMovement {
  inSlashR: boolean = false;
  killLine: boolean = false;
  writePosition: number[] = [-1, -1];
  nextWritePosition: number[] = [-1, -1];
  openSgrSegments: SgrSegment[] = [];
  sgrSegments: SgrSegment[] = [];
  
  applyChunk(fileData: Uint8Array, chunk: Uint8Array): Uint8Array {
    const filteredChunk = this.filter(chunk);
    
    let writeAtIndex: number;
    
    // note, writePosition[0] is always < 0 - doesn't make sense to count from the top
    if (this.writePosition[0] < -1 || this.writePosition[1] >= 0) {
      if (this.writePosition[1] < 0) {
        // find last (nth) newline where n = -1 - wp[0]
        // write head is that + wp[1] (it's negative so this is a subtraction)
        writeAtIndex = fileData.lastIndexOf(10) + 1; // TODO: won't work for real, need custom function, need nth last indexof
        // n.b. we will never hit this case yet, no tests and no known cases where this would happen. can't \r back 2 lines, but maybe with SGR codes?
      } else {
        // find last (nth) newline where n = 0 - wp[0]
        // write head is that + wp[1]
        // e.g. [-1, 0]: nth newline = 0 - -1 => 1
        // const nthLastNewlineIndex = 0 - this.writePosition[0]; // 1 for now. TODO: nth lookup?
        writeAtIndex = fileData.lastIndexOf(10) + 1; // 10 === \n
      }
    } else {
      // last newline does not matter so don't waste time.
      // this is the most common case (-1, -1)
      // just concat the two arrays together
      writeAtIndex = fileData.length;
    }
    
    if (this.writePosition[1] < 0) {
      writeAtIndex = writeAtIndex + (this.writePosition[1] + 1); // because -1 really means "at the end", not "overwrite the last character"
    } else {
      writeAtIndex = writeAtIndex + (this.writePosition[1]);
    }
    
    this.sgrSegments.forEach(s => {
      s.startIndex += writeAtIndex;
      s.endIndex += writeAtIndex;
    });
    
    
    // figure out how much the array needs to be expanded by, if any
    // then overwrite. 
    const writeHeadroom = fileData.length - writeAtIndex;
    
    
    if (writeHeadroom >= filteredChunk.length) {
      if (writeHeadroom > filteredChunk.length) {
        // if we won't end at the _end_ of the final data,
        // we have to keep track of where to start from next time.
        this.writePosition[1] += writeHeadroom - filteredChunk.length;
      }

      if (this.killLine) {
        const diff = writeHeadroom - filteredChunk.length;
        if (diff > 0) {}
        const returnData = new Uint8Array(fileData.length - diff);
        returnData.set(fileData.slice(0, fileData.length - diff), 0);
        returnData.set(filteredChunk, writeAtIndex);
        return returnData;
      } else {
        fileData.set(filteredChunk, writeAtIndex);
        return fileData;
      }
    } else {
      // new expanded buffer
      const diff = filteredChunk.length - writeHeadroom;
      const returnData = new Uint8Array(fileData.length + diff);
      returnData.set(fileData, 0);
      returnData.set(filteredChunk, writeAtIndex);
      return returnData;
    }
    
  }
  
  filter(input: Uint8Array): Uint8Array {
    this.writePosition = this.nextWritePosition;
    this.nextWritePosition = [-1, -1];
    let lastNewlineIndex = -1;
    let filteredBuffer: number[] = [];
    let outputWriteIndex = 0;
    this.sgrSegments = [];
    this.killLine = false;
    let token: RegExpExecArray | null;
    const inputString = input.toString();


    while((token = tokenRe.exec(inputString)) !== null) {
      //console.log(`token: ${token[0]}`, Buffer.from(token[0]));
      if (token[0] === '\b') {
        if (outputWriteIndex > 0) {
          outputWriteIndex = outputWriteIndex - 1;
        } else {
          this.writePosition[1] = this.writePosition[1] - 1;
        }
      } else if (token[0].endsWith('\n')) { // \r*\n
        this.inSlashR = false;
        if (outputWriteIndex === filteredBuffer.length) {
          filteredBuffer.push(10);
        } else {
          filteredBuffer[outputWriteIndex] = 10;
        }
        outputWriteIndex = outputWriteIndex + 1;
        lastNewlineIndex = outputWriteIndex;
      } else if (token[0].endsWith('\r')) {
        if (token.index + token[0].length === inputString.length) {
          this.inSlashR = true;
        } else if (lastNewlineIndex >= 0) {
          outputWriteIndex = lastNewlineIndex;
          outputWriteIndex += 1;
        } else {
          this.writePosition = [-1, 0];
          outputWriteIndex = 0;
        }
      } else if (token[0] === '\x1b\[K') { // 'kill to end of line' code
        filteredBuffer.splice(outputWriteIndex);
        this.killLine = true;
      } else if (token[0].length > 1 && token[0][0] === '\x1b' && token[0].endsWith('m')) {
        const sgrcode = token.groups!.code;
        if (sgrcode === '0' || sgrcode === '') {
          this.openSgrSegments.forEach(s => {
            s.endIndex = outputWriteIndex - 1;
            this.sgrSegments.push(s);
          });
          this.openSgrSegments = [];
        } else {
          this.openSgrSegments.push({
            code: parseInt(sgrcode, 10),
            startIndex: outputWriteIndex,
            endIndex: outputWriteIndex - 1
          });
        }
        this.inSlashR = false;
      } else if (token[0].startsWith('\x1b[')) {
        // other ANSI codes, ignore for now
      } else { // any other character
        if (this.inSlashR) {
          if (lastNewlineIndex >= 0) {
            outputWriteIndex = lastNewlineIndex + 1;
          } else {
            this.writePosition = [-1, 0];
            outputWriteIndex = 0;
          }
        }
        if (outputWriteIndex === filteredBuffer.length) {
          filteredBuffer.push(token[0].charCodeAt(0));
        } else {
          filteredBuffer[outputWriteIndex] = token[0].charCodeAt(0);
        }
        outputWriteIndex += 1;
        this.inSlashR = false;
      }
    }

    if (outputWriteIndex < filteredBuffer.length) {
      this.nextWritePosition[1] -= filteredBuffer.length - outputWriteIndex;
    }
    return Buffer.from(filteredBuffer);
  }
}