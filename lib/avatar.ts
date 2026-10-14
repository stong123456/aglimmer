// Only bounded raster headers are accepted. SVG and oversized images are refused.
export function avatarDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    mime === 'image/png' &&
    bytes.length > 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    new TextDecoder().decode(bytes.slice(12, 16)) === 'IHDR'
  )
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) return null;
      let marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xda || marker === 0xd9) return null;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8)
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      offset += length;
    }
  }
  if (
    mime === 'image/webp' &&
    bytes.length >= 30 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP' &&
    view.getUint32(4, true) + 8 === bytes.length
  ) {
    const chunk = new TextDecoder().decode(bytes.slice(12, 16));
    if (chunk === 'VP8X')
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42)
      return { width: view.getUint16(26, true) & 16383, height: view.getUint16(28, true) & 16383 };
    if (chunk === 'VP8L' && bytes[20] === 47) {
      const v = view.getUint32(21, true);
      return { width: (v & 16383) + 1, height: ((v >> 14) & 16383) + 1 };
    }
  }
  return null;
}
export function validAvatar(bytes: Uint8Array, mime: string) {
  const d = avatarDimensions(bytes, mime);
  return (
    !!d &&
    d.width > 0 &&
    d.height > 0 &&
    d.width <= 2048 &&
    d.height <= 2048 &&
    d.width * d.height <= 4194304
  );
}
