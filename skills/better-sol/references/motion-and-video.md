# Motion and Video Craft

## Motion rules

- Motion should explain state changes, not decorate everything.
- Respect `prefers-reduced-motion`.
- Keep transaction state motion calm and trustworthy.
- Avoid animating financial numbers in a way that causes misreads.
- Use short staggered entrances for lists and dashboards.

## Common patterns

- Page entrance: fade + small vertical movement, stagger sections.
- Modal: scale from 0.98 to 1 with opacity.
- Dropdown: fast opacity + translate.
- Success: brief check or highlight, then stable state.
- Error: avoid shaking high-risk financial controls; use clear copy.

## Video frame checklist

- one focal point per frame
- product screenshot is legible
- caption supports the visual, not repeats it
- proof is visible: transaction, address, test, metric, or live UI
- CTA appears in final frame
- no generic crypto clutter unless deliberately branded

## Related

- `transaction-ux.md` for motion-sensitive signing and confirmation states.
- `pitch-and-video-craft.md` for product demo frame composition.
- `accessibility-evaluation.md` for reduced-motion requirements.
