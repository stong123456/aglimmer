import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeVerifiedZip } from '../lib/zip.ts';
test('personal archive verifies original bytes independently and rejects rewritten media even with a valid ZIP CRC', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aglimmer-export-'));
  const python = process.env.PYTHON ?? 'python3';
  try {
    const file = join(dir, 'archive.zip'),
      bad = join(dir, 'changed.zip');
    const blob = await makeVerifiedZip(
      [
        { name: 'archive.json', data: new TextEncoder().encode('{"署名":"当年的我"}') },
        { name: 'audio/原录音.wav', data: Uint8Array.from([1, 2, 3, 4, 5]) },
      ],
      { part: 1, exportedAt: '2026-10-23T00:00:00Z' },
    );
    await writeFile(file, new Uint8Array(await blob.arrayBuffer()));
    assert.match(
      execFileSync(python, ['scripts/verify-export.py', file], { encoding: 'utf8' }),
      /PASS: 3 files/,
    );
    execFileSync(python, [
      '-c',
      "import sys,zipfile; a=zipfile.ZipFile(sys.argv[1]); b=zipfile.ZipFile(sys.argv[2],'w'); [b.writestr(n,b'CHANGED' if n.startswith('audio/') else a.read(n)) for n in a.namelist()]; b.close()",
      file,
      bad,
    ]);
    assert.notEqual(spawnSync(python, ['scripts/verify-export.py', bad]).status, 0);
    assert.deepEqual(
      (await readdir(dir)).sort(),
      ['archive.zip', 'changed.zip'],
      'verification must not extract private files',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
