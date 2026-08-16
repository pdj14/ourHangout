export const MODEL_MODALITIES = ['text', 'image', 'audio', 'video', 'file'] as const;

export type ModelModality = typeof MODEL_MODALITIES[number];

export function normalizeModelModalities(value: unknown): ModelModality[] {
  if (!Array.isArray(value)) return [];
  const supported = new Set<ModelModality>();
  value.forEach((entry) => {
    const normalized = String(entry || '').trim().toLowerCase();
    if ((MODEL_MODALITIES as readonly string[]).includes(normalized)) {
      supported.add(normalized as ModelModality);
    }
  });
  return [...supported];
}

export function isZeroPricedModel(pricing: unknown) {
  if (!pricing || typeof pricing !== 'object') return false;
  const value = pricing as Record<string, unknown>;
  if (value.prompt === undefined || value.completion === undefined) return false;
  const meteredKeys = [
    'prompt',
    'completion',
    'request',
    'image',
    'audio',
    'input_audio',
    'video',
  ];
  return meteredKeys.every((key) => {
    if (value[key] === undefined) return true;
    const amount = Number(value[key]);
    return Number.isFinite(amount) && amount === 0;
  });
}

export function modalityLabel(modality: ModelModality) {
  switch (modality) {
    case 'image': return '\uC774\uBBF8\uC9C0';
    case 'audio': return '\uC624\uB514\uC624';
    case 'video': return '\uB3D9\uC601\uC0C1';
    case 'file': return '\uD30C\uC77C';
    default: return '\uD14D\uC2A4\uD2B8';
  }
}
