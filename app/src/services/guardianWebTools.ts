import { Platform } from 'react-native';

import { NativeBrowserTool, type NativeBrowserPage } from '../native';
import type { GuardianWebToolCall, GuardianWebToolName } from './guardianWebToolProtocol';

export {
  containsGuardianModelControlToken,
  containsGuardianWebToolCall,
  GUARDIAN_WEB_TOOL_RESPONSE_FALLBACK,
  normalizeGuardianWebToolCall,
  parseGuardianWebToolCall,
  sanitizeGuardianVisibleContent,
  type GuardianWebToolCall,
  type GuardianWebToolName,
} from './guardianWebToolProtocol';

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

export const GUARDIAN_WEB_TOOL_DEFINITIONS: GuardianFunctionToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '최신 정보나 외부 사실 확인이 필요할 때 앱 브라우저로 검색해 결과 요약과 열어 볼 수 있는 링크 목록을 반환합니다.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '지역·대상·날짜를 포함한 간결한 검색어. 같은 검색어를 반복 호출하지 않습니다.',
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
      description: 'web_search 결과에서 선택한 http(s) 페이지를 앱 브라우저로 열어 제목·본문·참고 링크를 읽습니다.',
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
