export type GuardianWebToolName = 'web_search' | 'open_url';

export type GuardianWebToolCall =
  | { name: 'web_search'; arguments: { query: string } }
  | { name: 'open_url'; arguments: { url: string } };

const TOOL_CALL_PATTERN = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i;
const INVOKE_TOOL_CALL_PATTERN = /<invoke\b[^>]*\bname\s*=\s*["'](web_search|open_url)["'][^>]*>([\s\S]*?)<\/invoke>/i;
const TOOL_CALL_HINT_PATTERN = /<\/?(?:tool_call|dots_function_call|function_call)\b|<invoke\b[^>]*\bname\s*=\s*["'](?:web_search|open_url)["']|"name"\s*:\s*"(?:web_search|open_url)"/i;
const MODEL_CONTROL_TOKEN_PATTERN = /<\/?(?:pad|unk|bos|eos|s)>|<\|[^|<>]{1,80}\|>|\[\/?INST\]/i;
const MODEL_CONTROL_TOKEN_GLOBAL_PATTERN = /<\/?(?:pad|unk|bos|eos|s)>|<\|[^|<>]{1,80}\|>|\[\/?INST\]/gi;

export const GUARDIAN_WEB_TOOL_RESPONSE_FALLBACK = '웹 검색 요청을 답변으로 마무리하지 못했어요. 같은 질문을 다시 보내 주세요.';

export function normalizeGuardianWebToolCall(
  name: unknown,
  rawArguments: unknown
): GuardianWebToolCall | null {
  let parsedArguments: { query?: unknown; url?: unknown };
  if (typeof rawArguments === 'string') {
    try {
      parsedArguments = JSON.parse(rawArguments) as { query?: unknown; url?: unknown };
    } catch {
      return null;
    }
  } else if (rawArguments && typeof rawArguments === 'object') {
    parsedArguments = rawArguments as { query?: unknown; url?: unknown };
  } else {
    return null;
  }

  if (name === 'web_search') {
    const query = String(parsedArguments.query || '').trim().slice(0, 300);
    return query ? { name: 'web_search', arguments: { query } } : null;
  }
  if (name === 'open_url') {
    const url = String(parsedArguments.url || '').trim().slice(0, 2000);
    return /^https?:\/\//i.test(url) ? { name: 'open_url', arguments: { url } } : null;
  }
  return null;
}

function decodeToolParameter(value: string) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim();
}

export function containsGuardianWebToolCall(value: string) {
  return TOOL_CALL_HINT_PATTERN.test(value);
}

export function containsGuardianModelControlToken(value: string) {
  return MODEL_CONTROL_TOKEN_PATTERN.test(value);
}

export function sanitizeGuardianVisibleContent(value: string) {
  if (containsGuardianWebToolCall(value)) return GUARDIAN_WEB_TOOL_RESPONSE_FALLBACK;
  if (!containsGuardianModelControlToken(value)) return value;
  const cleaned = value.replace(MODEL_CONTROL_TOKEN_GLOBAL_PATTERN, '').trim();
  return cleaned || GUARDIAN_WEB_TOOL_RESPONSE_FALLBACK;
}

export function parseGuardianWebToolCall(value: string): GuardianWebToolCall | null {
  const invokeMatch = value.match(INVOKE_TOOL_CALL_PATTERN);
  if (invokeMatch) {
    const name = invokeMatch[1];
    const body = invokeMatch[2] || '';
    const parameterName = name === 'web_search' ? 'query' : 'url';
    const parameterPattern = new RegExp(
      `<parameter\\b[^>]*\\bname\\s*=\\s*["']${parameterName}["'][^>]*>([\\s\\S]*?)<\\/parameter>`,
      'i'
    );
    const parameter = body.match(parameterPattern)?.[1];
    if (parameter !== undefined) {
      return normalizeGuardianWebToolCall(name, {
        [parameterName]: decodeToolParameter(parameter),
      });
    }
  }

  const match = value.match(TOOL_CALL_PATTERN);
  const candidate = (match?.[1] || value.trim())
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(candidate) as { name?: unknown; arguments?: unknown };
    return normalizeGuardianWebToolCall(parsed.name, parsed.arguments);
  } catch {
    return null;
  }
}
