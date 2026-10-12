// MediaRecorder WebM often omits Duration. Inspect cluster/block timecodes instead
// of trusting the client-supplied duration. All reads are bounded by the file.
export function webmDuration(bytes: Uint8Array) {
  let scale = 1000000,
    maxTime = -1,
    blocks = 0,
    steps = 0;
  function vint(at: number, id = false): { value: number; length: number } | null {
    if (at >= bytes.length || bytes[at] === 0) return null;
    let mask = 128,
      len = 1;
    while (!(bytes[at] & mask)) {
      mask >>= 1;
      len++;
    }
    if (len > 8 || at + len > bytes.length) return null;
    let n = id ? bytes[at] : bytes[at] & (mask - 1);
    for (let i = 1; i < len; i++) n = n * 256 + bytes[at + i];
    return { value: n, length: len };
  }
  function unsigned(a: number, b: number) {
    let n = 0;
    for (let i = a; i < b; i++) n = n * 256 + bytes[i];
    return n;
  }
  function walk(start: number, end: number, clusterTime = 0) {
    let at = start;
    while (at < end && steps++ < 150000) {
      const id = vint(at, true);
      if (!id) return;
      at += id.length;
      const size = vint(at);
      if (!size) return;
      at += size.length;
      const stop = Math.min(end, at + size.value);
      if (stop < at || stop > bytes.length) return;
      if (id.value === 0x2ad7b1) scale = unsigned(at, stop);
      else if (id.value === 0xe7) clusterTime = unsigned(at, stop);
      else if (id.value === 0xa3 || id.value === 0xa1) {
        const track = vint(at);
        if (track && at + track.length + 3 <= stop) {
          const i = at + track.length;
          let rel = bytes[i] * 256 + bytes[i + 1];
          if (rel >= 32768) rel -= 65536;
          maxTime = Math.max(maxTime, clusterTime + rel);
          blocks++;
        }
      } else if ([0x18538067, 0x1549a966, 0x1f43b675, 0xa0].includes(id.value))
        walk(at, stop, clusterTime);
      at = stop;
    }
  }
  walk(0, bytes.length);
  return blocks && maxTime >= 0 ? (maxTime * scale) / 1e9 + 0.04 : 0;
}
