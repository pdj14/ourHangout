export type GuardianLogPayloadMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: number; truncated?: boolean };

export function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const point = char.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function guardianLogBatches(
  messages: GuardianLogPayloadMessage[], maxChars: number, maxBytes: number,
  envelope: Record<string, unknown>, merge: boolean
): GuardianLogPayloadMessage[][] {
  const normalized = messages.slice(-60).map(message => ({ ...message, content: message.content.slice(0, maxChars), ...(message.content.length > maxChars ? { truncated: true } : {}) }));
  const fits = (batch: GuardianLogPayloadMessage[]) => utf8Length(JSON.stringify({ ...envelope, messages: batch })) <= maxBytes;
  if (!merge) {
    while (normalized.length && !fits(normalized)) normalized.shift();
    return normalized.length ? [normalized] : [];
  }
  const batches: GuardianLogPayloadMessage[][] = [];
  let batch: GuardianLogPayloadMessage[] = [];
  for (const message of normalized) {
    if (!fits([message])) throw new Error('사용 기록의 메시지가 저장 한도를 넘었어요.');
    if (batch.length && !fits([...batch, message])) { batches.push(batch); batch = []; }
    batch.push(message);
  }
  if (batch.length) batches.push(batch);
  return batches;
}
