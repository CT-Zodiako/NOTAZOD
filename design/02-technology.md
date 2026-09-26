# 2. Technology recommendation — NOTAZOD

This recommendation is derived from the approved product and design phases. It is advisory until the implementation choice is confirmed in `sandbox/tech-notes.md`.

## Product shape

- Product category: offline grade-management application for one teacher.
- Primary delivery surface: installable desktop application for desktop/laptop; teachers use it in class, university, and home.
- Primary devices: laptop/desktop; the approved design is desktop-first.
- Connectivity: fully offline; no accounts, sync, or online features.
- Data sensitivity: student identity and grades are local educational records.
- Requirements: reliable local persistence, CSV/Excel import/export, keyboard-first data entry, 30–35 rows per course, up to 10 courses.
- Team constraints: not yet defined.

## Decision criteria

| Criterion | Weight | Evidence from product phase | Notes |
| --- | --- | --- | --- |
| Offline/local storage fit | high | D10 | Must work without network and preserve grades reliably. |
| Desktop distribution | high | P2, D10 | Teacher carries the app to class. |
| Delivery speed | medium | Prototype already validates behavior in browser. | Preserve the existing web prototype investment. |
| Accessibility maturity | high | A5 | WCAG 2.2 AA, keyboard-first grading. |
| Maintenance and bundle size | medium | Single-user local app | Avoid unnecessary runtime weight. |
| Import/export ecosystem | medium | D9 | CSV and Excel support required. |
| Responsive/mobile fit | low | Desktop-first approved | Small-screen scrolling is sufficient; no mobile app requirement yet. |

## Candidate approaches

| Candidate | Strengths | Risks/tradeoffs | Fit | Evidence/version | Decision |
| --- | --- | --- | --- | --- | --- |
| Browser PWA | Fastest path from prototype; easy updates; can support offline storage. | Browser storage durability and file access are limited; installation/distribution varies. | Medium | Prototype evidence; storage limits documented in `tech-notes.md`. | Keep as prototype and fallback. |
| Electron + web UI | Mature desktop distribution, filesystem and SQLite ecosystem, broad team familiarity. | Larger bundle and memory footprint; Chromium runtime overhead. | High | Common desktop web runtime option. | Candidate. |
| Tauri + web UI | Smaller desktop bundle, native filesystem access, preserves web UI approach. | Requires Rust/native build knowledge; plugin ecosystem must be validated for Excel/SQLite needs. | High | Current candidate; validate team capability and plugins before commitment. | Candidate. |

## Recommendation

- Recommended delivery model: installable offline desktop application distributed through GitHub Releases.
- Recommended runtime: Tauri + Rust; the team accepts learning and maintaining Rust, pending plugin and build-pipeline validation.
- Recommended UI approach: React + TypeScript, while retaining the technology-agnostic design spec and implementing the existing web prototype's semantic HTML/CSS behavior as reusable React components.
- Recommended component strategy: compare a full React component kit with customization as the primary criterion. The selected kit must consume the project tokens; NOTAZOD-specific controls remain custom components built on the kit's extension points.
- Recommended styling/token strategy: generated CSS variables from `04-tokens.json`; no raw values in component code.
- Recommended data/storage direction: SQLite embedded in the Tauri application; browser localStorage is prototype-only.
- Responsive strategy: desktop-first; support smaller laptop viewports with scrolling and fixed key columns; do not build a mobile layout until product scope changes.
- Why this fits the product: it preserves the validated web interaction model while meeting offline, durable-storage, and installable desktop requirements.
- Update strategy: automatic update checks and user-approved installation from GitHub Releases.
- What would change the recommendation: a requirement for mobile distribution, multi-device synchronization, browser-only deployment, or a team without native/Tauri capability.

## Component-library comparison

| Candidate | Customization fit | Coverage | Token integration | Main risk | Source evidence |
| --- | --- | --- | --- | --- | --- |
| Mantine | High; CSS variables, theme resolver, component variables | Broad | Strong CSS-variable and theme support | Need to validate complex data-table needs | [CSS variables](https://mantine.dev/styles/css-variables/), [Styles API](https://mantine.dev/styles/styles-api/) |
| Material UI | Medium-high; theme, overrides, CSS variables | Very broad | Strong theme and CSS-variable support | More opinionated Material defaults; overrides can grow | [Theming](https://mui.com/material-ui/customization/theming/), [CSS variables](https://mui.com/material-ui/customization/css-theme-variables/configuration/) |
| Ant Design | Medium; global and component token overrides | Very broad for admin systems | Strong token system | Strong visual opinion and less distinctive default identity | [Customize Theme](https://ant.design/docs/react/customize-theme/) |

Decision: Mantine selected. Customization is the primary criterion and project tokens are mandatory; Mantine is an implementation aid, not the source of visual identity.

## Component standard

- Prefer a component library or headless primitive only when it provides accessible behavior and does not fight the token system.
- Build custom components for domain-specific controls such as grade tables, walkthrough grading, split editors, and import previews.
- Custom components must preserve semantic HTML, keyboard behavior, project tokens, documented anatomy/variants/sizes/all states, WCAG 2.2 AA, responsive behavior, and content rules.
- Components rejected or deferred: a generic admin dashboard kit that imposes unrelated navigation, colors, spacing, or table behavior.

## Open TBDs

- No open technology TBDs for the initial architecture. Code-signing details remain a later release-readiness phase.

## Approval

- Status: `approved` — initial architecture and release channel confirmed
- Approved by:
- Date:
