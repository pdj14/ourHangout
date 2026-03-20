import { Canvas } from '@react-three/fiber/native';
import { useFrame } from '@react-three/fiber/native';
import { useRef } from 'react';
import type { Group } from 'three';
import { StyleSheet, View } from 'react-native';
import type { HideoutPlacedObject, HideoutVec2 } from './types';

type HideoutRoomCanvasProps = {
  avatar: HideoutVec2;
  mode: 'view' | 'edit';
  objects: HideoutPlacedObject[];
  selectedObjectId: string;
  onFloorPress: (position: HideoutVec2) => void;
  onObjectPress: (objectId: string) => void;
};

type PressEventLike = {
  stopPropagation?: () => void;
  point?: {
    x: number;
    z: number;
  };
};

type RoomObjectProps = {
  item: HideoutPlacedObject;
  selected: boolean;
  onPress: (objectId: string) => void;
};

function AvatarMesh({ avatar }: { avatar: HideoutVec2 }) {
  const ref = useRef<Group>(null);

  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.x = avatar.x;
    ref.current.position.z = avatar.z;
  });

  return (
    <group ref={ref} position={[avatar.x, 0, avatar.z]}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <sphereGeometry args={[0.24, 20, 20]} />
        <meshStandardMaterial color="#FFD8AA" />
      </mesh>
      <mesh position={[0, 0.28, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.36, 6, 12]} />
        <meshStandardMaterial color="#8FB27C" />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <circleGeometry args={[0.34, 18]} />
        <meshStandardMaterial color="#5C4635" transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

function WallCalendar({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.18, 0.02]}>
        <boxGeometry args={[0.82, 0.08, 0.08]} />
        <meshStandardMaterial color="#F4E6CC" />
      </mesh>
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[0.86, 1.08, 0.06]} />
        <meshStandardMaterial color={selected ? '#FFD59D' : '#FFFDF8'} />
      </mesh>
      <mesh position={[0, -0.12, 0.04]}>
        <boxGeometry args={[0.66, 0.84, 0.02]} />
        <meshStandardMaterial color="#F6F2EA" />
      </mesh>
      <mesh position={[0, -0.42, 0.05]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#E8A16A" />
      </mesh>
    </group>
  );
}

function TimetableBoard({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.92, 1.1, 0.08]} />
        <meshStandardMaterial color={selected ? '#F6E0BD' : '#E8DABC'} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[0.72, 0.84, 0.02]} />
        <meshStandardMaterial color="#FFFDF9" />
      </mesh>
      <mesh position={[0, 0.18, 0.06]}>
        <boxGeometry args={[0.42, 0.06, 0.02]} />
        <meshStandardMaterial color="#8FAF7B" />
      </mesh>
      <mesh position={[0, -0.04, 0.06]}>
        <boxGeometry args={[0.52, 0.06, 0.02]} />
        <meshStandardMaterial color="#E59A88" />
      </mesh>
    </group>
  );
}

function TodoBoard({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.86, 1.02, 0.08]} />
        <meshStandardMaterial color={selected ? '#F8D6B7' : '#F7F3EC'} />
      </mesh>
      <mesh position={[0, 0.04, 0.05]}>
        <boxGeometry args={[0.62, 0.76, 0.02]} />
        <meshStandardMaterial color="#EAD9BD" />
      </mesh>
      <mesh position={[-0.12, 0.18, 0.06]}>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshStandardMaterial color="#E48B6F" />
      </mesh>
      <mesh position={[0.12, -0.08, 0.06]}>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshStandardMaterial color="#5F84A8" />
      </mesh>
    </group>
  );
}

function AlbumFrame({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.72, 0.94, 0.08]} />
        <meshStandardMaterial color={selected ? '#D9E8F6' : '#FFFDF9'} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[0.5, 0.66, 0.02]} />
        <meshStandardMaterial color="#B9D6F0" />
      </mesh>
      <mesh position={[0, -0.24, 0.06]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color="#FFD7AA" />
      </mesh>
    </group>
  );
}

function MusicPlayer({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.48, 0.18, 0.32]} />
        <meshStandardMaterial color={selected ? '#F7E5C8' : '#F3E6CF'} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.24, 0.02, 0.12]} />
        <meshStandardMaterial color="#6F8FB3" />
      </mesh>
      <mesh position={[-0.14, 0.06, 0]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color="#E58F8F" />
      </mesh>
      <mesh position={[0.14, 0.06, 0]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color="#8FB27C" />
      </mesh>
    </group>
  );
}

function Bed({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.28, 0]}>
        <boxGeometry args={[1.66, 0.3, 1.14]} />
        <meshStandardMaterial color={selected ? '#FFE29D' : '#E7BA46'} />
      </mesh>
      <mesh position={[0, 0.52, -0.26]}>
        <boxGeometry args={[0.92, 0.22, 0.34]} />
        <meshStandardMaterial color="#FFFDFB" />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <circleGeometry args={[0.94, 18]} />
        <meshStandardMaterial color="#7D5D46" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

function Desk({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[1.02, 0.16, 0.64]} />
        <meshStandardMaterial color={selected ? '#DDEBDA' : '#F2EFE8'} />
      </mesh>
      <mesh position={[-0.3, 0.08, -0.2]}>
        <boxGeometry args={[0.1, 0.6, 0.1]} />
        <meshStandardMaterial color="#D0AF92" />
      </mesh>
      <mesh position={[0.3, 0.08, -0.2]}>
        <boxGeometry args={[0.1, 0.6, 0.1]} />
        <meshStandardMaterial color="#D0AF92" />
      </mesh>
      <mesh position={[0.3, 0.08, 0.2]}>
        <boxGeometry args={[0.1, 0.6, 0.1]} />
        <meshStandardMaterial color="#D0AF92" />
      </mesh>
    </group>
  );
}

function Plant({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.28, 16]} />
        <meshStandardMaterial color={selected ? '#F3D9BE' : '#F5E5CD'} />
      </mesh>
      <mesh position={[0, 0.46, 0]}>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshStandardMaterial color="#9EC48F" />
      </mesh>
      <mesh position={[0.18, 0.56, 0.1]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#88B97F" />
      </mesh>
    </group>
  );
}

function Lamp({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.52, 16]} />
        <meshStandardMaterial color="#D1AF92" />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshStandardMaterial color={selected ? '#FFD79B' : '#F7D68E'} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <circleGeometry args={[0.28, 14]} />
        <meshStandardMaterial color="#7D5D46" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

function RoomObject({ item, selected, onPress }: RoomObjectProps) {
  const y = item.wallMounted ? 1.7 : 0;

  const onMeshPress = (event: PressEventLike) => {
    event.stopPropagation?.();
    onPress(item.id);
  };

  return (
    <group position={[item.position.x, y, item.position.z]} rotation={[0, item.rotationY, 0]} onClick={onMeshPress}>
      {item.kind === 'calendar' ? <WallCalendar selected={selected} /> : null}
      {item.kind === 'timetable' ? <TimetableBoard selected={selected} /> : null}
      {item.kind === 'todo' ? <TodoBoard selected={selected} /> : null}
      {item.kind === 'album' ? <AlbumFrame selected={selected} /> : null}
      {item.kind === 'music' ? <MusicPlayer selected={selected} /> : null}
      {item.kind === 'bed' ? <Bed selected={selected} /> : null}
      {item.kind === 'desk' ? <Desk selected={selected} /> : null}
      {item.kind === 'plant' ? <Plant selected={selected} /> : null}
      {item.kind === 'lamp' ? <Lamp selected={selected} /> : null}
    </group>
  );
}

export function HideoutRoomCanvas({
  avatar,
  objects,
  onFloorPress,
  onObjectPress,
  selectedObjectId,
}: HideoutRoomCanvasProps) {
  const onFloorClick = (event: PressEventLike) => {
    if (!event.point) return;
    onFloorPress({ x: event.point.x, z: event.point.z });
  };

  return (
    <View style={styles.root}>
      <Canvas
        style={styles.canvas}
        orthographic
        shadows
        camera={{ position: [6.4, 6.2, 6.8], zoom: 104, near: 0.1, far: 100 }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0.85, 0);
        }}
      >
        <color attach="background" args={['#EAF1F7']} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[4, 7, 2]} intensity={1.8} color="#FFF4D5" castShadow />
        <pointLight position={[1.6, 2.6, 1.2]} intensity={0.4} color="#FFE2B5" />

        <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onFloorClick} receiveShadow>
          <planeGeometry args={[6.6, 6.2]} />
          <meshStandardMaterial color="#DAB488" />
        </mesh>

        <mesh position={[0, 1.6, -3]} receiveShadow>
          <planeGeometry args={[6.6, 3.6]} />
          <meshStandardMaterial color="#F9F2E7" />
        </mesh>

        <mesh position={[-3, 1.6, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[6.2, 3.6]} />
          <meshStandardMaterial color="#F4EADB" />
        </mesh>

        <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.9, 6.5]} />
          <meshStandardMaterial color="#C99662" transparent opacity={0.34} />
        </mesh>

        {objects.map((item) => (
          <RoomObject
            key={item.id}
            item={item}
            selected={item.id === selectedObjectId}
            onPress={onObjectPress}
          />
        ))}

        <AvatarMesh avatar={avatar} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#EAF1F7',
  },
  canvas: {
    flex: 1,
  },
});
