import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { CursorMovement } from '../../outputFilterFunctions';

suite('CursorMovement #applyChunk', () => {
	test('pv', () => {
		const cm = new CursorMovement();
		const input1 = '  720MiB 0:00:01 [ 720MiB/s] [=======>                          ] 25% ETA 0:00:02\r';
		const input2 = ' 1.43GiB 0:00:02 [ 739MiB/s] [================>                 ] 51% ETA 0:00:01\r';
		const input3 = ' 2.12GiB 0:00:03 [ 714MiB/s] [========================>         ] 75% ETA 0:00:00\r';
		const input4 = ' 2.73GiB 0:00:04 [ 624MiB/s] [===============================>  ] 97% ETA 0:00:00\r';
		const input5 = ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \r\r\n';
		
		const output1 = cm.applyChunk(Buffer.from(''), Buffer.from(input1));
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(output1).toString(), '  720MiB 0:00:01 [ 720MiB/s] [=======>                          ] 25% ETA 0:00:02');
		
		const output2 = cm.applyChunk(output1, Buffer.from(input2));
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(output2).toString(), ' 1.43GiB 0:00:02 [ 739MiB/s] [================>                 ] 51% ETA 0:00:01');
		
		const output3 = cm.applyChunk(output2, Buffer.from(input3));
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(output3).toString(), ' 2.12GiB 0:00:03 [ 714MiB/s] [========================>         ] 75% ETA 0:00:00');
		
		const output4 = cm.applyChunk(output3, Buffer.from(input4));
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(output4).toString(), ' 2.73GiB 0:00:04 [ 624MiB/s] [===============================>  ] 97% ETA 0:00:00');
		
		const output5 = cm.applyChunk(output4, Buffer.from(input5));
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(output5).toString(), ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \n');
		
		const output6 = cm.applyChunk(output5, Buffer.from('next prompt >'));
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(output6).toString(), ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \nnext prompt >');
	});
	
	test('/r with partial line', () => {
		const cm = new CursorMovement();
		
		const input1 = 'password\rsafe';
		const input2 = 'ty first!\r\n';
		
		const output1 = cm.applyChunk(Buffer.from(''), Buffer.from(input1));
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(output1).toString(), 'safeword');
		
		const output2 = cm.applyChunk(output1, Buffer.from(input2));
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(output2).toString(), 'safety first!\n');	
	});
	
	test ('/r and ESC[K to kill line (npm)', () => {
		const cm = new CursorMovement();
		const input1 = '[\x1b[100;90m..................\x1b[0m] \ reify: \x1b[43;40mtiming\x1b[0m \x1b[35marborist:longer-name\x1b[0m Completed in 0ms\x1b[0m\x1b[K\r';
		const output1 = cm.applyChunk(Buffer.from(''), Buffer.from(input1));
		assert.deepEqual(Buffer.from(output1).toString(), '[..................] \ reify: timing arborist:longer-name Completed in 0ms');
		
		const input2 = '[\x1b[107;97m#########\x1b[0m\x1b[100;90m.........\x1b[0m] \ idealTree: \x1b[43;40mtiming\x1b[0m \x1b[35midealTree\x1b[0m Completed in 80ms\x1b[0m\x1b[K\r';
		const output2 = cm.applyChunk(output1, Buffer.from(input2));
		assert.deepEqual(Buffer.from(output2).toString(), '[#########.........] \ idealTree: timing idealTree Completed in 80ms');

		const input3 = '\r\x1b[K\x1b[?25h';
		const output3 = cm.applyChunk(output2, Buffer.from(input3));
		assert.deepEqual(Buffer.from(output3).toString(), '');
		
		const input4 = '\r\nup to date.';
		const output4 = cm.applyChunk(output3, Buffer.from(input4));
		assert.deepEqual(Buffer.from(output4).toString(), '\nup to date.');
	});
});
