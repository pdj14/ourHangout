import type { HideoutLocale, HideoutObjectKind, HideoutPlacedObject, HideoutSceneState, HideoutVec2 } from './types';

const nextObjectId = (kind: HideoutObjectKind) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const clampRoom = (value: HideoutVec2): HideoutVec2 => ({
  x: Math.min(2.6, Math.max(-2.6, value.x)),
  z: Math.min(2.1, Math.max(-2.2, value.z)),
});

export const createDefaultHideoutScene = (): HideoutSceneState => ({
  roomThemeId: 'sunny-room',
  avatar: { x: 0.15, z: 1.45 },
  placedObjects: [
    {
      id: 'bed-main',
      kind: 'bed',
      position: { x: -1.55, z: 0.95 },
      rotationY: 0,
      interactionAnchor: { x: -0.7, z: 1.45 },
    },
    {
      id: 'desk-main',
      kind: 'desk',
      position: { x: 1.48, z: 0.96 },
      rotationY: 0,
      interactionAnchor: { x: 0.9, z: 1.5 },
    },
    {
      id: 'calendar-wall',
      kind: 'calendar',
      position: { x: -1.05, z: -2.72 },
      rotationY: 0,
      wallMounted: true,
      interactive: true,
      target: 'calendar',
      interactionAnchor: { x: -0.7, z: -1.8 },
    },
    {
      id: 'timetable-wall',
      kind: 'timetable',
      position: { x: 1.2, z: -2.72 },
      rotationY: 0,
      wallMounted: true,
      interactive: true,
      target: 'timetable',
      interactionAnchor: { x: 0.9, z: -1.75 },
    },
    {
      id: 'todo-board',
      kind: 'todo',
      position: { x: -2.72, z: 0.5 },
      rotationY: Math.PI / 2,
      wallMounted: true,
      interactive: true,
      target: 'todo',
      interactionAnchor: { x: -1.95, z: 0.55 },
    },
    {
      id: 'album-frame',
      kind: 'album',
      position: { x: -2.72, z: -0.85 },
      rotationY: Math.PI / 2,
      wallMounted: true,
      interactive: true,
      target: 'album',
      interactionAnchor: { x: -1.95, z: -0.75 },
    },
    {
      id: 'music-player',
      kind: 'music',
      position: { x: 1.8, z: 0.82 },
      rotationY: 0,
      interactive: true,
      target: 'music',
      interactionAnchor: { x: 1.18, z: 1.42 },
    },
    {
      id: 'plant-starter',
      kind: 'plant',
      position: { x: 2.18, z: -0.2 },
      rotationY: 0,
      interactionAnchor: { x: 1.82, z: 0.34 },
    },
    {
      id: 'lamp-starter',
      kind: 'lamp',
      position: { x: -2.16, z: 1.5 },
      rotationY: 0,
      interactionAnchor: { x: -1.56, z: 1.8 },
    },
  ],
  updatedAt: Date.now(),
});

export const panelTitle = (locale: HideoutLocale, target: HideoutPlacedObject['target']) => {
  if (target === 'calendar') return locale === 'ko' ? '벽 달력' : 'Wall Calendar';
  if (target === 'timetable') return locale === 'ko' ? '시간표 보드' : 'Timetable Board';
  if (target === 'todo') return locale === 'ko' ? '할 일 게시판' : 'Todo Board';
  if (target === 'album') return locale === 'ko' ? '사진 액자' : 'Photo Frame';
  if (target === 'music') return locale === 'ko' ? '오디오 플레이어' : 'Music Player';
  return locale === 'ko' ? '아지트' : 'Hideout';
};

export const addDecorObject = (scene: HideoutSceneState, kind: 'plant' | 'lamp'): HideoutSceneState => {
  const next: HideoutPlacedObject = {
    id: nextObjectId(kind),
    kind,
    position: kind === 'plant' ? { x: 1.95, z: 1.65 } : { x: -1.95, z: 1.72 },
    rotationY: 0,
    interactionAnchor: kind === 'plant' ? { x: 1.48, z: 1.95 } : { x: -1.45, z: 1.95 },
  };
  return {
    ...scene,
    placedObjects: [...scene.placedObjects, next],
    updatedAt: Date.now(),
  };
};

export const updateObject = (
  scene: HideoutSceneState,
  objectId: string,
  updater: (object: HideoutPlacedObject) => HideoutPlacedObject
): HideoutSceneState => ({
  ...scene,
  placedObjects: scene.placedObjects.map((item) => (item.id === objectId ? updater(item) : item)),
  updatedAt: Date.now(),
});
