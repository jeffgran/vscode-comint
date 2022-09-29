# comint README

Inspired by Emacs' comint-mode. Your keyboard shortcuts all work because it's just a regular text editor, with a shell inside.

## Features

Run a shell (or other repl) in a text editor.

* Use commands `comint.inputRingPrevious` and `comint.inputRingNext` like your up/down arrows in the terminal emulator, to cycle through previous commands.
* Use command `comint.sendCtrlC` to send a control-c signal to the process.
* ANSI/SGR codes for colors and some cursor movement are rendered properly (or ignored if they do not apply).
* tab-completion for bash kinda works, but only for `stty -echo` for now.

## Roadmap

See notes/comments at the top of `extension.ts`. TODO move them somewhere better.

## Requirements

This doesn't work in vscode.dev or similar. You must have the ability to run an interactive process.

## Extension Settings

This extension contributes the following settings:

* `comint.shellFile`:
* `comint.shellFileArgs`:
* `comint.shellInitCommands`:
* `comint.promptRegex`:

## Known Issues

Only tested on osx with bash 5.x

## Unknown Issues

Several.