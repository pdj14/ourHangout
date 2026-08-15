# UI/UX Quality Checklist

Use this checklist proportionally to the surface being designed or reviewed.

## Visual direction

- Define the intended mood and density in a sentence before selecting details.
- Use a small semantic palette with one primary accent and clear status colors.
- Avoid default violet gradients, random glow, decorative blobs, emoji as interface icons, and ornamental elements without product meaning.
- Use familiar icons from the product icon system and keep stroke, size, and alignment consistent.

## Layout and hierarchy

- Make the reading order and primary action obvious at a glance.
- Use a consistent 4px or 8px spacing rhythm, allowing optical adjustment where needed.
- Align related content and avoid nested containers whose borders and shadows compete.
- Keep paragraphs readable and prevent headings, labels, and values from truncating important meaning.
- Test long names, localization growth, empty data, errors, and dense real-world content.

## Typography and color

- Use a restrained type scale and appropriate line height; avoid excessive all-caps and letter spacing.
- Meet WCAG contrast targets: normally 4.5:1 for body text and 3:1 for large text and meaningful UI graphics; use 7:1 when AAA is required.
- Do not rely on placeholder text as a label or on color alone for state.
- Tokenize colors for light and dark themes when the product supports themes.

## Interaction and accessibility

- Prefer native semantic elements and label every control accessibly.
- Provide visible focus and logical keyboard order; support Escape and arrow-key behavior where the component pattern requires it.
- Size targets for the platform and keep closely spaced destructive actions difficult to trigger accidentally.
- Represent loading without blocking unrelated work and make errors actionable.
- Respect reduced motion and avoid animations that delay input or obscure state changes.

## Responsive and runtime quality

- Verify narrow, medium, and wide layouts, including zoom and text scaling when relevant.
- Prevent horizontal overflow, hidden actions, overlapping text, and fixed dimensions that fail on small screens.
- Reserve media dimensions to prevent layout shift and optimize expensive images or animation.
- Keep transitions short and use easing that communicates direct manipulation.

## Review output

- Prioritize issues by user impact.
- Explain the reason for recommended changes, not just the preferred style.
- Separate must-fix accessibility or usability problems from optional visual refinements.
