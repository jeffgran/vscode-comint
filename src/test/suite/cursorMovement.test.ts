import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { ComintBuffer, SgrSegment } from '../../comintBuffer';

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
		assert.deepEqual(Buffer.from(cm.content).toString(), '  720MiB 0:00:01 [ 720MiB/s] [=======>                          ] 25% ETA 0:00:02');

		cm.applyChunk(input2);
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(cm.content).toString(), ' 1.43GiB 0:00:02 [ 739MiB/s] [================>                 ] 51% ETA 0:00:01');

		cm.applyChunk(input3);
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(cm.content).toString(), ' 2.12GiB 0:00:03 [ 714MiB/s] [========================>         ] 75% ETA 0:00:00');

		cm.applyChunk(input4);
		assert.equal(cm.inCR, true);
		assert.deepEqual(Buffer.from(cm.content).toString(), ' 2.73GiB 0:00:04 [ 624MiB/s] [===============================>  ] 97% ETA 0:00:00');

		cm.applyChunk(input5);
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(cm.content).toString(), ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \n');

		cm.applyChunk('next prompt >');
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(cm.content).toString(), ' 2.79GiB 0:00:04 [ 699MiB/s] [================================>] 100%            \nnext prompt >');
	});

	test('/r with partial line', () => {
		const cm = new ComintBuffer('name', vscode.Uri.parse('comint:/'));

		const input1 = 'password\rsafe';
		const input2 = 'ty first!\r\n';

		cm.applyChunk(input1);
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(cm.content).toString(), 'safeword');

		const output2 = cm.applyChunk(input2);
		assert.equal(cm.inCR, false);
		assert.deepEqual(Buffer.from(cm.content).toString(), 'safety first!\n');
	});

	test ('/r and ESC[K to kill line (npm)', () => {
		const cm = new ComintBuffer('name', vscode.Uri.parse('comint:/'));
		const input1 = '[\x1b[100;90m..................\x1b[0m] \ reify: \x1b[43;40mtiming\x1b[0m \x1b[35marborist:longer-name\x1b[0m Completed in 0ms\x1b[0m\x1b[K\r';
		cm.applyChunk(input1);
		assert.deepEqual(Buffer.from(cm.content).toString(), '[..................] \ reify: timing arborist:longer-name Completed in 0ms');

		assert.deepEqual(cm.sgrSegments, [
			{ code: 100, startIndex: 1, endIndex: 18 },
			{ code: 90, startIndex: 1, endIndex: 18 },
			{ code: 43, startIndex: 29, endIndex: 34 },
			{ code: 40, startIndex: 29, endIndex: 34 },
			{ code: 35, startIndex: 36, endIndex: 55 },
		]);

		const input2 = '[\x1b[107;97m#########\x1b[0m\x1b[100;90m.........\x1b[0m] \ idealTree: \x1b[43;40mtiming\x1b[0m \x1b[35midealTree\x1b[0m Completed in 80ms\x1b[0m\x1b[K\r';
		cm.applyChunk(input2);
		assert.deepEqual(Buffer.from(cm.content).toString(), '[#########.........] \ idealTree: timing idealTree Completed in 80ms');

		console.log(cm.sgrSegments);

		assert.deepEqual(cm.sgrSegments, [
			{ code: 107, startIndex: 1, endIndex: 9 },
			{ code: 97, startIndex: 1, endIndex: 9 },
			{ code: 100, startIndex: 10, endIndex: 18 },
			{ code: 90, startIndex: 10, endIndex: 18 },
			{ code: 43, startIndex: 33, endIndex: 38 },
			{ code: 40, startIndex: 33, endIndex: 38 },
			{ code: 35, startIndex: 40, endIndex: 48 },
		]);

		const input3 = '\r\x1b[K\x1b[?25h';
		cm.applyChunk(input3);
		assert.deepEqual(Buffer.from(cm.content).toString(), '');
		assert.strictEqual(cm.writeIndex, 0);
		assert.deepEqual(cm.sgrSegments, []);


		const input4 = '\r\nup to date.';
		cm.applyChunk(input4);
		assert.deepEqual(Buffer.from(cm.content).toString(), '\nup to date.');
		assert.deepEqual(cm.sgrSegments, []);
	});

	test ('ESC[2K and ESC[1G and 3-byte utf8 chars (npm rebuild)', () => {
		const cm = new ComintBuffer('name', vscode.Uri.parse('comint:/'));

		const input1 = '\x1b[36m⠋\x1b[39m Searching dependency tree';
		cm.applyChunk(input1);
		assert.deepEqual(Buffer.from(cm.content).toString(), '⠋ Searching dependency tree');
		assert.deepEqual(cm.sgrSegments, [
			{ code: 36, startIndex: 0, endIndex: 0 }
		]);

		const input2 = '\x1b[2K';
		cm.applyChunk(input2);
		assert.deepEqual(Buffer.from(cm.content).toString(), '');
		assert.deepEqual(cm.sgrSegments, []);

		const input3 = '\x1b[1G\x1b[36m⠙\x1b[39m Searching dependency tree';
		cm.applyChunk(input3);
		assert.deepEqual(Buffer.from(cm.content).toString(), '⠙ Searching dependency tree');
		assert.deepEqual(cm.sgrSegments, [
			{ code: 36, startIndex: 0, endIndex: 0 }
		]);
	});

});
