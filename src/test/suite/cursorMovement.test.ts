import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { CursorMovement } from '../../outputFilterFunctions';

suite('CursorMovement', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Simple /r/n at the end of the line', () => {
		const cm = new CursorMovement();
		const input = "foo\r\n";
		const output = cm.filter(Buffer.from(input));
		assert.deepEqual(output.toString(), "foo\n");
	});

	test('dangling /r at the end, then /r/n to start next chunk', () => {
		const cm = new CursorMovement();
		const input1 = "Pictures\r";
		const input2 = "\r\nPublic\r\n";
		const output1 = cm.filter(Buffer.from(input1));
		const output2 = cm.filter(Buffer.from(input2));
		const finaloutput = output1.toString() + output2.toString();
		assert.deepEqual(finaloutput, "Pictures\nPublic\n");
	});
});
