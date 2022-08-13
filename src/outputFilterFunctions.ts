import { ConsoleReporter } from "@vscode/test-electron";

export class OutputFilterFunctions {
  //functions: (in: Uint8Array) => Uint8Array;
  functions: OutputFilterFunction[];
  
  constructor() {
    this.functions = [
      new CursorMovement()
    ];
  }
  
  filter(data: Uint8Array): Uint8Array  {
    return this.functions.reduce((acc, func) => {
      return func.filter(acc);
    }, data);
  }
}

abstract class OutputFilterFunction {
  abstract filter(input: Uint8Array): Uint8Array;
}

export class CursorMovement extends OutputFilterFunction {
  filter(input: Uint8Array): Uint8Array {
    let lastNewlineIndex = 0; // TODO save state across runs
    //let writeHead = 0;
    let filteredBuffer: number[] = [];
    input.forEach((v, i) => {
      if (v === 8) { // Backspace
        filteredBuffer.splice(filteredBuffer.length - 1);
      } else if (v === 10) { // Newline
        filteredBuffer.push(v);
        lastNewlineIndex = filteredBuffer.length - 1;
      } else if (v === 13) { // Carriage Return
        if (input[i+1] === 10 || i === input.length - 1) {
          // nothing
        } else {
          filteredBuffer.splice(lastNewlineIndex);
        }
      } else {
        filteredBuffer.push(v);
      }
    });
    return Buffer.from(filteredBuffer);
  }
}