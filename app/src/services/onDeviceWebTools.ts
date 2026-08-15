import { Platform } from 'react-native';

import { NativeBrowserTool, type NativeBrowserPage } from '../native';

export type GuardianWebToolCall =
  | { name: 'web_search'; arguments: { query: string } }
  | { name: 'open_url'; arguments: { url: string } };

const TOOL_CALL_PATTERN = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i;

export function webToolsAvailable() {
  return Platform.OS === 'android' && !!NativeBrowserTool;
}

export function parseGuardianWebToolCall(value: string): GuardianWebToolCall | null {
  const match = value.match(TOOL_CALL_PATTERN);
  const candidate = match?.[1] || value.trim();
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(candidate) as {
      name?: unknown;
      arguments?: { query?: unknown; url?: unknown };
    };
    if (parsed.name === 'web_search') {
      const query = String(parsed.arguments?.query || '').trim().slice(0, 300);
      return query ? { name: 'web_search', arguments: { query } } : null;
    }
    if (parsed.name === 'open_url') {
      const url = String(parsed.arguments?.url || '').trim().slice(0, 2000);
      return /^https?:\/\//i.test(url) ? { name: 'open_url', arguments: { url } } : null;
    }
  } catch {
    return null;
  }
  return null;
}

function formatPage(page: NativeBrowserPage) {
  const links = (page.links || [])
    .slice(0, 10)
    .map((link, index) => `${index + 1}. ${link.title}\n${link.url}`)
    .join('\n');
  const text = String(page.text || '').replace(/\s+/g, ' ').trim().slice(0, 2200);
  return [
    `제목: ${page.title || '제목 없음'}`,
    `주소: ${page.url}`,
    links ? `링크:\n${links}` : '',
    text ? `본문:\n${text}` : '본문을 읽지 못했습니다.',
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
