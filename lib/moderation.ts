// A narrow, explainable first gate, never a substitute for human review.
// Expressions of tiredness and difficulty are allowed; directed abuse is not.
const prohibited = [
  /去死|滚出(?:去|来)?|杀了你|弄死你/u,
  /你(?:就是|是个|是|这(?:个|种))?(?:废物|垃圾|贱人|畜生)/u,
  /活着(?:也)?(?:没有|没)(?:任何)?意义|不如(?:去死|自杀)/u,
  /加(?:微信|微[信x]|VX|vx).{0,8}(?:赚钱|投资|返利)|稳赚不赔/u,
];
export function blockedReason(value: string) {
  const normalized = value.normalize('NFKC').replace(/[\s\u200b-\u200d]/g, '');
  return prohibited.some((p) => p.test(normalized))
    ? '这段内容包含攻击、消极诱导或营销表达。请换成尊重、具体的表达。'
    : null;
}
export function validImage(bytes: Uint8Array, mime: string) {
  if (mime === 'image/png')
    return bytes.length > 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  if (mime === 'image/jpeg')
    return bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/webp')
    return (
      bytes.length > 16 &&
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
    );
  return false;
}
export type ChannelMessage = {
  id: string;
  kind: 'text' | 'image' | 'voice';
  body: string;
  signature: string;
  createdAt: string;
  status: string;
  reviewNote?: string;
  mine: boolean;
  mediaUrl?: string;
  voice?: import('./shared').Voice;
};
