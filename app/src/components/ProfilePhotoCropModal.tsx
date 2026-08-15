import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';

import { colors, radius, spacing, type } from '../theme';

type ProfilePhotoCropModalProps = {
  sourceUri: string;
  onCancel: () => void;
  onApply: (uri: string, mimeType: string) => Promise<void> | void;
};

type CropState = {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  minScale: number;
  maxScale: number;
  scale: number;
  renderWidth: number;
  renderHeight: number;
  overflowX: number;
  overflowY: number;
  offsetX: number;
  offsetY: number;
};

type TouchPoint = { pageX: number; pageY: number };

const CROP_BOX = 280;
const MAX_SOURCE_EDGE = 4096;
const MAX_OUTPUT_EDGE = 2048;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finiteOr = (value: number | null | undefined, fallback = 0) =>
  Number.isFinite(value) ? (value as number) : fallback;

function normalizeTouches(value: unknown): TouchPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      pageX: finiteOr((item as { pageX?: number }).pageX, Number.NaN),
      pageY: finiteOr((item as { pageY?: number }).pageY, Number.NaN),
    }))
    .filter((touch) => Number.isFinite(touch.pageX) && Number.isFinite(touch.pageY));
}

function touchDistance(touches: TouchPoint[]): number {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

function touchCenter(touches: TouchPoint[]) {
  return {
    x: (touches[0].pageX + touches[1].pageX) / 2,
    y: (touches[0].pageY + touches[1].pageY) / 2,
  };
}

function cropGeometry(imageWidth: number, imageHeight: number, scale: number) {
  const renderWidth = imageWidth * scale;
  const renderHeight = imageHeight * scale;
  return {
    renderWidth,
    renderHeight,
    overflowX: Math.max(0, renderWidth - CROP_BOX),
    overflowY: Math.max(0, renderHeight - CROP_BOX),
  };
}

async function normalizeImageForCrop(uri: string) {
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
  const maxEdge = Math.max(dimensions.width, dimensions.height);
  const actions: ImageManipulator.Action[] = [];
  if (maxEdge > MAX_SOURCE_EDGE) {
    if (dimensions.width >= dimensions.height) {
      actions.push({ resize: { width: MAX_SOURCE_EDGE } });
    } else {
      actions.push({ resize: { height: MAX_SOURCE_EDGE } });
    }
  }
  return ImageManipulator.manipulateAsync(uri, actions, {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
}

export function ProfilePhotoCropModal({ sourceUri, onCancel, onApply }: ProfilePhotoCropModalProps) {
  const [crop, setCrop] = useState<CropState | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [applying, setApplying] = useState(false);
  const cropRef = useRef<CropState | null>(null);
  const panPointerRef = useRef({ x: 0, y: 0 });
  const gestureModeRef = useRef<'none' | 'pan' | 'pinch'>('none');
  const pinchStartRef = useRef({
    distance: 0,
    scale: 1,
    centerPageX: 0,
    centerPageY: 0,
    centerImageX: 0,
    centerImageY: 0,
  });

  const setCropSynced = (updater: (current: CropState | null) => CropState | null) => {
    setCrop((current) => {
      const next = updater(current);
      cropRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    if (!sourceUri) {
      cropRef.current = null;
      setCrop(null);
      setPreparing(false);
      return;
    }
    let cancelled = false;
    setPreparing(true);
    void normalizeImageForCrop(sourceUri)
      .then((normalized) => {
        if (cancelled) return;
        const imageWidth = Math.max(1, normalized.width);
        const imageHeight = Math.max(1, normalized.height);
        const minScale = Math.max(CROP_BOX / imageWidth, CROP_BOX / imageHeight);
        const geometry = cropGeometry(imageWidth, imageHeight, minScale);
        const initial: CropState = {
          uri: normalized.uri,
          imageWidth,
          imageHeight,
          minScale,
          maxScale: minScale * 4,
          scale: minScale,
          ...geometry,
          offsetX: -geometry.overflowX / 2,
          offsetY: -geometry.overflowY / 2,
        };
        cropRef.current = initial;
        setCrop(initial);
      })
      .catch(() => {
        if (cancelled) return;
        Alert.alert('사진을 열지 못했습니다', '다른 사진을 선택해 주세요.');
        onCancel();
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUri]);

  const beginPinch = (current: CropState, touches: TouchPoint[]) => {
    const distance = touchDistance(touches);
    if (distance <= 0) return;
    const center = touchCenter(touches);
    gestureModeRef.current = 'pinch';
    pinchStartRef.current = {
      distance,
      scale: current.scale,
      centerPageX: center.x,
      centerPageY: center.y,
      centerImageX: (-current.offsetX + CROP_BOX / 2) / current.scale,
      centerImageY: (-current.offsetY + CROP_BOX / 2) / current.scale,
    };
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!cropRef.current,
        onMoveShouldSetPanResponder: () => !!cropRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event, gesture) => {
          const current = cropRef.current;
          if (!current) return;
          const touches = normalizeTouches(event.nativeEvent.touches);
          if (touches.length >= 2) {
            beginPinch(current, touches);
            return;
          }
          const changedTouches = normalizeTouches(event.nativeEvent.changedTouches);
          const lead = touches[0] || changedTouches[0];
          gestureModeRef.current = 'pan';
          panPointerRef.current = {
            x: lead?.pageX ?? finiteOr(gesture.moveX),
            y: lead?.pageY ?? finiteOr(gesture.moveY),
          };
        },
        onPanResponderMove: (event, gesture) => {
          const current = cropRef.current;
          if (!current) return;
          const touches = normalizeTouches(event.nativeEvent.touches);
          if (gesture.numberActiveTouches >= 2 && touches.length >= 2) {
            if (gestureModeRef.current !== 'pinch') {
              beginPinch(current, touches);
              return;
            }
            const start = pinchStartRef.current;
            const distance = touchDistance(touches);
            if (start.distance <= 0 || distance <= 0) return;
            const center = touchCenter(touches);
            const nextScale = clamp(start.scale * (distance / start.distance), current.minScale, current.maxScale);
            const geometry = cropGeometry(current.imageWidth, current.imageHeight, nextScale);
            const offsetX = clamp(
              CROP_BOX / 2 - start.centerImageX * nextScale + center.x - start.centerPageX,
              -geometry.overflowX,
              0
            );
            const offsetY = clamp(
              CROP_BOX / 2 - start.centerImageY * nextScale + center.y - start.centerPageY,
              -geometry.overflowY,
              0
            );
            setCropSynced((previous) =>
              previous ? { ...previous, scale: nextScale, ...geometry, offsetX, offsetY } : previous
            );
            return;
          }

          const changedTouches = normalizeTouches(event.nativeEvent.changedTouches);
          const lead = touches[0] || changedTouches[0];
          if (!lead) return;
          if (gestureModeRef.current !== 'pan') {
            gestureModeRef.current = 'pan';
            panPointerRef.current = { x: lead.pageX, y: lead.pageY };
            return;
          }
          const deltaX = lead.pageX - panPointerRef.current.x;
          const deltaY = lead.pageY - panPointerRef.current.y;
          panPointerRef.current = { x: lead.pageX, y: lead.pageY };
          setCropSynced((previous) =>
            previous
              ? {
                  ...previous,
                  offsetX: clamp(previous.offsetX + deltaX, -previous.overflowX, 0),
                  offsetY: clamp(previous.offsetY + deltaY, -previous.overflowY, 0),
                }
              : previous
          );
        },
        onPanResponderRelease: () => {
          gestureModeRef.current = 'none';
        },
        onPanResponderTerminate: () => {
          gestureModeRef.current = 'none';
        },
      }),
    []
  );

  const zoom = (zoomIn: boolean) => {
    setCropSynced((current) => {
      if (!current) return current;
      const nextScale = clamp(current.scale * (zoomIn ? 1.2 : 1 / 1.2), current.minScale, current.maxScale);
      const centerX = (-current.offsetX + CROP_BOX / 2) / current.scale;
      const centerY = (-current.offsetY + CROP_BOX / 2) / current.scale;
      const geometry = cropGeometry(current.imageWidth, current.imageHeight, nextScale);
      return {
        ...current,
        scale: nextScale,
        ...geometry,
        offsetX: clamp(CROP_BOX / 2 - centerX * nextScale, -geometry.overflowX, 0),
        offsetY: clamp(CROP_BOX / 2 - centerY * nextScale, -geometry.overflowY, 0),
      };
    });
  };

  const centerCrop = () => {
    setCropSynced((current) =>
      current
        ? { ...current, offsetX: -current.overflowX / 2, offsetY: -current.overflowY / 2 }
        : current
    );
  };

  const applyCrop = async () => {
    const current = cropRef.current;
    if (!current || applying) return;
    setApplying(true);
    try {
      const cropSide = Math.max(
        1,
        Math.min(
          Math.round(CROP_BOX / current.scale),
          Math.round(current.imageWidth),
          Math.round(current.imageHeight)
        )
      );
      const originX = clamp(
        Math.round(-current.offsetX / current.scale),
        0,
        Math.max(0, Math.round(current.imageWidth) - cropSide)
      );
      const originY = clamp(
        Math.round(-current.offsetY / current.scale),
        0,
        Math.max(0, Math.round(current.imageHeight) - cropSide)
      );
      const actions: ImageManipulator.Action[] = [
        { crop: { originX, originY, width: cropSide, height: cropSide } },
      ];
      if (cropSide > MAX_OUTPUT_EDGE) actions.push({ resize: { width: MAX_OUTPUT_EDGE, height: MAX_OUTPUT_EDGE } });
      const result = await ImageManipulator.manipulateAsync(current.uri, actions, {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      await onApply(result.uri, 'image/jpeg');
    } catch (error) {
      Alert.alert('사진 편집 실패', error instanceof Error ? error.message : '사진을 자르지 못했습니다.');
    } finally {
      setApplying(false);
    }
  };

  const busy = preparing || applying;

  return (
    <Modal
      visible={!!sourceUri}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => !busy && onCancel()}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={() => !busy && onCancel()} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>보일 영역 설정</Text>
              <Text style={styles.guide}>사진을 움직이거나 두 손가락으로 확대해 원 안에 맞춰 주세요.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="사진 편집 닫기" disabled={busy} onPress={onCancel} style={styles.closeButton}>
              <Ionicons name="close" size={21} color={colors.inkSoft} />
            </Pressable>
          </View>

          <View style={styles.cropStage}>
            {crop ? (
              <View style={styles.cropViewport} {...panResponder.panHandlers}>
                <Image
                  source={{ uri: crop.uri }}
                  style={[
                    styles.cropImage,
                    {
                      width: crop.renderWidth,
                      height: crop.renderHeight,
                      left: crop.offsetX,
                      top: crop.offsetY,
                    },
                  ]}
                />
                <View pointerEvents="none" style={styles.cropFrame} />
                <View pointerEvents="none" style={styles.cropCenterIcon}>
                  <Ionicons name="scan-outline" size={23} color="rgba(255,255,255,0.86)" />
                </View>
              </View>
            ) : (
              <View style={styles.preparing}>
                <ActivityIndicator size="large" color={colors.tealDark} />
                <Text style={styles.preparingText}>사진을 준비하고 있습니다.</Text>
              </View>
            )}
          </View>

          <Text style={styles.zoomText}>확대 {crop ? Math.round((crop.scale / crop.minScale) * 100) : 100}%</Text>
          <View style={styles.controls}>
            <CropControl icon="remove" label="축소" disabled={!crop || crop.scale <= crop.minScale + 0.0001 || busy} onPress={() => zoom(false)} />
            <CropControl icon="add" label="확대" disabled={!crop || crop.scale >= crop.maxScale - 0.0001 || busy} onPress={() => zoom(true)} />
            <CropControl icon="locate-outline" label="가운데" disabled={!crop || busy} onPress={centerCrop} />
          </View>
          <View style={styles.actions}>
            <Pressable disabled={busy} onPress={onCancel} style={[styles.cancelButton, busy && styles.disabled]}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable disabled={!crop || busy} onPress={() => void applyCrop()} style={[styles.applyButton, (!crop || busy) && styles.disabled]}>
              {applying ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={19} color="#FFFFFF" />}
              <Text style={styles.applyText}>{applying ? '적용 중...' : '이 영역으로 적용'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CropControl({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.controlButton, disabled && styles.disabled]}>
      <Ionicons name={icon} size={18} color={colors.tealDark} />
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 12, 11, 0.7)',
  },
  sheet: {
    margin: spacing.md,
    padding: spacing.lg,
    paddingBottom: 28,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
  },
  guide: {
    marginTop: 4,
    color: colors.inkSoft,
    fontSize: type.small,
    lineHeight: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  cropStage: {
    height: CROP_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropViewport: {
    width: CROP_BOX,
    height: CROP_BOX,
    borderRadius: CROP_BOX / 2,
    overflow: 'hidden',
    backgroundColor: '#14221D',
  },
  cropImage: {
    position: 'absolute',
  },
  cropFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CROP_BOX / 2,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.94)',
  },
  cropCenterIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preparing: {
    width: CROP_BOX,
    height: CROP_BOX,
    borderRadius: CROP_BOX / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSoft,
  },
  preparingText: {
    color: colors.inkSoft,
    fontSize: type.small,
    fontWeight: '800',
  },
  zoomText: {
    color: colors.inkSoft,
    fontSize: type.small,
    fontWeight: '800',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  controlButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surfaceSoft,
  },
  controlText: {
    color: colors.tealDark,
    fontSize: type.small,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.inkSoft,
    fontSize: type.body,
    fontWeight: '900',
  },
  applyButton: {
    flex: 2,
    minHeight: 46,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tealDark,
  },
  applyText: {
    color: '#FFFFFF',
    fontSize: type.body,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
});
