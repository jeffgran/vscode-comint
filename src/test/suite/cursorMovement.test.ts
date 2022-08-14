import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { CursorMovement } from '../../outputFilterFunctions';

suite('CursorMovement #filter', () => {
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
		assert.equal(cm.inSlashR, true);
		assert.deepEqual(cm.writePosition, [-1, -1]);
		assert.equal(output1.toString(), 'Pictures');
		
		const output2 = cm.filter(Buffer.from(input2));
		assert.equal(cm.inSlashR, false);
		assert.deepEqual(cm.writePosition, [-1, -1]);
		assert.equal(output2.toString(), '\nPublic\n');
		
		const finaloutput = output1.toString() + output2.toString();
		assert.deepEqual(finaloutput, "Pictures\nPublic\n");
	});
	
	// head -c 3000000000 /dev/urandom | pv -s 3000000000 > /dev/null
	test('pv', () => {
		const cm = new CursorMovement();
		const input1 = '  720MiB 0:00:01 [ 720MiB/s] [=======>                          ] 25% ETA 0:00:02\r';
		const input2 = ' 1.43GiB 0:00:02 [ 739MiB/s] [================>                 ] 51% ETA 0:00:01\r';
		const input3 = ' 2.12GiB 0:00:03 [ 714MiB/s] [========================>         ] 75% ETA 0:00:00\r';
		const input4 = ' 2.73GiB 0:00:04 [ 624MiB/s] [===============================>  ] 97% ETA 0:00:00\r';
		const input5 = ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \r\r\n';
		
		const output1 = cm.filter(Buffer.from(input1));
		assert.equal(cm.inSlashR, true);
		assert.deepEqual(cm.writePosition, [-1, -1]);
		assert.deepEqual(output1.toString(), '  720MiB 0:00:01 [ 720MiB/s] [=======>                          ] 25% ETA 0:00:02');
		
		const output2 = cm.filter(Buffer.from(input2));
		assert.equal(cm.inSlashR, true);
		assert.deepEqual(cm.writePosition, [-1, 0]);
		assert.deepEqual(output2.toString(), ' 1.43GiB 0:00:02 [ 739MiB/s] [================>                 ] 51% ETA 0:00:01');
		
		const output3 = cm.filter(Buffer.from(input3));
		assert.equal(cm.inSlashR, true);
		assert.deepEqual(cm.writePosition, [-1, 0]);
		assert.deepEqual(output3.toString(), ' 2.12GiB 0:00:03 [ 714MiB/s] [========================>         ] 75% ETA 0:00:00');
		
		const output4 = cm.filter(Buffer.from(input4));
		assert.equal(cm.inSlashR, true);
		assert.deepEqual(cm.writePosition, [-1, 0]);
		assert.deepEqual(output4.toString(), ' 2.73GiB 0:00:04 [ 624MiB/s] [===============================>  ] 97% ETA 0:00:00');
		
		const output5 = cm.filter(Buffer.from(input5));
		assert.equal(cm.inSlashR, false);
		assert.deepEqual(cm.writePosition, [-1, 0]);
		assert.deepEqual(output5.toString(), ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \n');
		
		const output6 = cm.filter(Buffer.from('next prompt >'));
		assert.equal(cm.inSlashR, false);
		assert.deepEqual(cm.writePosition, [-1, -1]);
		assert.deepEqual(output6.toString(), 'next prompt >');
	});
});

suite('CursorMovement #applyChunk', () => {
	test('pv', () => {
		const cm = new CursorMovement();
		const input1 = '  720MiB 0:00:01 [ 720MiB/s] [=======>                          ] 25% ETA 0:00:02\r';
		const input2 = ' 1.43GiB 0:00:02 [ 739MiB/s] [================>                 ] 51% ETA 0:00:01\r';
		const input3 = ' 2.12GiB 0:00:03 [ 714MiB/s] [========================>         ] 75% ETA 0:00:00\r';
		const input4 = ' 2.73GiB 0:00:04 [ 624MiB/s] [===============================>  ] 97% ETA 0:00:00\r';
		const input5 = ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \r\r\n';
		
		const output1 = cm.applyChunk(Buffer.from(''), Buffer.from(input1));
		assert.equal(cm.inSlashR, true);
		assert.deepEqual(cm.writePosition, [-1, -1]);
		assert.deepEqual(Buffer.from(output1).toString(), '  720MiB 0:00:01 [ 720MiB/s] [=======>                          ] 25% ETA 0:00:02');
		
		const output2 = cm.applyChunk(output1, Buffer.from(input2));
		assert.equal(cm.inSlashR, true);
		assert.deepEqual(cm.writePosition, [-1, 0]);
		assert.deepEqual(Buffer.from(output2).toString(), ' 1.43GiB 0:00:02 [ 739MiB/s] [================>                 ] 51% ETA 0:00:01');
		
		const output3 = cm.applyChunk(output2, Buffer.from(input3));
		assert.equal(cm.inSlashR, true);
		assert.deepEqual(cm.writePosition, [-1, 0]);
		assert.deepEqual(Buffer.from(output3).toString(), ' 2.12GiB 0:00:03 [ 714MiB/s] [========================>         ] 75% ETA 0:00:00');
		
		const output4 = cm.applyChunk(output3, Buffer.from(input4));
		assert.equal(cm.inSlashR, true);
		assert.deepEqual(cm.writePosition, [-1, 0]);
		assert.deepEqual(Buffer.from(output4).toString(), ' 2.73GiB 0:00:04 [ 624MiB/s] [===============================>  ] 97% ETA 0:00:00');
		
		const output5 = cm.applyChunk(output4, Buffer.from(input5));
		assert.equal(cm.inSlashR, false);
		assert.deepEqual(cm.writePosition, [-1, 0]);
		assert.deepEqual(Buffer.from(output5).toString(), ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \n');
		
		const output6 = cm.applyChunk(output5, Buffer.from('next prompt >'));
		assert.equal(cm.inSlashR, false);
		assert.deepEqual(cm.writePosition, [-1, -1]);
		assert.deepEqual(Buffer.from(output6).toString(), ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \nnext prompt >');
	});
	
	test('/r with partial line', () => {
		const cm = new CursorMovement();

		const input1 = 'password\rsafe';
		const input2 = 'ty first!\r\n';
	
		const output1 = cm.applyChunk(Buffer.from(''), Buffer.from(input1));
		assert.equal(cm.inSlashR, false);
		assert.deepEqual(cm.nextWritePosition, [-1, -5]);
		assert.deepEqual(Buffer.from(output1).toString(), 'safeword');
		
		const output2 = cm.applyChunk(output1, Buffer.from(input2));
		assert.equal(cm.inSlashR, false);
		assert.deepEqual(cm.nextWritePosition, [-1, -1]);
		assert.deepEqual(Buffer.from(output2).toString(), 'safety first!\n');	
	});
});