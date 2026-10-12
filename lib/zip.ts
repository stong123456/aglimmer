// ZIP store format: portable archives without a compression service or dependency.
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(data: Uint8Array) {
  let c = 0xffffffff;
  for (const b of data) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(files: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const dirs: Uint8Array[] = [];
  let offset = 0,
    dirSize = 0;
  for (const f of files) {
    const name = encoder.encode(f.name),
      hash = crc(f.data);
    const local = new Uint8Array(30 + name.length),
      v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, hash, true);
    v.setUint32(18, f.data.length, true);
    v.setUint32(22, f.data.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, f.data);
    const dir = new Uint8Array(46 + name.length),
      d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint32(16, hash, true);
    d.setUint32(20, f.data.length, true);
    d.setUint32(24, f.data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    dir.set(name, 46);
    dirs.push(dir);
    dirSize += dir.length;
    offset += local.length + f.data.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, dirSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...dirs, end] as BlobPart[], { type: 'application/zip' });
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
