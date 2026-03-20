import { StyleSheet, Text, View } from 'react-native';
import type { HideoutPlacedObject, HideoutVec2 } from './types';

type HideoutRoomCanvasProps = {
  avatar: HideoutVec2;
  mode: 'view' | 'edit';
  objects: HideoutPlacedObject[];
  selectedObjectId: string;
  onFloorPress: (position: HideoutVec2) => void;
  onObjectPress: (objectId: string) => void;
};

export function HideoutRoomCanvas({ mode }: HideoutRoomCanvasProps) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>3D hideout preview requires a native build.</Text>
        <Text style={styles.body}>
          Switch to Android or iOS to see the interactive room prototype.
        </Text>
        <Text style={styles.meta}>{mode === 'edit' ? 'Edit mode' : 'View mode'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 520,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#EAF0F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '82%',
    borderRadius: 28,
    padding: 22,
    backgroundColor: 'rgba(255,255,255,0.9)',
    gap: 10,
  },
  title: {
    color: '#233748',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    color: '#6E7C87',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  meta: {
    color: '#8F9AA3',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
