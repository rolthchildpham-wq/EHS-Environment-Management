# TOPKEY EHS – HMI/SCADA P&ID v3.5 UI specification

## Scope
Standalone EHS wastewater page `/wwtp/`. Preserve Hub, existing EHS Firebase login and rights. No PLC write, no database or rules change. Route selection is **browser-local simulation**.

## Branding
Use the exact user-supplied TOPKEY logo as a transparent 195×50 raster source. Header left alongside plant title. Display 156×40 desktop and 125×32 mobile; never stretch/crop. Alt text `TOPKEY`.

## P&ID composition
SVG viewBox has safe border around original process objects to avoid clipped edge labels. Existing tank/pipe layout preserved, with reduced redundant motor badges in mobile overview. Keep status strip outside the main schematic; show RUN/STOP/FAULT distinctly in status summary. Do not imply live PLC data.

## PM-203 biological sludge
Two existing mutually exclusive simulation paths:
- PM-203 → TK-202A/B (RAS, return to Aerotank): violet #c4a4ff
- PM-203 → TK-301 (WAS, waste to sludge tank): orange #ffb347

Both paths stay visible as dim static infrastructure, selected destination highlighted. Only animate selected branch when simulation is enabled and PM-203 RUN. FAULT is fault, STOP/OFF is stationary dashed selection. Quick destination selector above drawing is synchronized with `v33SludgeRoute` in Settings. `wwtp_design` is required; viewers cannot change it. Pump RUN/STOP is a *separate* equipment command already under `wwtp_simulate`. Selection does not actuate pump or physical valves, nor establish that installed PLC supports diversion.

## Mobile
At widths <=700px default to whole-diagram fit; provide explicit "Xem chi tiết" mode that enables 1200px wide panning, plus "Toàn sơ đồ" to return to overview. Native/fallback immersive fullscreen keeps existing exit control and popup behavior. Minimum control height ~42–44px, readable route cards and focus outlines.

## Acceptance
1. Logo loads at `/assets/topkey-logo.png`.
2. Existing graph still includes and updates both PM-203 paths; selected/unselected visibly differentiated.
3. Quick route and Settings stay synchronized; Viewer cannot update route.
4. Mobile overview displays whole diagram; detailed mode scrollable without losing controls.
5. EHS authentication, dashboard and other modules unchanged.
6. Preview route and browser checks pass on desktop/mobile. Authenticated ADMIN/EDITOR/VIEWER live E2E must be verified before production certification.
