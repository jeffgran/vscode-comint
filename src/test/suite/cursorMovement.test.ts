import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { ComintBuffer } from '../../comintBuffer';
import { MemFS } from '../../fileSystemProvider';

suite('ComintBuffer #applyChunk', () => {
	test('pv', () => {
		const cm = new ComintBuffer('name', vscode.Uri.parse('comint:/'));
		const input1 = '  720MiB 0:00:01 [ 720MiB/s] [=======>                          ] 25% ETA 0:00:02\r';
		const input2 = ' 1.43GiB 0:00:02 [ 739MiB/s] [================>                 ] 51% ETA 0:00:01\r';
		const input3 = ' 2.12GiB 0:00:03 [ 714MiB/s] [========================>         ] 75% ETA 0:00:00\r';
		const input4 = ' 2.73GiB 0:00:04 [ 624MiB/s] [===============================>  ] 97% ETA 0:00:00\r';
		const input5 = ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \r\r\n';
		
		cm.applyChunk(input1);
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(cm.data).toString(), '  720MiB 0:00:01 [ 720MiB/s] [=======>                          ] 25% ETA 0:00:02');
		
		cm.applyChunk(input2);
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(cm.data).toString(), ' 1.43GiB 0:00:02 [ 739MiB/s] [================>                 ] 51% ETA 0:00:01');
		
		cm.applyChunk(input3);
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(cm.data).toString(), ' 2.12GiB 0:00:03 [ 714MiB/s] [========================>         ] 75% ETA 0:00:00');
		
		cm.applyChunk(input4);
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(cm.data).toString(), ' 2.73GiB 0:00:04 [ 624MiB/s] [===============================>  ] 97% ETA 0:00:00');
		
		cm.applyChunk(input5);
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(cm.data).toString(), ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \n');
		
		cm.applyChunk('next prompt >');
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(cm.data).toString(), ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \nnext prompt >');
	});
	
	test('/r with partial line', () => {
		const cm = new ComintBuffer('name', vscode.Uri.parse('comint:/'));
		
		const input1 = 'password\rsafe';
		const input2 = 'ty first!\r\n';
		
		cm.applyChunk(input1);
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(cm.data).toString(), 'safeword');
		
		const output2 = cm.applyChunk(input2);
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(cm.data).toString(), 'safety first!\n');	
	});
	
	test ('/r and ESC[K to kill line (npm)', () => {
		const cm = new ComintBuffer('name', vscode.Uri.parse('comint:/'));
		const input1 = '[\x1b[100;90m..................\x1b[0m] \ reify: \x1b[43;40mtiming\x1b[0m \x1b[35marborist:longer-name\x1b[0m Completed in 0ms\x1b[0m\x1b[K\r';
		const output1 = cm.applyChunk(input1);
		assert.deepEqual(Buffer.from(cm.data).toString(), '[..................] \ reify: timing arborist:longer-name Completed in 0ms');
		
		const input2 = '[\x1b[107;97m#########\x1b[0m\x1b[100;90m.........\x1b[0m] \ idealTree: \x1b[43;40mtiming\x1b[0m \x1b[35midealTree\x1b[0m Completed in 80ms\x1b[0m\x1b[K\r';
		const output2 = cm.applyChunk(input2);
		assert.deepEqual(Buffer.from(cm.data).toString(), '[#########.........] \ idealTree: timing idealTree Completed in 80ms');

		const input3 = '\r\x1b[K\x1b[?25h';
		const output3 = cm.applyChunk(input3);
		assert.deepEqual(Buffer.from(cm.data).toString(), '');
		
		const input4 = '\r\nup to date.';
		const output4 = cm.applyChunk(input4);
		assert.deepEqual(Buffer.from(cm.data).toString(), '\nup to date.');
	});
});
