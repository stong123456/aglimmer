import { sealVault, verifyVault, openVault } from '../lib/backup-vault.mjs';
async function secret() {
  if (!process.stdin.isTTY) {
    let value = '';
    for await (const chunk of process.stdin) {
      value += chunk;
      if (value.length > 4096) throw Error('口令输入过长。');
    }
    return value.replace(/\r?\n$/, '');
  }
  process.stderr.write('备份口令（不显示输入）：');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function done(error) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', read);
      process.stderr.write('\n');
      error ? reject(error) : resolve(value);
    }
    function read(chunk) {
      for (const c of chunk.toString('utf8')) {
        if (c === '\u0003') {
          done(Error('已取消。'));
          return;
        }
        if (c === '\r' || c === '\n') {
          done();
          return;
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
        if (value.length > 4096) {
          done(Error('口令输入过长。'));
          return;
        }
      }
    }
    process.stdin.on('data', read);
  });
}
try {
  const [command, input, out, ...extra] = process.argv.slice(2);
  if (
    !['seal', 'verify', 'open'].includes(command) ||
    !input ||
    extra.length ||
    (command === 'verify' ? !!out : !out)
  )
    throw Error(
      '用法：node scripts/archive-vault.mjs seal 输入文件 加密文件；verify 加密文件；open 加密文件 恢复文件。口令只经隐藏输入或 stdin 传入。',
    );
  const password = await secret();
  const result =
    command === 'seal'
      ? await sealVault(input, out, password)
      : command === 'open'
        ? await openVault(input, out, password)
        : await verifyVault(input, password);
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (e) {
  console.error('备份操作失败：' + e.message);
  process.exitCode = 1;
}
