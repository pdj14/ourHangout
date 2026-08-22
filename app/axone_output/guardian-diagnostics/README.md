# 지킴이 AI 오류 진단 로그 패치 (OpenRouter "잠시 길을 잃었어요" 원인 확인용)

## 1. 왜 지금은 원인을 알 수 없었나 (수정 전 3개의 정보 소실 지점)

| # | 위치 | 문제 |
|---|------|------|
| 1 | `openAiCompatibleTransport.ts` 최외곽 catch | `OpenAiProviderError`가 아닌 모든 오류(JSON 파싱 실패, 스트림 도중 네트워크 끊김 등)를 정해진 문구("AI 제공자에 연결하지 못했어요...")로 **덮어써서 원본 오류를 폐기** |
| 2 | SSE 스트림 `consume()` | OpenRouter는 HTTP 200으로도 `data: {"error": {...}}` 이벤트를 보냄. 기존 코드는 이 필드를 무시 → 내용 없음 → "모델이 빈 응답을 반환했어요"로만 표시 (업스트림 에러 메시지/코드/metadata.raw 전부 유실) |
| 3 | `responseError()` | 401/402/429 응답 본문을 버리고, 나머지도 240자 절단. HTTP 상태·모델 ID·호스트·원문 body 어디에도 남지 않음 |

PC에서 되고 폰에서 안 되는 경우 대표 원인(이제 로그로 구분됨):
- 폰의 아웃바운드가 차단되거나 프록시/TLS 문제 → `[원인: TypeError: Network request failed]`
- 앱 OAuth 키 한도/크레딧 → `HTTP 402 · msg="..."` (PC에서 다른 키를 썼다면 결과가 다를 수 있음)
- 무료 모델 업스트림 장애/큐 타임아웃 → `stream_payload_error` 로그에 upstream raw 에러 기록
- 요청 파라미터 거부(모달리티·도구 미지원 등) → `HTTP 400/404 · body="..."`

## 2. 수정 내용 요약

### `src/services/aiProviders/openAiCompatibleTransport.ts`
- 링 버퍼 진단 로거 추가: `logAiTransport` / `getAiTransportLogs` / `clearAiTransportLogs` (최근 150건, 메모리만 사용)
- `aiProviders/index.ts`가 `export *` 이므로 별도 barrel 수정 불필요
- 모든 HTTP 에러 메시지에 `[상세] HTTP <status> · model=<id> · <host> · code=<code> · msg="..." · body="..."` 첨부
- SSE `error` 페이로드 캡처 → 내용이 비면 `모델이 오류를 반환했어요. <message> (code ...) raw=...` 로 반환
- 최외곽 catch가 원인을 버리지 않고 `[원인: ErrorName: message]` 첨부
- 요청 시작/완료/빈 응답/정화 실패(sanitize 실패 시 원문 200자 preview) 로그 기록

### `src/services/guardianConversation.ts`
- `completion_start`(엔진/프로바이더/모델), 라운드 시작/실패, 재시도 사유(control_token / malformed_tool / uncertain / language / empty_response), 웹 도구 성공/실패(소요 ms), 최종 완료(글자 수) 로그 추가
- 동작 로직 자체는 변경 없음 — 로그만 추가

### `src/screens/OnDeviceAiScreen.tsx`
- 헤더에 **진단 로그 버튼(벌레 아이콘)** 추가 → 바텀시트 모달로 화면 로그 + 전송 계층 로그를 함께 표시
- 각 텍스트가 `selectable`이라 길게 눌러 선택 후 OS 복사 가능 (새 의존성 없음, expo-clipboard 불필요)
- 전송 시작/응답 완료/오류 발생 시 화면 측 로그 1줄씩 기록 (오류 줄에는 error name + provider code 포함)
- 새 라이브러리 import 없음 (`Modal`은 react-native 기본)

## 3. 적용 방법

아래 3개 파일을 같은 상대 경로의 기존 파일과 **교체**하면 됩니다 (드롭인 교체, 신규 의존성 없음):

```
guardian-diagnostics/src/services/aiProviders/openAiCompatibleTransport.ts
guardian-diagnostics/src/services/guardianConversation.ts
guardian-diagnostics/src/screens/OnDeviceAiScreen.tsx
```

교체 후 `npx tsc --noEmit` 또는 평소 빌드로 타입 확인 권장.

## 4. 사용 방법

1. 지킴이 탭 우상단 **벌레 아이콘** 탭 → 진단 로그 시트 열림 (대화 생성 중에도 열 수 있음)
2. 오류 재현: OpenRouter + Ox Alpha 선택 후 질문 전송
3. "비우기"로 초기화 후 재현하면 해당 1회 분만 깨끗하게 남음
4. 오류 직후 시트를 열어 마지막 줄들 확인:
   - `[hh:mm:ss] 오류 발생 · OpenAiProviderError · code=request · 잠시 길을 잃었어요...`
   - `[hh:mm:ss] transport/http_error {"status":400,...,"body":"..."}`
   - `[hh:mm:ss] transport/stream_payload_error {"error":"...(code 429) raw=..."}` ← OpenRouter 200+에러 케이스
   - `[hh:mm:ss] transport/chat_failed {"cause":"TypeError: Network request failed"}` ← 폰 네트워크/TLS 차단 케이스

## 5. 검증 상태 (중요)

- 이 환경에서는 소스 편집/빌드 명령 실행이 불가하여 **타입체크·에뮬레이터 실행 검증은 하지 못했습니다.**
- 세 파일은 기존 코드에 로그·UI 추가만 한 것이며 기존 함수 시그니처와 export는 그대로 유지했습니다.
- 적용 후 빌드 시 문제가 생기면 README 2절의 변경 목록과 비교해 확인해 주세요.
