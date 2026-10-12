// OS/browser MIME labels for audio-only containers are not consistent.
// This normalizes labels; the server separately checks actual audio tracks.
export function audioMime(name: string, type: string) {
  const byExtension: Record<string, string> = {
    webm: 'audio/webm',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
  };
  const extension = name.toLowerCase().split('.').pop() ?? '';
  const mime = type.split(';')[0];
  if (
    ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg'].includes(
      mime,
    )
  )
    return mime;
  return byExtension[extension] ?? '';
}
