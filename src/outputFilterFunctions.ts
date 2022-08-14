
export class CursorMovement {
  inSlashR: boolean = false;
  writePosition: number[] = [-1, -1];
  
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
        const nthLastNewlineIndex = 0 - this.writePosition[0]; // 1 for now. TODO: nth lookup?
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
    
    // figure out how much the array needs to be expanded by, if any
    // then overwrite. TODO: if we didn't end at the _end_ of the final data,
    // we have to keep track of where to start from next time.
    const writeHeadroom = fileData.length - writeAtIndex;
    if (writeHeadroom >= filteredChunk.length) {
      fileData.set(filteredChunk, writeAtIndex);
      return fileData;
    } else {
      // new expanded buffer
      const returnData = new Uint8Array(fileData.length + (filteredChunk.length - writeHeadroom));
      returnData.set(fileData, 0);
      returnData.set(filteredChunk, writeAtIndex);
      return returnData;
    }
    
  }
  
  filter(input: Uint8Array): Uint8Array {
    this.writePosition = [-1, -1];
    let lastNewlineIndex = -1;
    
    let filteredBuffer: number[] = [];
    input.forEach((v, i) => {
      if (v === 8) { // Backspace
        this.inSlashR = false;
        if (filteredBuffer.length > 0) {
          filteredBuffer.splice(filteredBuffer.length - 1);
        } else {
          this.writePosition[1] = this.writePosition[1] - 1;
        }
      } else if (v === 10) { // Newline
        this.inSlashR = false;
        filteredBuffer.push(v);
        lastNewlineIndex = filteredBuffer.length - 1;
      } else if (v === 13) { // Carriage Return
        if (input[i+1] === 10 || input[i+1] === 13 || this.inSlashR || i === input.length - 1) {
          // nothing
        } else if (lastNewlineIndex >= 0) {
          filteredBuffer.splice(lastNewlineIndex);
        } else {
          this.writePosition = [-1, 0];
        }
        this.inSlashR = true;
      } else {
        filteredBuffer.push(v);
        if (this.inSlashR) {
          this.writePosition = [-1, 0];
        }
        this.inSlashR = false;
      }
    });
    return Buffer.from(filteredBuffer);
  }
}