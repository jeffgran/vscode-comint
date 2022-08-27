import * as assert from 'assert';
import { ComintBuffer } from '../../comintBuffer';
import * as vscode from 'vscode';

import {passwordPrompt} from '../../passwordPrompt';

// See https://github.com/emacs-mirror/emacs/blob/3af9e84ff59811734dcbb5d55e04e1fdb7051e77/test/lisp/comint-tests.el
const comintTestPasswordStrings = [
  "foo@example.net's password: ", // ssh
  "Password for foo@example.org: ", // kinit
  "Password for 'https://foo@example.org':",           // git push Bug#20910
  "Please enter the password for foo@example.org: ",   // kinit
  "Kerberos password for devnull/root <at> GNU.ORG: ", // ksu
  "Enter passphrase: ", // ssh-add
  "Enter passphrase (empty for no passphrase): ", // ssh-keygen
  "Enter same passphrase again: ",     // ssh-keygen
  "Enter your password: ",             // python3 -m twine ... Bug#37636
  "Passphrase for key root@GNU.ORG: ", // plink
  "[sudo] password for user:", // Ubuntu sudo
  "[sudo] user 的密码：", // localized
  "doas (user@host) password:", // OpenBSD doas
  "PIN for user:",        // Bug#35523
  "Password (again):",
  "Enter password:",
  "Enter Auth Password:", // OpenVPN (Bug#35724)
  "Mot de Passe :", // localized (Bug#29729)
  "Passwort:", // localized
  "Password:"
];


const sleep = (milliseconds: number) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
};

suite('passwordPrompt', () => {
  comintTestPasswordStrings.forEach(passwordString => {
    test(`Matches password string: ${passwordString}`, () => {
      const match = passwordString.match(passwordPrompt);
      assert.ok(match);
    });
  });

  test('integration', (done) => {
    const cm = new ComintBuffer('name', vscode.Uri.parse('comint://name.sh'));
    const ret = cm.applyChunk('Password:')?.then((val) => {
      assert.equal(val, '');
      done();
    });
    sleep(1000);
    // can't figure out a way to actually enter text. but we can "accept", i.e. press return and send an empty password
    vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
  });
});