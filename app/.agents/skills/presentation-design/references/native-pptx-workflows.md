# Native PPTX Workflow Contracts

Choose one route from the requested artifact and preservation boundary. Native editability is mandatory in every route.

## Route matrix

| User intent | Route | Must preserve | May change |
| --- | --- | --- | --- |
| Build a deck from PDF, DOCX, URL, Markdown, data, or a topic | Create new deck | Source facts, citations, brand evidence | Story, page count, order, layout |
| Put new content into a supplied company PPTX | `ppt-template-fill` | Original master, layouts, theme, geometry, visual identity, untouched package parts | Selected text, table cells, chart data, included pages as authorized |
| Improve an existing deck without rewriting it | `beautify-pptx` | Wording, page count, page order, information order, factual meaning | Alignment, spacing, hierarchy, native visualization, image treatment |

Do not infer template fill merely because a PPTX is supplied. A PPTX may be source material for a newly structured deck. Ask when the preservation boundary changes the result materially.

## Create a new deck

1. Extract an evidence inventory from all supplied sources; research only identified gaps when authorized.
2. Default to a 16:9 canvas unless the user or template defines another size.
3. Create a single-purpose outline before drawing.
4. Author text, shapes, connectors, tables, and charts as native objects.
5. Use source screenshots and photographs only as independent picture objects.
6. Run all four QA gates before delivery.

## Fill a native template

1. Inspect the source package, masters, layouts, theme, placeholders, tables, charts, notes, and relationships before choosing slides.
2. Select layouts by rhetorical fit and text capacity, not source order alone.
3. Replace only authorized slots or native objects. Preserve untouched XML parts and relationships.
4. Do not rebuild the template as SVG, HTML, or a screenshot.
5. Do not force content into a layout that cannot carry it safely; select another compatible layout or request a decision.
6. Verify the output opens without a repair prompt and retains the original master/layout inheritance.

Template fidelity takes precedence over the default Pretendard rule when the supplied deck explicitly establishes an approved corporate Korean font. Never mix fonts silently.

## Beautify an existing deck

1. Freeze wording, page count, page order, and information order before editing.
2. Inventory each slide's objects and semantic groups.
3. Improve grid alignment, whitespace, typography, emphasis, and visualization without changing the frozen content contract.
4. Keep existing native objects native. Replace weak structures only with editable PowerPoint equivalents.
5. Compare before and after slide-by-slide and fail on missing, reordered, or rewritten content.

## Native object boundary

Acceptable authoring paths include:

- `python-pptx` for text, shapes, pictures, tables, and supported charts;
- bounded OOXML/DrawingML updates when a required native feature is not exposed by the library;
- SVG-to-DrawingML conversion that produces individually selectable PowerPoint objects.

Do not treat these as finished slide authoring:

- one slide-sized PNG/JPEG;
- an SVG inserted as one opaque picture when its text and shapes should be editable;
- HTML/CSS rendered to a bitmap or PDF and inserted into PPTX;
- a chart screenshot when the user needs editable data.

Raster pictures remain valid for photographs, supplied screenshots, and other inherently raster evidence. Keep them separate from editable text, labels, callouts, and layout containers.

## Korean text capacity

- Use Pretendard for newly authored Korean decks and establish hierarchy with Medium, SemiBold, Bold, and size.
- Estimate line capacity from the actual font size, weight, box width, internal margins, and line height.
- Insert deliberate word-boundary line breaks rather than splitting Hangul syllables.
- Treat a manual font-size reduction as a last resort; first shorten copy, enlarge the box, or select a more suitable layout within the workflow contract.
