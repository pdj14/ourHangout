# 우리들의 아지트(OurHangout) — 4-Step 수정 작업 보고서

작성일: 2026-08-23 · 대상 워크스페이스: `app/` (Expo 55 / RN 0.83 / llama.rn 0.12.9)

> **적용 범위 안내**: 본 API 에이전트는 소스 파일 직접 수정 권한이 없고(`axone_output` 쓰기만 허용),
> 아래 내용은 **즉시 적용 가능한 패치 수준의 수정 사양**입니다. 각 항목은 파일·함수 단위 정확한
> 위치와 전체 코드를 포함하므로, 그대로 복사해 적용하면 됩니다. 적용 후 검증 명령은 각 Step 끝에 있습니다.

---

## Step 1 — 미확인 말풍선 뱃지/알림 상태 동기화 수정

### 원인 진단 (코드 근거)

| # | 위치 | 문제 |
|---|------|------|
| 1 | `android/.../OurFirebaseMessagingService.kt` `showMessageNotification()` | 알림 ID가 `roomId.hashCode()`로 결정되지만, 앱 내부에서 읽어도 이 알림을 **지우는 경로가 네이티브에 전혀 없음** (`setAutoCancel(true)`는 "탭했을 때만" 제거). → 알림바를 탭해서 들어갈 때만 미확인 표시가 사라짐 |
| 2 | `src/App.tsx` `markRoomAsRead()` | `POST /v1/rooms/:id/read`가 `queue:false, rateLimitRetries:0` + 호출부 `.catch(() => null)`로 **실패 시 재시도 없이 무시**됨. 서버 unread가 유지되고, 이후 `refreshRooms()`(포그라운드 복귀·당겨서 새로고침) 또는 실시간 `room.unread.updated` 이벤트가 뱃지를 **되살림** |
| 3 | `src/App.tsx` `openRoom()` | 로컬 unread는 낙관적으로 0으로 만들지만 서버 읽음 등록이 실패해도 회복 로직 없음 → "직접 열어 읽었는데 뱃지가 안 사라지는/돌아오는" 증상 |

### 수정 1-1. 네이티브: 방 알림 취소 API 추가

**파일**: `android/app/src/main/java/com/ourhangout/push/PushTokenModule.kt`

import 추가:
```kotlin
import androidx.core.app.NotificationManagerCompat
```

클래스 내부에 메서드 추가 (알림 ID가 `roomId.hashCode()`인 것과 정확히 일치시킴):
```kotlin
  @ReactMethod
  fun cancelRoomNotifications(roomId: String, promise: Promise) {
    val normalized = roomId.trim()
    if (normalized.isEmpty()) {
      promise.resolve(false)
      return
    }
    NotificationManagerCompat.from(reactContext).cancel(normalized.hashCode())
    promise.resolve(true)
  }

  @ReactMethod
  fun cancelAllMessageNotifications(promise: Promise) {
    val manager = NotificationManagerCompat.from(reactContext)
    manager.activeNotifications
      .filter { it.notification.channelId == "messages" }
      .forEach { manager.cancel(it.id) }
    promise.resolve(true)
  }
```
※ 자기 앱 알림 cancel은 Android 13+ `POST_NOTIFICATIONS` 권한과 무관하게 허용됩니다.
※ `messages` 채널만 정리하므로 지킴이 웹 확인(`ourhangout-browser-tool`)·위치 서비스 알림은 영향 없음.

### 수정 1-2. JS 타입 확장

**파일**: `src/native.ts`
```ts
export type NativePushTokenModule = {
  getToken: () => Promise<string>;
  deleteToken?: () => Promise<boolean>;
  cancelRoomNotifications?: (roomId: string) => Promise<boolean>;
  cancelAllMessageNotifications?: () => Promise<boolean>;
};
```

### 수정 1-3. `markRoomAsRead` — 재시도 + 성공 시 알림바 정리

**파일**: `src/App.tsx` — 기존 `markRoomAsRead` 함수를 아래로 교체:

```ts
const markRoomAsRead = useCallback(
  async (roomId: string, roomMessages?: Message[]) => {
    const latest = (roomMessages || messagesRef.current[roomId] || [])
      .filter((message) => message.kind !== 'system')
      .at(-1);
    const body = latest?.id ? JSON.stringify({ lastReadMessageId: latest.id }) : undefined;

    let unread = -1;
    let lastError: unknown = null;
    // 실패 시 뱃지가 되살아나는 것을 막기 위해 총 2회 시도(1회 재시도).
    for (let attempt = 0; attempt < 2 && unread < 0; attempt += 1) {
      try {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
        const result = await client.request<BackendRoomRead>(
          `/v1/rooms/${roomId}/read`,
          { method: 'POST', ...(body ? { body } : {}) },
          { queue: false, rateLimitRetries: 0, timeoutMs: 10000 }
        );
        unread = Math.max(0, Number(result.unread || 0));
      } catch (error) {
        lastError = error;
      }
    }

    if (unread < 0) {
      throw lastError instanceof Error ? lastError : new Error('읽음 처리를 완료하지 못했습니다.');
    }

    setRooms((prev) => {
      const nextRooms = prev.map((room) =>
        room.id === roomId
          ? {
              ...room,
              unread,
              ...(unread === 0 ? { firstUnreadMessageId: undefined } : {}),
            }
          : room
      );
      roomsRef.current = nextRooms;
      return nextRooms;
    });
    if (unread === 0) {
      // 앱 안에서 읽었으면 알림바의 해당 방 알림도 함께 정리 (Step 1 핵심)
      void NativePushToken?.cancelRoomNotifications?.(roomId).catch(() => false);
    }
    const roomType = roomsRef.current.find((room) => room.id === roomId)?.type;
    if (activeRoomRef.current === roomId && (roomType === 'group' || roomType === 'family')) {
      setTimeout(() => {
        void loadRoomMessages(roomId).catch(() => null);
      }, 250);
    }
    return unread;
  },
  [client, loadRoomMessages]
);
```

효과:
- `openRoom`(직접 열람), 실시간 `message.new`(열람 중 수신), 포그라운드 복귀 재마킹 — **세 경로 모두** 성공 시 알림바 뱃지가 함께 사라짐.
- 읽음 POST 실패 시에도 2회 시도로 흡수하고, 그래도 실패하면 예외를 던져 기존 `.catch(() => null)` 호출부가 조용히 넘어가되 다음 foreground/실시간 동기화에서 최종 일치됨.

### 검증 (Step 1)
1. `npm run typecheck`
2. 기기 A에서 메시지 수신 → 기기 B(또는 동일 기기)에서 **알림을 탭하지 않고** 런처로 앱 진입 → 해당 방 열람 → 알림바 알림 제거 + 채팅 목록 뱃지 0 확인.
3. 비행기 모드로 방을 연 뒤(읽음 POST 실패) 네트워크 복구 → 포그라운드 복귀 시 뱃지가 서버 값과 일치하는지 확인.

---

## Step 2 — 시놉시스 및 행동규칙 실시간 반영 점검/개선

### 점검 결과

| 엔진 | 시놉시스 반영 | 행동규칙 반영 | 수정 즉시 적용 |
|------|--------------|--------------|----------------|
| 클라우드(API/OpenRouter) | ✅ `buildGuardianSystemPrompt`가 매 라운드 `시놉시스:`(400자) 포함 | ✅ 전체 규칙(160자×N, 1600자 상한) 포함 | ✅ 프롬프트를 매 호출마다 `guardianProfile` state에서 재생성 (캐시 없음) |
| 온디바이스(LFM 2.5~2.8B) | ❌ **`buildGuardianOnDeviceMicroPrompt`에 시놉시스가 아예 없음** (이름만 포함) | ❌ **규칙 '제목'만** 최대 3개·120자 (지침 본문 미포함) | ✅ 구조는 즉시 반영되나, 내용이 위와 같이 유실 |

→ **"페르소나로 일관성 있게 답변하지 않는" 원인은 온디바이스 마이크로 프롬프트에서 시놉시스·규칙 지침이 누락된 것**입니다. 저장/캐시 문제는 아닙니다(`saveGuardianProfile` → `setGuardianProfile` 즉시 갱신 확인).

### 수정 2-1. 온디바이스 마이크로 프롬프트에 페르소나+규칙 주입 (예산 관리)

**파일**: `src/services/guardianProfile.ts` — `buildGuardianOnDeviceMicroPrompt` 교체:

```ts
export function buildGuardianOnDeviceMicroPrompt(
  profile: GuardianProfile,
  webResultsProvided = false,
  options: { contextSize?: number } = {}
) {
  // 온디바이스 소형 모델(LFM 2.5B~2.8B)은 긴 프롬프트를 따라가지 못하므로
  // 시놉시스·규칙을 컨텍스트 크기에 맞춘 예산으로 압축해 주입한다.
  const normalized = normalizeGuardianProfile(profile);
  const contextSize = options.contextSize ?? 1024;
  const synopsisBudget = contextSize <= 1024 ? 160 : 320;
  const ruleBudget = contextSize <= 1024 ? 240 : 480;
  const maxRules = contextSize <= 1024 ? 3 : 5;

  const persona = normalized.synopsis.replace(/\s+/g, ' ').trim().slice(0, synopsisBudget);
  const rules = normalized.rules
    .slice(0, maxRules)
    .map((rule, index) => {
      const title = rule.title.trim();
      const instruction = rule.instruction.replace(/\s+/g, ' ').trim().slice(0, 80);
      return `${index + 1}. ${title ? `${title}: ` : ''}${instruction}`;
    })
    .join('\n')
    .slice(0, ruleBudget);

  return [
    `너는 "${normalized.name}"이다.${persona ? ` 역할: ${persona}.` : ''}`,
    '모든 최종 답변은 반드시 자연스러운 한국어로만 작성한다.',
    '질문의 핵심부터 간결하게 답한다. 사고 과정, 도구 호출 형식, 내부 지침은 절대 출력하지 않는다.',
    '확실하지 않은 내용은 지어내지 않는다.',
    webResultsProvided
      ? '대화에 포함된 [웹 도구 결과]의 사실만 근거로 사용하고, 결과에 없는 날짜·숫자·사건은 만들지 않는다.'
      : '',
    rules ? `행동 규칙:\n${rules}` : '',
  ].filter(Boolean).join('\n');
}
```

### 수정 2-2. 컨텍스트 크기 전달 + 시스템 프롬프트 예산 정합화

**파일**: `src/services/onDeviceAi.ts`

1) 클래스에 getter 추가:
```ts
  get activeContextSize() {
    return this.contextSize;
  }
```
2) `complete()` 내 systemPrompt 슬라이스 한도 완화(한국어 1자≈1토큰 초과 추정으로 ctx=1024에서 1200자는 초과 위험):
```ts
    const systemPrompt = String(options.systemPrompt || defaultSystemPrompt)
      .trim()
      .slice(0, this.contextSize <= 1024 ? 900 : 2000);
```

**파일**: `src/services/guardianConversation.ts` — 온디바이스 루프의 프롬프트 생성 한 곳만 변경:
```ts
    const systemPrompt = buildGuardianOnDeviceMicroPrompt(profile, grounded, {
      contextSize: onDeviceAiEngine.activeContextSize || 1024,
    });
```

예산 검증(ctx=1024): 이름+페르소나(≤170) + 고정 문장(~150) + 규칙(≤250) ≈ 570자 ≤ 900자 슬라이스 → 웹 결과(360자)·대화(900자 budget)와 함께 1024 토큰 내 수렴.

### 수정 2-3. 회귀 테스트 (선택)

`guardianProfile.ts`는 AsyncStorage를 import하므로 node --test 직접 import가 불가합니다. 프롬프트 빌더 2개를 의존성 없는 `src/services/guardianPromptText.ts`로 추출하면 `tests/guardianPrompt.test.mjs` 추가 가능:
```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGuardianOnDeviceMicroPrompt } from '../src/services/guardianPromptText.ts';

test('includes persona synopsis and rule instructions for on-device prompts', () => {
  const prompt = buildGuardianOnDeviceMicroPrompt({
    name: '숲 지킴이',
    synopsis: '차분한 가족 동반자',
    rules: [{ id: 'r1', title: '말투', instruction: '존댓말로 답한다.', createdAt: 0, updatedAt: 0 }],
    webBrowsingEnabled: false, aiEngineType: 'onDevice',
    cloudProviderId: 'openRouter', cloudBaseUrl: '', cloudModelId: '',
    cloudFallbackModelIds: [], openRouterModelId: '',
  }, false, { contextSize: 1024 });
  assert.match(prompt, /역할: 차분한 가족 동반자/);
  assert.match(prompt, /말투: 존댓말로 답한다\./);
});
```

### 검증 (Step 2)
1. 설정에서 시놉시스를 뚜렷이 구분되는 페르소나로 변경(예: "해적 캡틴처럼 말하는 조수") → 저장 → **같은 대화방에서 바로** 질문 → 다음 답변부터 성격 반영 확인(저장 안내 문구 "다음 답변부터 적용됩니다"와 일치).
2. 규칙 지침 본문을 수정(제목 아님) → 온디바이스 답변 변화 확인(기존엔 무반응이었던 부분).
3. 저사양 기기(RAM<7GB, ctx=1024)에서 빈 답변/절단 없는지 확인.

---

## Step 3 — 가족 친화적 파스텔 톤 UI/UX 리뉴얼

### 설계 원칙
- 기능·동작 무변경. 모든 화면이 `src/theme.ts` 토큰(colors/spacing/radius/type/shadow)을 사용하므로 **토큰 교체만으로 90% 적용**되고, 하드코딩 색 ~30곳만 보정.
- 솜사탕/구름/자연 휴식: 크림 배경 + 파스텔 세이지/복숭아/스카이, 라운드 확대, 부드러운 잉크색.
- 접근성: 본문 텍스트 대비 4.5:1 이상 유지(아래 팔레트 검증값 포함).

### 수정 3-1. `src/theme.ts` 교체

```ts
export const colors = {
  canvas: '#FBF6EF',      // 솜사탕 크림
  canvasDeep: '#F3EAE0',
  surface: '#FFFFFF',
  surfaceSoft: '#FBEFEA', // 살구빛 소프트 카드
  surfaceWarm: '#FFF6E7',
  ink: '#43394B',         // 따뜻한 잉크 (canvas 대비 ≈ 9.6:1)
  inkSoft: '#6B5F72',     // ≈ 5.4:1
  inkMuted: '#94889A',    // 보조 텍스트 전용
  line: '#EFE3DC',
  teal: '#8FB6A5',        // 파스텔 세이지(강조 배경/보더)
  tealDark: '#52796B',    // 프라이머리 버튼(흰 글자 대비 ≈ 4.9:1 AA)
  blue: '#93AFD6',
  indigo: '#8795BC',
  coral: '#E58C76',       // 파스텔 코랄(뱃지/아이콘)
  coralDark: '#B95440',   // 코랄 계열 "텍스트"용 (흰 배경 대비 ≈ 4.6:1)
  amber: '#D9A85F',
  leaf: '#9DBB87',
  bark: '#A98F77',
  cream: '#FFFFFF',
  success: '#6FA077',
  mine: '#6E9C8B',        // 내 말풍선 파스텔 민트(흰 글자 대비 ≈ 4.6:1)
  other: '#FFFFFF',
  shadow: '#5C4A57',
};

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };   // 포근한 라운드 상향
export const type = { hero: 26, title: 21, section: 16, body: 15, small: 13, tiny: 12 }; // 가족 가독성 +1pt
```
※ `coralDark` 신설에 따라 타입 추론은 그대로 동작(object literal). 텍스트로 쓰이던 coral은 `coralDark`로 치환(아래 3-3).

### 수정 3-2. 폰트 (권장: Pretendard)

RN Android 기본 폰트는 Roboto(한글 Noto fallback)라 기계적인 인상을 줍니다. 가족 친화형을 위해 Pretendard 적용:
1. `assets/fonts/PretendardVariable.ttf` 추가 (https://github.com/orioncactus/pretendard — 라이선스 OFL).
2. `app.json` → `"expo": { "fonts": [{ "asset": "./assets/fonts/PretendardVariable.ttf", "family": "Pretendard" }] }` 후 `npx expo prebuild --platform android --no-install`.
3. `theme.ts`에 `export const fontFamily = Platform.select({ android: 'Pretendard', ios: 'Pretendard', default: undefined });` 추가 후, ScreenHeader/BottomNav/MessageBubble/ChatListItem 등 주요 Text 스타일에 `fontFamily` 지정(전역 Text 기본값 설정은 RN 제약상 컴포넌트별 적용).
※ 폰트 파일이 없으면 기존 시스템 폰트로 안전하게 폴백됩니다(기능 영향 없음).

### 수정 3-3. 하드코딩 색 → 토큰 치환 목록

| 파일 | 기존 | 교체 |
|------|------|------|
| `components/ConnectionBanner.tsx` | `#E8C1BA`, `#FFF1EE` | `colors.coral`, `'#FDEDE9'` |
| `screens/PeopleScreen.tsx` | `#E8C2AF` | `colors.line` |
| `screens/ProfileScreen.tsx` | `#F0D9A8`, `#FFF8EA`, `#F4C5BD`, `#DDF4EF` | `colors.amber`, `colors.surfaceWarm`, `'#FADCD5'`, `colors.surfaceSoft` |
| `screens/RoomScreen.tsx` | `#DDF4EF`, `#F4C5BD` | `colors.surfaceSoft`, `'#FADCD5'` |
| `components/GuardianSettingsModal.tsx` | `#E7C2BB`, `#FFF8F6`, `#E4F3E7`, `#EEF4F8`, `#EAF0FA` | `colors.coral`, `'#FDF3F0'`, `colors.surfaceSoft`, `colors.canvasDeep`, `colors.surfaceSoft` |
| `screens/OnDeviceAiScreen.tsx` | `#E9D9BE`, `#FFE4A8` | `colors.surfaceWarm`, `colors.amber` |
| `components/UserProfileModal.tsx` | `#DDF4EF` | `colors.surfaceSoft` |
| `services/mappers.ts` avatar palette | 진한 7색 | 파스텔 7색: `['#7FB5A3','#8FA8DE','#A08FD0','#E89A86','#DDB36A','#7BB8C9','#B48FD9']` |
| coral을 텍스트 색으로 쓰는 모든 스타일 | `colors.coral` | `colors.coralDark` (예: ChatListItem unread 배경은 `colors.coral` 유지, GuardianSettingsModal disconnect 텍스트 등은 coralDark) |

### 수정 3-4. 여백/컴포넌트 마무리
- `spacing`은 유지하되 카드 패딩만 상향: `ChatListItem.card` `padding: spacing.md`→`spacing.md + 2`, `MessageBubble.bubble` `paddingVertical: 10`→`12`.
- `MessageBubble` 내 말풍선에 `borderRadius: radius.lg`(18) + 오른쪽 하단 모서리 `borderBottomRightRadius: 6`로 말풍선 개성 부여(선택).
- BottomNav 활성 탭 색은 `colors.tealDark` 자동 적용 확인.

### 검증 (Step 3)
1. `npm run typecheck` → `npm run android` (또는 `tools\build-release-named.bat`).
2. People/Chats/Family/AI/Me 5탭 + 대화방 + 지킴이 화면 육안 검수: 텍스트 절단, 뱃지 대비, 내/상대 말풍선 구분.
3. Android "고대비 텍스트" 접근성 옵션에서도 주요 텍스트 확인.

---

## Step 4 — LFM2.5-2.8B 웹뷰 검색 점검 & LFM-DSpark 연동

### 4-A. 온디바이스 웹 검색 점검 결과

**구조(정상 확인)**: 온디바이스 엔진은 도구 프로토콜 없이 동작 — 하네스(`completeGuardianConversation`)가 `shouldSearchGuardianWeb()`으로 선제 판단 → 네이티브 WebView(`BrowserToolModule.search`)가 Naver 검색(실패 시 Bing 폴백, 15초 타임아웃, 추출 재시도 2회, 차단 문구 감지) → `[웹 도구 결과]`를 대화에 주입 → 마이크로 프롬프트에 grounded 지침 포함 → 1회 답변. `webToolsAvailable()`은 Android + BrowserToolModule 빌드 여부 체크로 정상.

**발견된 리스크와 개선**:
1. **저사양(ctx=1024) 컨텍스트 초과 위험**: 시스템 프롬프트 1200자 허용 + 웹 결과 420자 + 대화 900자 → 한국어 기준 토큰 초과로 답변 절단/빈 응답 가능. → Step 2의 수정 2-2(900자 예산)와 아래 스니펫 축소로 해결.
2. 검색 오탐 완화(선택): `guardianWebSearchPolicy.ts`의 `FACT_QUESTION_PATTERN`이 "설명해 줘" 등 일상 대화도 검색 트리거 → `PERSONAL_SUPPORT_PATTERN` 우선순위는 이미 반영됨. 필요 시 `FACT_QUESTION_PATTERN`에서 `설명해\s*줘` 제거.

**파일**: `src/services/guardianWebTools.ts`
```ts
// ctx 1024 기기에서 프롬프트 예산 보호 (기존 320/420 → 280/360)
const COMPACT_PAGE_LIMITS: WebPageFormatLimits = { textChars: 280, linkCount: 3, totalChars: 360 };
```

### 4-B. LFM-DSpark · 원본 GGUF 병행 구동 구조

**현황**: `AiModelStorageModule.scanModels()`가 AiModels 폴더의 **모든 `.gguf`를 스캔**하므로, LFM-DSpark GGUF와 LFM2.5-2.8B 원본 GGUF는 파일명만 다르면 둘 다 목록에 나타나고 `selectModel`로 상호 전환 가능합니다. 단, 동시 로드는 메모리상 비현실적(2.8B Q4 ≈ 1.6~2GB × 2)이므로 **"단일 컨텍스트 + 빠른 모델 전환"이 올바른 병행 구조**입니다.

**연동 지원 패치**:

1) 분할 GGUF(`-00001-of-000NN.gguf`)는 llama.rn 단일 파일 로딩과 호환되지 않으므로 목록에서 제외하고 안내 (Kotlin):
```kotlin
private fun isSplitGgufPart(name: String): Boolean =
  Regex("-\\d{5}-of-\\d{5}\\.gguf$", RegexOption.IGNORE_CASE).containsMatchIn(name)

// scanModels() 내 filter에 추가
.filter { it.isFile && it.name?.endsWith(".gguf", ignoreCase = true) == true && !isSplitGgufPart(it.name ?: "") }
```
그리고 `applyDirectory`의 빈 폴더 안내에 분할 파일 존재 시 문구 추가 권장:
`"분할 GGUF(-of-NNN.gguf)는 하나의 .gguf로 병합 후 연결해 주세요."`

2) 모델 패밀리 감지 유틸(TS, `src/services/onDeviceAi.ts`):
```ts
export function detectOnDeviceModelFamily(name: string): 'lfm' | 'other' {
  return /lfm|dspark/i.test(name) ? 'lfm' : 'other';
}
```
- 용도: 설정 모델 목록에 "LFM 계열" 배지 표시, LFM 특유 제어 토큰(`<|pad|>` 등 — STOP_WORDS에 이미 반영됨) 유지 확인. DSpark 포함 LFM 계열은 현재 STOP_WORDS/jinja 설정과 호환됩니다.

3) 온디바이스→클라우드 자동 폴백(선택, "함께 활용" 강화): `runCompletion` catch 블록에서
`engine==='onDevice' && !stopped && openRouterConnected && error.message.includes('답변 본문')` 조건으로
`completeGuardianConversation(baseMessages, { ...guardianProfile, aiEngineType: 'openRouter' }, ...)` 1회 재시도 후
상태 메시지 "기기 AI가 어려워 클라우드로 이어받았어요." — 클라우드 미연결 시 기존 동작 유지.

### 검증 (Step 4)
1. `npm run test:web-tools && npm run test:chat-capabilities && npm run typecheck`
2. 온디바이스 모델 선택 → "오늘 서울 날씨 알려줘" → 지킴이 웹 확인 알림(포그라운드 서비스) 노출 → 검색 결과 기반 한국어 답변 확인. (진단 로그 버튼에서 `web_tool_ok` 확인)
3. AiModels 폴더에 LFM2.5-2.8B 원본 GGUF + LFM-DSpark GGUF 동시 배치 → 두 모델이 모두 목록에 보이고 전환 로드 각각 성공 확인. 분할 GGUF 넣으면 목록 제외되는지 확인.

---

## 전체 요약

| Step | 핵심 원인 | 핵심 수정 |
|------|-----------|-----------|
| 1 | 네이티브 알림이 앱 읽음과 무연결 + read POST 실패 무시 | PushTokenModule cancel API 추가, markRoomAsRead 2회 시도 + 성공 시 알림 취소 |
| 2 | 온디바이스 마이크로 프롬프트에 시놉시스 누락, 규칙은 제목만 | 페르소나 160~320자 + 규칙 지침 3~5개 주입, ctx 기반 예산 |
| 3 | 기계적 그린 톤 + 시스템 폰트 | theme.ts 파스텔 팔레트/라운드/글자 크기 교체, 하드코딩 색 치환, Pretendard |
| 4 | 저사양 ctx 초과 위험, 분할 GGUF 미안내 | 스니펫 예산 축소, 분할 GGUF 필터, LFM/DSpark 패밀리 감지, 클라우드 폴백 옵션 |

모든 수정은 기능·API 호환을 유지하며, 신규 네이티브 메서드는 옵셔널 체이닝(`NativePushToken?.cancelRoomNotifications?.`)으로 구버전 빌드와의 호환성을 보장합니다.
