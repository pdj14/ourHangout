---
name: presentation-design
description: Create, revise, and visually validate native, editable PowerPoint presentations using real evidence and brand templates. Use for PPT/PPTX creation, document-to-deck work, template filling, content-faithful PPTX beautification, product guides, procedures, comparisons, checklists, executive decks, and presentation QA. Do not use for web or app UI implementation.
---

# Presentation Design

Create presentations from evidence, not decorative invention. Treat the editable PPTX as the product source and the rendered slide as its visual proof.

## Choose the workflow before editing

Select one preservation contract and do not blend them silently:

1. **Create a new deck** from documents, data, URLs, or a topic. Build a new 16:9 story unless the user specifies another canvas.
2. **Fill a native template (`ppt-template-fill`)** when an existing PPTX must retain its master, layouts, theme, geometry, and visual identity while selected content is replaced.
3. **Beautify an existing deck (`beautify-pptx`)** when wording, page count, page order, and information order must remain 1:1 while alignment, hierarchy, and visualization improve.

If the preservation boundary is unclear, resolve it before authoring. Read [native-pptx-workflows.md](references/native-pptx-workflows.md) for the mode contracts and object rules.

## Enforce the native PPTX contract

Apply the absolute principle: if the user cannot open and edit it in PowerPoint, it is not a finished PPT.

- Author text boxes, backgrounds, containers, connectors, tables, and charts as individually selectable native PowerPoint objects using DrawingML, `python-pptx`, bounded OOXML changes, or SVG-to-DrawingML conversion.
- Never deliver a slide as one full-slide PNG/JPEG, a flattened SVG picture, an HTML screenshot, or an HTML-to-image conversion packed into PPTX.
- Keep source photographs, logos, and real product screenshots as separate picture objects when raster evidence is appropriate; never rasterize surrounding text or layout into them.
- Prefer native data-backed chart and table objects when the user is expected to edit data. State any unsupported native feature instead of disguising it as a flattened slide.
- Preserve supplied masters, layouts, themes, notes, and package relationships according to the selected workflow.

## Apply Korean typography deliberately

- For newly authored Korean decks, use only the Pretendard family. Build hierarchy with size and Pretendard Medium, SemiBold, and Bold rather than mixing font families.
- Break Korean lines at word or phrase boundaries. Precompute line breaks where necessary; never split Hangul syllables merely to fill a box.
- Set line spacing, paragraph spacing, text margins, and letter spacing so glyphs never collide or clip.
- For exact template-fill or brand-fidelity work, an explicitly supplied corporate Korean font contract overrides Pretendard. Preserve it and report the exception instead of silently mixing families.
- Note that PPTX does not normally embed Pretendard; record the font dependency when recipients may not have it installed.

## Gate inputs before designing

1. Inspect every supplied presentation, brand template, product screenshot, logo, and content source.
2. Use the corporate or supplied PPT template as the highest-priority visual system for fidelity workflows.
3. Use actual product screens as the highest-priority product evidence.
4. If a task depends on a brand template or real product screen and neither is available, request it before designing.
5. Reuse an existing deck's safe areas, typography, footer rules, and theme unless the selected workflow authorizes a new system.

## Preserve evidence

- For a screen guide, default to an actual screenshot with numbered callouts and a matching explanation table.
- Crop or enlarge real screenshots for legibility; do not redraw them as decorative UI mockups.
- Never fabricate controls, screens, states, metrics, logos, or brand patterns that could be mistaken for the product.
- Clearly label conceptual diagrams when the source material does not represent an actual screen.

## Apply hard visual constraints

- Use at most two card containers on one slide.
- Use one accent color per deck or established section theme.
- Do not use pills unless they communicate a real status, filter, category, or compact control concept.
- Do not repeat one composition across every slide. Vary layout according to the slide's communication job.
- Prefer direct labels, alignment, whitespace, rules, and typography over ornamental containers.
- Avoid generic gradients, floating shapes, random icons, excessive rounded boxes, and dense text walls.

Read [slide-layouts.md](references/slide-layouts.md) before building or substantially revising a deck.

## Build in an evidence-first sequence

1. Create a content and evidence inventory.
2. Select the workflow and write down its preservation invariants.
3. Assign each slide a single communication job.
4. Select the layout contract that matches that job.
5. Place real assets before adding explanatory text or decoration.
6. Generate or update native PPTX objects while preserving the selected invariants.
7. Run Geometry QA, preview review, native-package validation, and rendered-slide inspection; revise until all gates pass.

## Require geometry and rendered QA

Read [visual-qa.md](references/visual-qa.md) and execute its four gates. At minimum:

- Detect text overflow, unintended overlap, and off-canvas geometry arithmetically before export.
- Review SVG or thumbnail previews and incorporate bounded annotations when available.
- Render every slide and inspect the complete thumbnail sheet plus readable individual slides.
- Validate the exported PPTX package and native rendering with OfficeCLI, PowerPoint, LibreOffice, or the best available native renderer; record the method.

Do not claim completion when package validation or rendered inspection did not occur. Report the missing validation as a blocker or deliver a clearly labeled unverified draft.

## Enforce the final failure gate

Fail and revise the presentation when any of these are true:

- A slide is a flattened full-slide image or HTML rendering.
- Required text, shapes, tables, or charts cannot be edited individually in PowerPoint.
- It looks like a generic AI-generated template rather than the supplied brand or product.
- A decorative mockup replaces an available real product screen.
- Repeated cards, pills, or a cloned layout dominate the deck.
- Important content is clipped, overlapping, off-canvas, unreadable, unverified, or detached from its evidence.
- Template-fill or beautify changed content or structure outside its declared preservation contract.

When Design Helper is also enabled, use it for visual direction, typography, hierarchy, and polish. This skill retains authority over workflow selection, native editability, Korean presentation typography, real-screen evidence, template fidelity, slide-layout contracts, Geometry QA, package integrity, and rendered thumbnail QA.
