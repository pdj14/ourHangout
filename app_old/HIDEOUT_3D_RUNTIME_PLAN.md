# Hideout 3D Runtime Plan

## 1. 목표

이 문서는 컨셉 시안을 실제 앱 기능으로 내리기 위한 구현 계획입니다.

목표 화면은 다음과 같습니다.

- 아지트 탭 진입 시 전체 화면의 방이 바로 열린다
- 아바타가 직접 방 안을 이동한다
- 달력, 시간표, 게시판, 액자 같은 오브젝트와 상호작용한다
- 클릭 즉시 기능이 열리는 것이 아니라
  - 오브젝트를 탭
  - 아바타가 해당 위치로 이동
  - 도착 후 패널 오픈
- 전체 감정은 아지트 같고, 잔잔하고, 힐링되어야 한다

## 2. 권장 구현 수준

이 프로젝트에서 현실적으로 선택 가능한 수준은 세 가지입니다.

### Level 1. 2.5D 페이크 3D

- React Native 뷰 또는 Skia로 아이소메트릭 방을 그림
- 아바타와 오브젝트를 스프라이트로 렌더
- 깊이감은 레이어와 투영으로 해결

장점:

- 구현 난도가 가장 낮음
- 빠르게 시연 가능
- 기존 앱 구조에 붙이기 쉬움

단점:

- 진짜 3D 카메라와 회전은 어려움
- 앞으로 확장할 때 한계가 빨리 옴

### Level 2. 진짜 3D 룸

- 3D 씬, 카메라, 아바타, 오브젝트를 실제로 렌더
- 터치한 위치나 오브젝트로 아바타 이동
- UI는 별도 React Native 오버레이로 처리

장점:

- 사용자가 원하는 방향에 가장 가깝다
- 동물의 숲식 이동 감각을 살리기 좋다
- 방을 늘리거나 카메라 변화를 주기 쉽다

단점:

- 구현 비용이 높다
- 에셋 관리와 성능 관리가 필요하다

### Level 3. 하이브리드

- 공간은 3D
- 패널과 UI는 React Native
- 편집도 일부는 RN 오버레이, 일부는 3D 씬 상호작용

이 프로젝트의 추천은 이 방식입니다.

이유:

- 원하는 공간감은 살릴 수 있고
- 달력/시간표/할 일 같은 앱 기능은 기존 RN 컴포넌트로 재사용할 수 있기 때문입니다

## 3. 추천 스택

현재 앱은 Expo SDK 55 / React Native 0.83 계열입니다.

공식 문서 기준으로 확인한 점:

- `expo-gl`는 2D/3D 그래픽 렌더 타깃인 `GLView`를 제공합니다
- Expo SDK 55는 New Architecture가 항상 활성화됩니다
- 개발 중 네이티브 구성을 자유롭게 쓰려면 development build가 적합합니다

추천 스택:

- `three`
- `@react-three/fiber/native`
- `expo-gl`
- 필요 시 낮은 레벨 보조로 `expo-three`
- UI 오버레이용 기존 React Native 컴포넌트
- 이동/패널 전환 애니메이션용 `react-native-reanimated`

추천 이유:

- 진짜 3D 공간을 만들 수 있음
- React 방식으로 씬을 구성하기 쉬움
- 방 안 오브젝트를 컴포넌트처럼 관리할 수 있음

보조 선택지:

- `@shopify/react-native-skia`

Skia는 멋진 2D 렌더링과 오버레이에는 강하지만,
이번 요구의 핵심인 "진짜 3D 공간 + 아바타 이동"의 주 엔진으로는 우선순위가 낮습니다.

## 4. 개발 환경 권장

지금 프로젝트는 Expo 기반이라 빠르게 시작할 수 있지만,
이번 기능은 단순 Expo Go 수준을 넘어갈 가능성이 큽니다.

권장:

- development build 기준으로 개발

이유:

- 3D 스택과 네이티브 구성을 더 자유롭게 다룰 수 있음
- 장기적으로 production-grade 기능에 맞음
- Expo 문서도 이런 경우 development build를 권장하는 흐름입니다

## 5. 씬 구조

권장 씬은 다음처럼 단순하게 시작합니다.

### Scene graph

- RoomRoot
  - Floor
  - LeftWall
  - RightWall
  - Window
  - Bed
  - Desk
  - CalendarBoard
  - TimetableBoard
  - TodoBoard
  - PhotoFrame
  - AudioPlayer
  - Plants
  - AmbientProps
  - Avatar

핵심은:

- 모든 오브젝트가 "예쁜 모델"이기 전에
- 위치, 상호작용, 기능 연결 정보가 있는 엔티티여야 한다는 점입니다

## 6. 데이터 모델

권장 타입 예시:

```ts
type HideoutInteractiveTarget =
  | 'calendar'
  | 'timetable'
  | 'todo'
  | 'album'
  | 'music'
  | 'memo';

type HideoutObjectPlacement = {
  id: string;
  kind: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  interactive?: boolean;
  target?: HideoutInteractiveTarget;
  interactionAnchor?: [number, number, number];
};

type HideoutAvatarState = {
  position: [number, number, number];
  facingY: number;
  state: 'idle' | 'walking' | 'interacting';
  targetObjectId?: string;
};

type HideoutSceneState = {
  roomThemeId: string;
  placedObjects: HideoutObjectPlacement[];
  avatar: HideoutAvatarState;
};
```

중요 필드:

- `target`: 어떤 패널을 열지
- `interactionAnchor`: 아바타가 멈춰야 하는 지점

## 7. 상호작용 규칙

### 바닥 탭

- 탭한 위치로 아바타 이동
- 이동 후 `idle`

### 오브젝트 탭

- 해당 오브젝트의 `interactionAnchor`로 이동
- 도착 시 `interacting`
- 연결된 패널 오픈

### 도착 판정

1차는 단순 거리 판정으로 충분합니다.

- 아바타와 anchor 사이 거리 < threshold

이 단계에서는 복잡한 navmesh가 필요 없습니다.

이유:

- 첫 방은 작은 한 칸 구조
- 장애물이 적음
- 직선 이동 + 충돌 보정 정도로도 충분히 자연스럽게 보일 수 있음

## 8. 카메라 전략

처음부터 자유 회전 카메라를 넣는 건 좋지 않습니다.

1차 권장:

- 고정 카메라
- 살짝 위에서 내려다보는 아이소메트릭/쿼터뷰
- 미세한 패럴랙스만 허용

이유:

- 싸이월드 감성 유지
- 힐링 톤 유지
- UI 안정성 확보
- 편집 모드 난도 감소

## 9. 패널 오픈 전략

오브젝트와 상호작용했을 때는
완전히 다른 페이지로 전환하지 않는 편이 좋습니다.

권장 방식:

- 반투명 딤
- 우측 패널 또는 하단 시트
- 방 배경은 그대로 유지

예:

- 달력 보드 -> 월간 달력 패널
- 시간표 보드 -> 오늘 시간표 패널
- 게시판 -> 체크리스트 패널

이 구조가 중요한 이유:

- 사용자가 여전히 자기 방 안에 있다고 느끼기 때문입니다

## 10. 편집 모드 구현

편집 모드는 별도 상태로 분리합니다.

### View mode

- 아바타 이동
- 오브젝트 상호작용
- 힐링 연출

### Edit mode

- 오브젝트 선택
- 위치 이동
- 회전
- 배치 저장
- 카테고리 트레이

권장 방식:

- 편집 중에는 아바타 이동 비활성화
- 오브젝트 선택 후 transform gizmo 대신 단순 이동 핸들 사용
- 모바일에서는 복잡한 3축 기즈모보다
  - 바닥 평면 이동
  - 회전 버튼
  - 앞/뒤 레이어 조정
  가 낫습니다

## 11. 성능 가드레일

초기에는 욕심을 줄여야 합니다.

권장 가드레일:

- 방 1개
- 카메라 1개
- 활성 오브젝트 15~25개
- 아바타 1명
- 동적 그림자 최소화
- 베이크된 조명 느낌 사용
- 에셋은 low-poly 또는 stylized
- 모델 포맷은 glTF/GLB 우선

## 12. 구현 단계

### Phase 1. 클릭 가능한 3D 방

- 3D 룸 렌더
- 기능 오브젝트 배치
- 탭 위치 하이라이트

### Phase 2. 아바타 이동

- 바닥 클릭 이동
- 오브젝트 탭 시 이동
- 도착 상태 처리

### Phase 3. 기능 패널 연결

- 달력
- 시간표
- 할 일
- 사진첩

### Phase 4. 편집 모드

- 가구 추가
- 위치 저장
- 벽/바닥 변경

### Phase 5. 힐링 연출

- 낮/밤
- 빛 변화
- 먼지/반짝임
- 배경음

## 13. 추천 결론

이 프로젝트에서 가장 맞는 방향은:

`하이브리드 3D 아지트`

입니다.

정리하면:

- 공간과 아바타는 진짜 3D
- 앱 기능 패널은 React Native
- 상호작용은 "걷고, 다가가고, 확인한다"
- 감성은 싸이월드, 사용감은 동물의 숲

## 14. 참고 자료

공식/원문 기준:

- Expo GLView: https://docs.expo.dev/versions/latest/sdk/gl-view/
- Expo New Architecture: https://docs.expo.dev/guides/new-architecture/
- Expo development builds 소개: https://docs.expo.dev/develop/development-builds/introduction/
- Expo development build 생성: https://docs.expo.dev/develop/development-builds/create-a-build/
- Expo Skia: https://docs.expo.dev/versions/latest/sdk/skia/
- React Three Fiber introduction: https://r3f.docs.pmnd.rs/getting-started/introduction
- Expo Three README: https://github.com/expo/expo-three
