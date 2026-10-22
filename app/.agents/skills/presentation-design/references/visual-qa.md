# Native Presentation QA

An editable package is not proof of native depth or visual quality. Execute all four gates and revise the source PPTX after any failure.

## Gate 1 — Geometry preflight

Run arithmetic checks before export or final rendering:

1. Compute every object's `x`, `y`, `width`, and `height` against the slide canvas and safe area. Fail negative positions and unintended canvas exits.
2. Estimate text line width and height from the actual font family, weight, size, box margins, line spacing, and explicit line breaks. Fail likely horizontal or vertical overflow.
3. Build pairwise bounds checks for text, shapes, pictures, tables, charts, and footers. Fail unintended intersections; allow only documented overlaps such as a callout intentionally placed over a screenshot.
4. For Korean text, flag broken Hangul syllables, awkward single-word orphan lines, and line breaks that ignore word boundaries.
5. Correct every flagged slide, recompute, and keep a short list of intentional exceptions.

Geometry is a conservative preflight, not a substitute for rendering. Font substitution and renderer differences still require later gates.

## Gate 2 — Live preview and annotation review

1. Render SVG or slide thumbnails during authoring when the toolchain supports it.
2. Show the complete sequence so pacing, repetition, density, and hierarchy can be judged before export.
3. Accept page- or coordinate-specific user annotations when an interactive preview is available. Otherwise record equivalent slide-numbered review notes.
4. Apply annotations to the editable source objects, regenerate the preview, and mark each note resolved or intentionally declined.

## Gate 3 — Rendered visual review

1. Render every slide with PowerPoint, OfficeCLI, LibreOffice, or the best available presentation renderer.
2. Inspect a full thumbnail sheet for narrative pacing, cloned layouts, card grids, excessive pills, inconsistent accents, and abrupt density changes.
3. Inspect every slide at readable size for clipping, overlap, font fallback, distorted media, unreadable screenshots, weak contrast, misalignment, and unexpected line wrapping.
4. Inspect every slide flagged by the geometry gate at pixel scale.
5. Revise the native PPTX and repeat the render after any defect.

## Gate 4 — Native package and Office integrity

1. Open or validate the PPTX with OfficeCLI when available and with native PowerPoint rendering when installed; otherwise use the strongest available package and renderer checks.
2. Fail corrupt ZIP/OOXML packages, missing relationships, Office repair prompts, broken masters/layouts, missing media, and text-overflow warnings.
3. Audit object editability: text boxes, backgrounds, containers, tables, charts, and connectors that should be editable must remain separate DrawingML or native PowerPoint objects.
4. Fail any slide represented primarily by one slide-sized raster or opaque SVG/HTML rendering unless the user explicitly requested an image-only artifact instead of an editable PPTX.
5. For template fill, confirm master/layout/theme inheritance and untouched package parts. For beautify, compare wording, page count, page order, and information order 1:1.

## Per-slide visual checks

- No clipped, overlapping, off-canvas, placeholder, or font-substituted content.
- No stretched screenshots, logos, or icons.
- Actual product screens remain identifiable and readable.
- Callout numbers match their explanation table exactly.
- Titles, body text, captions, and footers follow the template hierarchy.
- One accent color is used consistently.
- No more than two card containers are visible.
- Pills exist only for real status or category meaning.
- Source claims, metrics, and screen states are supported by supplied evidence.

## Deck-level checks

- Cover, screen explanation, procedure, comparison, and checklist slides use layouts appropriate to their job.
- The same composition does not repeat mechanically.
- The deck looks like the supplied organization or product, not a generic AI template.
- Branding, confidentiality marks, slide numbers, and footers are consistent.
- Korean decks follow the declared Pretendard or explicit corporate-font contract without silent mixing.

## Completion evidence

Record:

- workflow route and preservation invariants;
- Geometry Gate result and intentional-overlap exceptions;
- preview/annotation method and resolved notes;
- rendering method and confirmation that every slide was inspected;
- OfficeCLI/native package validation method;
- any unsupported native feature or font dependency.

If a gate cannot run, do not call the deck complete. Request the missing capability or deliver a clearly labeled unverified draft with the omitted gate named.
