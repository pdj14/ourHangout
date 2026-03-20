export type HideoutLocale = 'en' | 'ko';

export type HideoutInteractiveTarget = 'calendar' | 'timetable' | 'todo' | 'album' | 'music';

export type HideoutObjectKind =
  | 'bed'
  | 'desk'
  | 'calendar'
  | 'timetable'
  | 'todo'
  | 'album'
  | 'music'
  | 'plant'
  | 'lamp';

export type HideoutVec2 = {
  x: number;
  z: number;
};

export type HideoutPlacedObject = {
  id: string;
  kind: HideoutObjectKind;
  position: HideoutVec2;
  rotationY: number;
  interactive?: boolean;
  target?: HideoutInteractiveTarget;
  interactionAnchor?: HideoutVec2;
  wallMounted?: boolean;
};

export type HideoutSceneState = {
  roomThemeId: 'sunny-room';
  placedObjects: HideoutPlacedObject[];
  avatar: HideoutVec2;
  updatedAt: number;
};
