import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, writeFile, link, unlink, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
const MAGIC = Buffer.from('AGLMVLT1'),
  HEADER_SIZE = 36,
  TAG_SIZE = 16;
const derive = promisify(scrypt);
async function key(password, salt) {
  if (typeof password !== 'string' || password.length < 12)
    throw Error('备份口令至少需要 12 个字符。');
  return derive(password, salt, 32);
}
const temporary = (out) =>
  join(dirname(out), '.aglimmer-' + randomBytes(16).toString('hex') + '.partial');
async function publish(temp, out) {
  // Atomic no-overwrite publication in the same directory.
  await link(temp, out);
  await unlink(temp);
}
export async function sealVault(input, out, password) {
  if (!(await stat(input)).isFile()) throw Error('备份输入必须是文件。');
  const salt = randomBytes(16),
    iv = randomBytes(12),
    header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', await key(password, salt), iv);
  cipher.setAAD(header);
  const temp = temporary(out);
  try {
    await writeFile(temp, header, { flag: 'wx', mode: 0o600 });
    await pipeline(createReadStream(input), cipher, createWriteStream(temp, { flags: 'a' }));
    const h = await open(temp, 'a');
    try {
      await h.write(cipher.getAuthTag());
      await h.sync();
    } finally {
      await h.close();
    }
    await publish(temp, out);
    return { format: 'AGLMVLT1', bytes: (await stat(out)).size };
  } catch (e) {
    await unlink(temp).catch(() => {});
    throw e;
  }
}
async function decrypt(input, password, out) {
  const handle = await open(input, 'r');
  let size, header, tag;
  try {
    size = (await handle.stat()).size;
    if (size < HEADER_SIZE + TAG_SIZE) throw Error('备份文件不完整。');
    header = Buffer.alloc(HEADER_SIZE);
    tag = Buffer.alloc(TAG_SIZE);
    await handle.read(header, 0, HEADER_SIZE, 0);
    await handle.read(tag, 0, TAG_SIZE, size - TAG_SIZE);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, 8).equals(MAGIC)) throw Error('不支持的备份格式。');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    await key(password, header.subarray(8, 24)),
    header.subarray(24),
  );
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, done) {
      hash.update(chunk);
      bytes += chunk.length;
      done(null, chunk);
    },
  });
  const temp = out ? temporary(out) : null;
  try {
    const source =
      size === HEADER_SIZE + TAG_SIZE
        ? Readable.from([])
        : createReadStream(input, { start: HEADER_SIZE, end: size - TAG_SIZE - 1 });
    const destination = temp
      ? createWriteStream(temp, { flags: 'wx', mode: 0o600 })
      : new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
        });
    await pipeline(source, decipher, meter, destination);
    if (temp) await publish(temp, out);
    return { bytes, sha256: hash.digest('hex') };
  } catch (e) {
    if (temp) await unlink(temp).catch(() => {});
    throw e;
  }
}
export const verifyVault = (input, password) => decrypt(input, password);
export const openVault = (input, out, password) => decrypt(input, password, out);
