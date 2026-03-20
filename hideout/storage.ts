import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDefaultHideoutScene } from './scene';
import type { HideoutPlacedObject, HideoutSceneState } from './types';

const HIDEOUT_STORAGE_PREFIX = 'ourhangout.hideout-3d.v1';

const hideoutStorageKey = (ownerKey: string) => `${HIDEOUT_STORAGE_PREFIX}.${ownerKey || 'guest'}`;

const parseObject = (value: unknown): HideoutPlacedObject | null => {
  const item = value as HideoutPlacedObject | null | undefined;
  if (!item?.id || !item.kind) return null;
  const fallbackScene = createDefaultHideoutScene();
  const fallback = fallbackScene.placedObjects.find((candidate) => candidate.id === item.id) ?? fallbackScene.placedObjects[0];
  return {
    id: String(item.id),
    kind: item.kind,
    position: {
      x: Number(item.position?.x ?? fallback.position.x),
      z: Number(item.position?.z ?? fallback.position.z),
    },
    rotationY: Number(item.rotationY ?? fallback.rotationY ?? 0),
    ...(item.interactive ? { interactive: true } : {}),
    ...(item.target ? { target: item.target } : {}),
    ...(item.wallMounted ? { wallMounted: true } : {}),
    ...(item.interactionAnchor
      ? {
          interactionAnchor: {
            x: Number(item.interactionAnchor.x ?? fallback.interactionAnchor?.x ?? 0),
            z: Number(item.interactionAnchor.z ?? fallback.interactionAnchor?.z ?? 0),
          },
        }
      : fallback.interactionAnchor
        ? { interactionAnchor: { ...fallback.interactionAnchor } }
        : {}),
  };
};

const parseScene = (raw: string | null | undefined): HideoutSceneState | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HideoutSceneState;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.placedObjects)) return null;
    const fallback = createDefaultHideoutScene();
    return {
      roomThemeId: 'sunny-room',
      avatar: {
        x: Number(parsed.avatar?.x ?? fallback.avatar.x),
        z: Number(parsed.avatar?.z ?? fallback.avatar.z),
      },
      placedObjects: parsed.placedObjects.map(parseObject).filter(Boolean) as HideoutPlacedObject[],
      updatedAt: Number(parsed.updatedAt || Date.now()),
    };
  } catch {
    return null;
  }
};

export const readHideoutScene = async (ownerKey: string): Promise<HideoutSceneState> => {
  try {
    const stored = await AsyncStorage.getItem(hideoutStorageKey(ownerKey));
    return parseScene(stored) ?? createDefaultHideoutScene();
  } catch {
    return createDefaultHideoutScene();
  }
};

export const writeHideoutScene = async (ownerKey: string, scene: HideoutSceneState): Promise<void> => {
  await AsyncStorage.setItem(hideoutStorageKey(ownerKey), JSON.stringify(scene));
};
