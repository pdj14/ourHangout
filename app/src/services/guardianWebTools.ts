import { Platform } from 'react-native';

import { NativeBrowserTool, type NativeBrowserPage } from '../native';

export type GuardianWebToolName = 'web_search' | 'open_url';

export type GuardianWebToolCall =
  | { name: 'web_search'; arguments: { query: string } }
  | { name: 'open_url'; arguments: { url: string } };

export type GuardianFunctionToolDefinition = {
  type: 'function';
  function: {
    name: GuardianWebToolName;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: 'string'; description: string }>;
      required: string[];
      additionalProperties: false;
    };
  };
};

const TOOL_CALL_PATTERN = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i;

export const GUARDIAN_WEB_TOOL_DEFINITIONS: GuardianFunctionToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '최신 정보나 외부 사실 확인이 필요할 때 앱의 브라우저로 웹을 검색합니다.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '검색 엔진에 전달할 간결하고 구체적인 검색어',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description: '검색 결과의 웹페이지를 앱의 브라우저로 열어 본문과 참고 링크를 읽습니다.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '열어 볼 http 또는 https 웹페이지 주소',
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
];

export function webToolsAvailable() {
  return Platform.OS === 'android' && !!NativeBrowserTool;
}

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

export function parseGuardianWebToolCall(value: string): GuardianWebToolCall | null {
  const match = value.match(TOOL_CALL_PATTERN);
  const candidate = match?.[1] || value.trim();
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(candidate) as { name?: unknown; arguments?: unknown };
    return normalizeGuardianWebToolCall(parsed.name, parsed.arguments);
  } catch {
    return null;
  }
}

function formatPage(page: NativeBrowserPage) {
  const links = (page.links || [])
    .slice(0, 5)
    .map((link, index) => `${index + 1}. ${link.title}\n${link.url}`)
    .join('\n');
  const text = String(page.text || '').replace(/\s+/g, ' ').trim().slice(0, 1800);
  return [
    `제목: ${page.title || '제목 없음'}`,
    `주소: ${page.url}`,
    text ? `본문:\n${text}` : '본문을 읽지 못했습니다.',
    links ? `참고 링크:\n${links}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 4200);
}

export async function executeGuardianWebTool(call: GuardianWebToolCall) {
  if (!NativeBrowserTool) throw new Error('이 Android 빌드에는 웹 도구가 포함되어 있지 않아요.');
  const page = call.name === 'web_search'
    ? await NativeBrowserTool.search(call.arguments.query)
    : await NativeBrowserTool.openUrl(call.arguments.url);
  return formatPage(page);
}

export async function cancelGuardianWebTool() {
  if (NativeBrowserTool) await NativeBrowserTool.cancel().catch(() => false);
}
