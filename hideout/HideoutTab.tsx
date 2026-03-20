import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HideoutPanelContent } from './HideoutPanelContent';
import { HideoutRoomCanvas } from './HideoutRoomCanvas';
import { addDecorObject, clampRoom, createDefaultHideoutScene, panelTitle, updateObject } from './scene';
import { readHideoutScene, writeHideoutScene } from './storage';
import type { HideoutInteractiveTarget, HideoutLocale, HideoutSceneState, HideoutVec2 } from './types';

type HideoutTabProps = {
  locale: HideoutLocale;
  ownerKey: string;
  ownerName: string;
};

type OpenPanelState = {
  target: HideoutInteractiveTarget;
  objectId: string;
};

type MoveTargetState = {
  destination: HideoutVec2;
  objectId?: string;
  target?: HideoutInteractiveTarget;
};

const HIDEOUT = {
  text: '#223748',
  textSoft: 'rgba(56, 73, 89, 0.82)',
  textMuted: 'rgba(97, 111, 121, 0.82)',
  panel: 'rgba(255,253,249,0.94)',
  panelSoft: 'rgba(255,255,255,0.84)',
  border: 'rgba(172, 179, 193, 0.32)',
  primarySoft: 'rgba(36,55,72,0.12)',
  accent: '#E9B264',
  accentSoft: 'rgba(233,178,100,0.16)',
};

const moveDistance = (from: HideoutVec2, to: HideoutVec2) => Math.hypot(from.x - to.x, from.z - to.z);

const directionButtons = [
  { id: 'up', icon: 'arrow-up', dx: 0, dz: -0.16 },
  { id: 'left', icon: 'arrow-back', dx: -0.16, dz: 0 },
  { id: 'right', icon: 'arrow-forward', dx: 0.16, dz: 0 },
  { id: 'down', icon: 'arrow-down', dx: 0, dz: 0.16 },
] as const;

export function HideoutTab({ locale, ownerKey, ownerName }: HideoutTabProps) {
  const isKo = locale === 'ko';
  const [scene, setScene] = useState<HideoutSceneState>(createDefaultHideoutScene());
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const [openPanel, setOpenPanel] = useState<OpenPanelState | null>(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [moveTarget, setMoveTarget] = useState<MoveTargetState | null>(null);
  const hydratedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const moveTargetRef = useRef<MoveTargetState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const stored = await readHideoutScene(ownerKey);
      if (cancelled) return;
      setScene(stored);
      setSelectedObjectId(stored.placedObjects.find((item) => !item.wallMounted)?.id || stored.placedObjects[0]?.id || '');
      setSaveStatus(isKo ? '이 방은 이 기기에 저장돼요.' : 'This room is saved on this device.');
      setIsLoading(false);
      hydratedRef.current = true;
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [ownerKey, isKo]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const timer = setTimeout(() => {
      void writeHideoutScene(ownerKey, scene)
        .then(() => setSaveStatus(isKo ? '배치가 저장됐어요.' : 'Layout saved.'))
        .catch(() => setSaveStatus(isKo ? '저장에 실패했어요.' : 'Save failed.'));
    }, 260);
    return () => clearTimeout(timer);
  }, [scene, ownerKey, isKo]);

  useEffect(() => {
    moveTargetRef.current = moveTarget;
    if (!moveTarget) return;

    let lastTime = Date.now();
    const step = () => {
      const target = moveTargetRef.current;
      if (!target) return;
      const now = Date.now();
      const dt = Math.min(48, now - lastTime);
      lastTime = now;
      const speed = 0.0024 * dt;

      setScene((prev) => {
        const dx = target.destination.x - prev.avatar.x;
        const dz = target.destination.z - prev.avatar.z;
        const distance = Math.hypot(dx, dz);

        if (distance <= 0.02) {
          const nextScene = { ...prev, avatar: { ...target.destination } };
          if (target.target && target.objectId) {
            setOpenPanel({ target: target.target, objectId: target.objectId });
          }
          setMoveTarget(null);
          moveTargetRef.current = null;
          return nextScene;
        }

        const ratio = Math.min(1, speed / distance);
        return {
          ...prev,
          avatar: {
            x: prev.avatar.x + dx * ratio,
            z: prev.avatar.z + dz * ratio,
          },
        };
      });

      if (moveTargetRef.current) {
        frameRef.current = requestAnimationFrame(step);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [moveTarget]);

  const selectedObject = useMemo(
    () => scene.placedObjects.find((item) => item.id === selectedObjectId) ?? null,
    [scene.placedObjects, selectedObjectId]
  );

  const interactiveObjects = scene.placedObjects.filter((item) => item.interactive);

  const requestMove = (destination: HideoutVec2, panel?: OpenPanelState | null) => {
    const nextDestination = clampRoom(destination);
    if (moveDistance(scene.avatar, nextDestination) <= 0.05) {
      if (panel) setOpenPanel(panel);
      return;
    }
    setOpenPanel(null);
    setMoveTarget({
      destination: nextDestination,
      ...(panel?.objectId ? { objectId: panel.objectId } : {}),
      ...(panel?.target ? { target: panel.target } : {}),
    });
  };

  const handleFloorPress = (position: HideoutVec2) => {
    if (isEditMode) return;
    requestMove(position);
  };

  const handleObjectPress = (objectId: string) => {
    const object = scene.placedObjects.find((item) => item.id === objectId);
    if (!object) return;

    if (isEditMode) {
      setSelectedObjectId(object.id);
      setOpenPanel(null);
      return;
    }

    if (object.interactionAnchor) {
      requestMove(object.interactionAnchor, object.target ? { target: object.target, objectId: object.id } : null);
      return;
    }

    if (object.target) {
      setOpenPanel({ target: object.target, objectId: object.id });
    }
  };

  const nudgeSelectedObject = (dx: number, dz: number) => {
    if (!selectedObjectId) return;
    setScene((prev) =>
      updateObject(prev, selectedObjectId, (item) => ({
        ...item,
        position: clampRoom({ x: item.position.x + dx, z: item.position.z + dz }),
      }))
    );
  };

  const rotateSelectedObject = () => {
    if (!selectedObjectId) return;
    setScene((prev) =>
      updateObject(prev, selectedObjectId, (item) => ({
        ...item,
        rotationY: item.rotationY + Math.PI / 12,
      }))
    );
  };

  const addPlant = () => setScene((prev) => addDecorObject(prev, 'plant'));
  const addLamp = () => setScene((prev) => addDecorObject(prev, 'lamp'));

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>{isKo ? '아지트를 불러오는 중...' : 'Loading your hideout...'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <HideoutRoomCanvas
        avatar={scene.avatar}
        mode={isEditMode ? 'edit' : 'view'}
        objects={scene.placedObjects}
        selectedObjectId={selectedObjectId}
        onFloorPress={handleFloorPress}
        onObjectPress={handleObjectPress}
      />

      <View style={styles.topHud}>
        <View style={styles.topActions}>
          <Pressable style={styles.roundBtn} onPress={() => setIsEditMode((prev) => !prev)}>
            <Ionicons name={isEditMode ? 'eye-outline' : 'create-outline'} size={18} color={HIDEOUT.text} />
          </Pressable>
          <Pressable
            style={styles.roundBtn}
            onPress={() => {
              addPlant();
              setSelectedObjectId('');
              setIsEditMode(true);
            }}
          >
            <Ionicons name="leaf-outline" size={18} color={HIDEOUT.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.bottomHud}>
        <View style={styles.statusPill}>
          <Ionicons name="sparkles" size={14} color={HIDEOUT.accent} />
          <Text style={styles.statusText}>{saveStatus}</Text>
        </View>

        {isEditMode ? (
          <View style={styles.editorPanel}>
            <View style={styles.editorHeader}>
              <Text style={styles.panelTitle}>{isKo ? '편집 모드' : 'Edit Mode'}</Text>
              <Text style={styles.panelMeta}>
                {selectedObject ? selectedObject.kind : isKo ? '오브젝트를 선택하세요.' : 'Select an object.'}
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editChipRow}>
              <Pressable style={styles.editChip} onPress={addPlant}>
                <Text style={styles.editChipText}>{isKo ? '화분 추가' : 'Add Plant'}</Text>
              </Pressable>
              <Pressable style={styles.editChip} onPress={addLamp}>
                <Text style={styles.editChipText}>{isKo ? '램프 추가' : 'Add Lamp'}</Text>
              </Pressable>
            </ScrollView>

            {selectedObject ? (
              <View style={styles.controlsWrap}>
                <View style={styles.controlGrid}>
                  {directionButtons.map((button) => (
                    <Pressable
                      key={button.id}
                      style={styles.controlBtn}
                      onPress={() => nudgeSelectedObject(button.dx, button.dz)}
                    >
                      <Ionicons name={button.icon} size={16} color={HIDEOUT.text} />
                    </Pressable>
                  ))}
                </View>
                <Pressable style={styles.rotateBtn} onPress={rotateSelectedObject}>
                  <Ionicons name="refresh" size={16} color={HIDEOUT.text} />
                  <Text style={styles.rotateBtnText}>{isKo ? '회전' : 'Rotate'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
            {interactiveObjects.map((item) => (
              <Pressable
                key={item.id}
                style={[styles.quickCard, openPanel?.objectId === item.id && styles.quickCardOn]}
                onPress={() => handleObjectPress(item.id)}
              >
                <Text style={styles.quickCardTitle}>{panelTitle(locale, item.target)}</Text>
                <Text style={styles.quickCardBody}>
                  {isKo ? '가까이 가서 확인하기' : 'Walk over to check it'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {openPanel ? (
        <View style={styles.panelWrap}>
          <View style={styles.panelCard}>
            <View style={styles.panelHead}>
              <View>
                <Text style={styles.panelEyebrow}>{isKo ? '사물 상호작용' : 'Object Interaction'}</Text>
                <Text style={styles.panelTitle}>{panelTitle(locale, openPanel.target)}</Text>
              </View>
              <Pressable style={styles.panelClose} onPress={() => setOpenPanel(null)}>
                <Ionicons name="close" size={18} color={HIDEOUT.text} />
              </Pressable>
            </View>
            <View style={styles.panelList}>
              <HideoutPanelContent locale={locale} target={openPanel.target} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 620,
  },
  loadingWrap: {
    flex: 1,
    minHeight: 620,
    borderRadius: 32,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: HIDEOUT.text,
    fontSize: 18,
    fontWeight: '800',
  },
  topHud: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 12,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
  },
  roundBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HIDEOUT.panel,
    borderWidth: 1,
    borderColor: HIDEOUT.border,
  },
  bottomHud: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    gap: 10,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: HIDEOUT.panel,
    borderWidth: 1,
    borderColor: HIDEOUT.border,
  },
  statusText: {
    color: HIDEOUT.text,
    fontSize: 12,
    fontWeight: '700',
  },
  quickRow: {
    gap: 10,
    paddingRight: 8,
  },
  quickCard: {
    width: 166,
    borderRadius: 24,
    padding: 14,
    backgroundColor: HIDEOUT.panelSoft,
    borderWidth: 1,
    borderColor: HIDEOUT.border,
    gap: 6,
  },
  quickCardOn: {
    borderColor: HIDEOUT.accent,
    backgroundColor: '#FFF7EC',
  },
  quickCardTitle: {
    color: HIDEOUT.text,
    fontSize: 14,
    fontWeight: '800',
  },
  quickCardBody: {
    color: HIDEOUT.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  editorPanel: {
    borderRadius: 28,
    padding: 16,
    backgroundColor: HIDEOUT.panel,
    borderWidth: 1,
    borderColor: HIDEOUT.border,
    gap: 12,
  },
  editorHeader: {
    gap: 4,
  },
  panelTitle: {
    color: HIDEOUT.text,
    fontSize: 18,
    fontWeight: '800',
  },
  panelMeta: {
    color: HIDEOUT.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  editChipRow: {
    gap: 10,
    paddingRight: 8,
  },
  editChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: HIDEOUT.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(233,178,100,0.34)',
  },
  editChipText: {
    color: HIDEOUT.text,
    fontSize: 13,
    fontWeight: '700',
  },
  controlsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  controlGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  controlBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: HIDEOUT.border,
  },
  rotateBtn: {
    minHeight: 46,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: HIDEOUT.border,
  },
  rotateBtnText: {
    color: HIDEOUT.text,
    fontSize: 13,
    fontWeight: '700',
  },
  panelWrap: {
    position: 'absolute',
    right: 14,
    top: 96,
    width: 340,
  },
  panelCard: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: HIDEOUT.panel,
    borderWidth: 1,
    borderColor: HIDEOUT.border,
    gap: 14,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelEyebrow: {
    color: HIDEOUT.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  panelClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HIDEOUT.primarySoft,
  },
  panelList: {
    gap: 2,
  },
});
