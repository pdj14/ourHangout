export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_APP_URL = 'https://github.com/pdj14/ourHangout';
export const OPENROUTER_APP_TITLE = 'OurHangout Guardian';

export function buildOpenRouterHeaders(apiKey: string, json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': OPENROUTER_APP_URL,
    'X-OpenRouter-Title': OPENROUTER_APP_TITLE,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}
