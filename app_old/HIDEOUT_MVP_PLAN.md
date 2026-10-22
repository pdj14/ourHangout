# Hideout MVP Plan

## 1. Product Goal

Build a "my own hideout" feature inside Our Hangout.

The feature should feel like:

- a cozy private room
- a profile extension, not a separate heavy game
- something users can decorate, save, revisit, and eventually share with friends

Recommended direction:

- Start with a 2D room-decorating system
- Keep it tightly connected to chat/profile identity
- Avoid full 3D or free-roam gameplay in the first phase

## 2. Recommended Scope

### Best-fit scope for current app

The current app stack can realistically support:

- 2D room background
- wall and floor themes
- furniture and decoration placement
- drag and reposition interactions
- simple layering rules
- light ambient animation
- day/night or mood themes
- profile-linked "visit my hideout" entry point

This is a strong match for the current Expo + React Native app.

### Not recommended for first version

These are possible later, but not a good first step:

- full 3D room navigation
- physics-based object simulation
- real-time multiplayer room editing
- large open-world style interactions
- heavy game loop with combat, farming, or action systems

## 3. Graphics Ceiling

### Level A: Current stack only

Possible with current dependencies and React Native views:

- layered illustrated backgrounds
- furniture as PNG/WebP sprites
- soft gradients and glow effects
- simple fade, float, pulse, and parallax animation
- tap, drag, snap-to-grid placement

Visual target:

- cute and polished 2D room
- "storybook hideout" quality
- similar to a premium sticker-based room decorator

### Level B: Add gesture + animation libs

Recommended additions:

- `react-native-gesture-handler`
- `react-native-reanimated`

This enables:

- smoother drag and drop
- pinch zoom
- inertia and spring animation
- better editor feel

Visual target:

- highly polished 2D decorating editor
- app-quality interactions close to casual social games

### Level C: Add custom rendering

Recommended additions:

- `@shopify/react-native-skia`

This enables:

- richer particle effects
- more advanced layering
- custom shadows and masking
- higher-end 2D visual treatment

Visual target:

- premium 2D social-room experience
- stronger atmosphere and handcrafted look

### Level D: 3D

Possible with:

- `expo-gl`
- Three.js style rendering

But this is a major jump in:

- implementation complexity
- device performance cost
- asset production cost
- maintenance burden

Recommendation:

- do not start here

## 4. MVP Feature Set

### MVP 1: Personal Hideout

User can:

- open a "My Hideout" screen
- choose a room background
- choose floor and wall style
- place a small set of furniture items
- move placed items
- remove placed items
- save layout

Initial content should be small and intentional:

- 3 room themes
- 3 wall themes
- 3 floor themes
- 8 to 12 furniture/decor items

### MVP 2: Identity Link

Connect the hideout to the social layer:

- show hideout preview on profile
- add "Visit Hideout" button on friend profile
- optionally use hideout snapshot as profile header

### MVP 3: Light Social Extension

After MVP 1 is stable:

- allow friend hideout viewing
- add favorite decoration items
- unlock items through app activity

## 5. UX Structure

### Main entry points

Recommended entry points:

1. Profile tab
2. Friend profile
3. Future: chat room profile header

### Screen structure

#### A. Hideout Overview

- large room preview
- edit button
- theme summary
- recent changes

#### B. Hideout Editor

- room canvas
- bottom inventory tray
- category tabs
- save button
- reset button

#### C. Friend Hideout View

- read-only room view
- owner name
- optional like/reaction action later

## 6. Wireframe

### Hideout Overview

```text
+--------------------------------------------------+
| My Hideout                                       |
|                                                  |
|   [ large room preview ]                         |
|                                                  |
|   Theme: Moss Cabin                              |
|   Mood: Warm Evening                             |
|                                                  |
|   [ Edit Hideout ]   [ Share Later ]             |
+--------------------------------------------------+
```

### Hideout Editor

```text
+--------------------------------------------------+
| Back                Edit Hideout           Save  |
|                                                  |
|              [ room canvas area ]                |
|                                                  |
|                                                  |
|     placed lamp      placed chair     shelf      |
|                                                  |
|--------------------------------------------------|
| Theme | Furniture | Decor | Lighting | Seasonal  |
| [item] [item] [item] [item] [item] [item]        |
+--------------------------------------------------+
```

### Friend Hideout View

```text
+--------------------------------------------------+
| Back              Mina's Hideout                 |
|                                                  |
|          [ read-only room preview ]              |
|                                                  |
|   Cozy forest room with soft lighting            |
+--------------------------------------------------+
```

## 7. Data Model

### Frontend model

Recommended shape:

```ts
type HideoutLayout = {
  id: string;
  ownerUserId: string;
  roomThemeId: string;
  wallThemeId: string;
  floorThemeId: string;
  lightingMode: "day" | "evening" | "night";
  placedItems: HideoutPlacedItem[];
  updatedAt: number;
};

type HideoutPlacedItem = {
  id: string;
  itemId: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  flipped?: boolean;
};

type HideoutCatalogItem = {
  id: string;
  category: "theme" | "furniture" | "decor" | "lighting";
  name: string;
  assetUri: string;
  width: number;
  height: number;
  anchor: "floor" | "wall" | "free";
};
```

### Backend model

Recommended first backend tables:

- `hideout_layouts`
- `hideout_layout_items`
- `hideout_catalog_items`
- optional later: `user_owned_hideout_items`

Minimum API set:

- `GET /v1/hideout/me`
- `PUT /v1/hideout/me`
- `GET /v1/hideout/catalog`
- `GET /v1/hideout/users/:userId`

## 8. Technical Fit With Current App

### Current strengths

The existing app already has:

- strong visual theming
- custom background rendering
- modal-heavy single-screen flow
- local state management patterns
- drag-like gesture logic for image crop

This means the team can build a hideout editor without changing platform stack.

### Current weakness

The app logic is still concentrated in `App.tsx`.

If the hideout feature is added directly there, complexity will spike fast.

Before or during implementation, create separate files for:

- hideout types
- hideout catalog data
- hideout canvas component
- hideout editor modal or screen
- hideout API client helpers

## 9. Recommended Implementation Order

### Phase 1: Architecture cleanup

- move hideout code out of `App.tsx`
- create `hideout` folder or module area
- define shared types
- build static mock catalog

### Phase 2: Local-only prototype

- build room canvas
- place and drag furniture locally
- persist locally with AsyncStorage
- validate editor UX

### Phase 3: Backend persistence

- add hideout API
- save and load server state
- connect profile and friend view

### Phase 4: Visual quality pass

- improve room art
- add animation polish
- add sound and ambient effects if desired

### Phase 5: Social extension

- friend visits
- unlockable items
- seasonal events

## 10. Recommended Art Direction

Strongest fit for current brand:

- woodland cabin
- lantern glow
- moss, wood, cloth, paper textures
- cozy small-room perspective
- gentle animated particles

Avoid:

- generic mobile game neon rooms
- hyper-realistic furniture
- over-busy UI panels

## 11. Performance Guardrails

To keep this stable on mobile:

- cap visible items per room in MVP
- use pre-sized assets
- avoid large transparent PNG stacks where possible
- keep editor interactions on simple transforms
- do not start with zoomed-out giant scenes

Recommended MVP target:

- 12 to 20 active placeable items
- one room only
- one camera angle only

## 12. Realistic Outcome

If built in the recommended order, the first release can feel like:

- "my cozy room inside the chat app"
- visually distinctive
- social and personal
- achievable without converting the app into a full game engine project

That is the right quality bar for this codebase.

## 13. Next Action

Recommended immediate next step:

1. Create hideout module structure
2. Implement a local-only editor prototype
3. Use static art assets first
4. Validate drag-and-save UX before backend work

If implementation starts now, the best first deliverable is:

- one editable room
- local save/load
- small starter furniture set
- profile entry point
