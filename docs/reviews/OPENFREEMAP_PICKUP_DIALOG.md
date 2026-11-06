# OpenFreeMap and pickup confirmation

Public map configuration selects Liberty (light) and Fiord (dark). MapLibre consumers accept OpenFreeMap; failed map resources retain the existing themed raster fallback. Style replacement recreates the style so the existing style-load handler restores the route. Existing search and routing configurations remain untouched.

The pickup confirmation now uses a native modal dialog in the browser top layer. The old absolute positioning was relative to the booking panel, and positioned the box too high. The dialog centres within the viewport, caps its height, scrolls on small screens, and keeps the map visible behind a restrained backdrop. X and Enter address use the existing cancellation sequence guard and focus the manual pickup input. Escape does the same. Native modal semantics contain keyboard focus and make underlying controls inert. Targets are at least 44 CSS px. No booking is confirmed by dismissal.

Research consulted 2026-11-06:
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — focus within dialog, contained Tab sequence, Escape dismissal and accessible naming.
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html — 24x24 CSS px minimum with exceptions. This design chooses 44px for touch comfort.
- https://www.nngroup.com/articles/modal-nonmodal-dialog/ — modal interactions interrupt the current task; use for a specific decision and provide a clear exit.

These are published accessibility and usability guidelines, not an experimental finding that centring increases customer satisfaction. No claim of an exact universally optimal vertical position or measured conversion improvement is made. A physical-phone usability check remains useful.

Validation: TypeScript and targeted ESLint pass; provider/style tests pass; browser test verifies a centred dialog at 390x844, X closes and focuses manual entry, Escape closes, GPS centring and system theme transitions. OpenFreeMap's five candidate styles were already loaded in the isolated visual comparison with real map resources and synthetic overlays. No real booking or message was created.
