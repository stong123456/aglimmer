import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sealVault, openVault, verifyVault } from '../lib/backup-vault.mjs';
const password = 'only-a-synthetic-backup-test-password';
test('backup vault restores original bytes and verifies integrity without extracting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aglimmer-vault-'));
  try {
    const bytes = randomBytes(2 * 1024 * 1024 + 33),
      input = join(dir, 'archive.zip'),
      vault = join(dir, 'backup.agvault'),
      restored = join(dir, 'restored.zip');
    await writeFile(input, bytes);
    await sealVault(input, vault, password);
    const verified = await verifyVault(vault, password);
    assert.equal(verified.bytes, bytes.length);
    assert.equal((await openVault(vault, restored, password)).sha256, verified.sha256);
    assert.deepEqual(await readFile(restored), bytes);
    await assert.rejects(
      openVault(vault, join(dir, 'wrong.zip'), 'another-synthetic-test-password'),
    );
    await assert.rejects(stat(join(dir, 'wrong.zip')));
    const modified = await readFile(vault);
    modified[100] ^= 1;
    await writeFile(vault, modified);
    await assert.rejects(verifyVault(vault, password));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('backup vault supports empty originals and never overwrites an existing destination', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aglimmer-vault-'));
  try {
    const input = join(dir, 'empty.zip'),
      vault = join(dir, 'empty.agvault'),
      out = join(dir, 'existing.zip');
    await writeFile(input, '');
    await sealVault(input, vault, password);
    assert.equal((await verifyVault(vault, password)).bytes, 0);
    await writeFile(out, 'keep this');
    await assert.rejects(openVault(vault, out, password));
    assert.equal(await readFile(out, 'utf8'), 'keep this');
    await assert.rejects(sealVault(input, vault, password));
    assert.equal((await verifyVault(vault, password)).bytes, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
