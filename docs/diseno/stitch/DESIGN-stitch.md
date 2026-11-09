---
name: Aptio SCORM System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434654'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d6'
  surface-tint: '#1355d2'
  primary: '#00399a'
  on-primary: '#ffffff'
  primary-container: '#004ecc'
  on-primary-container: '#c0ceff'
  inverse-primary: '#b3c5ff'
  secondary: '#ab3500'
  on-secondary: '#ffffff'
  secondary-container: '#fe6a34'
  on-secondary-container: '#5d1900'
  tertiary: '#004a43'
  on-tertiary: '#ffffff'
  tertiary-container: '#00645b'
  on-tertiary-container: '#75e2d4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#00174a'
  on-primary-fixed-variant: '#003ea6'
  secondary-fixed: '#ffdbd0'
  secondary-fixed-dim: '#ffb59d'
  on-secondary-fixed: '#390c00'
  on-secondary-fixed-variant: '#832600'
  tertiary-fixed: '#89f5e7'
  tertiary-fixed-dim: '#6bd8cb'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#005049'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.02em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system establishes a high-clarity, productivity-oriented enterprise SaaS aesthetic tailored for SCORM course authoring, instructional design, and workforce learning operations. It draws inspiration from modern enterprise LMS and authoring platforms: pairing a deep, authoritative royal cobalt anchor with clean, floating white content surfaces, accented by high-energy orange signifiers for status, authoring highlights, and key brand marks.

The aesthetic blends **Modern Corporate** structure with accessible **Card-driven Minimalism**. Information density is optimized for multi-layered workflows—such as module sequencing, SCORM package tracking, compliance analytics, and asset management—without creating cognitive fatigue. The UI delivers an impression of reliability, rapid navigation, and institutional precision, ensuring that educators, curriculum architects, and enterprise administrators feel focused and capable throughout long authoring sessions.

## Colors

The palette establishes a clear role-based separation between global navigation, content staging, and contextual actions.

- **Primary (`#004ECC`)**: Deep royal cobalt. Anchors the primary persistent navigation bar, active sidebar routes, focused selection indicators, primary action triggers, and active portal states.
- **Secondary (`#FF6B35`)**: Warm vivid orange. Reserved for the brand emblem, course readiness badges, authoring callouts, publish indicators, and high-impact visual milestones.
- **Tertiary (`#0D9488`)**: Balanced teal green. Serves as SCORM compliance validation states, completion tags, and positive test outcome metrics.
- **Neutral (`#64748B`)**: Cool slate. Forms the foundation of secondary typography, borders, and structural dividers.
- **Backgrounds**: The global workspace uses an airy, desaturated base (`#F4F6F9`), against which cards and interactive panes float using pure white (`#FFFFFF`). Subtle hover fills rely on soft cobalt tints (`#EFF6FF`).

## Typography

The type system relies entirely on **Plus Jakarta Sans**, providing modern geometric legibility with humanist warmth that maintains clarity in tight data grids, sidebar item labels, and course cards.

- **Headlines**: Set with tight negative letter tracking to reinforce structural solidity across dashboard panels and modal headers.
- **Body**: Uses neutral regular weights (`400`) with generous proportional line heights to guarantee effortless readability during extensive syllabus reviews and course descriptions.
- **Labels & Microcopy**: Medium to bold weights (`600` / `700`) define navigation controls, category identifiers, and SCORM state pills.
- **Monospace Auxiliary**: **JetBrains Mono** is utilized strictly for SCORM manifest tags, lesson IDs (e.g., `INTERNAL-SKI 340`), and package version references.

## Layout & Spacing

The canvas is split into a **fixed-rail dual pane layout** on desktop:
- **Left Navigation Rail**: 240px wide persistent column filled in solid royal cobalt (`#004ECC`).
- **Main Workspace**: Fluid grid spanning the remaining viewport width over the neutral light gray canvas (`#F4F6F9`), framed by 32px (`2rem`) outer canvas margins.

The card matrix employs a responsive 12-column layout:
- **Desktop (>= 1280px)**: 3-column card layouts for course catalogues (each 4 columns wide) alongside a dedicated 3-column context/portal rail.
- **Tablet (768px - 1279px)**: Sidebar compresses into an icon-only dock (72px wide); main grid reflows into 2 balanced columns with 24px gutters.
- **Mobile (< 768px)**: Navigation docks into a floating slide-over drawer triggered by an app bar header. Course cards and portal stats stack linearly into a single column with 16px margins.

## Elevation & Depth

This design system uses a combination of **tonal layering** and **diffused ambient shadows** to establish clear hierarchy without harsh visual lines:

- **Level 0 (Base Canvas)**: Flat `#F4F6F9` surface for the main staging area; deep `#004ECC` for the structural primary navigation bar.
- **Level 1 (Cards & Static Panels)**: Pure white `#FFFFFF` surfaces paired with a 1px border (`#E2E8F0`) and an extra-soft ambient shadow: `0 2px 8px -2px rgba(15, 23, 42, 0.04), 0 1px 4px -1px rgba(15, 23, 42, 0.02)`.
- **Level 2 (Interactive Hover & Active States)**: Raised card state upon cursor interaction: `0 12px 24px -6px rgba(0, 78, 204, 0.08), 0 4px 8px -2px rgba(15, 23, 42, 0.03)`.
- **Level 3 (Flyouts, Menus & Dropdowns)**: Floating contextual surfaces (such as the portal switcher) cast an ambient, elevated shadow: `0 20px 30px -8px rgba(0, 20, 60, 0.12), 0 8px 12px -4px rgba(0, 0, 0, 0.04)`, framed with a hairline border (`#CBD5E1`).

## Shapes

The shape vocabulary uses friendly, modern, and disciplined radii that balance productivity software with approachable modern learning tools:

- **Cards and Panels**: `16px` (`rounded-xl` or `1rem`) corner radius to create inviting, self-contained modules.
- **Buttons, Filters, and Input Controls**: `8px` (`0.5rem`) corner radius for standard interactives.
- **Pills and Status Indicators**: Full pill curvature (`9999px`) for portal tags, filter counts, and category chips.
- **Sidebar Selection Badges**: `10px` rounded interior highlights that provide clean spacing inside the navigation bar.

## Components

### Buttons
- **Primary Action**: Solid royal blue (`#004ECC`) background, white label, `8px` corner radius, `10px 20px` padding. Active state darkens to `#003EA3`.
- **Secondary Action (In-Card "View course")**: Soft cobalt tinted container (`#EFF6FF`), cobalt blue text (`#004ECC`), no border. On hover, shifts to `#DBEAFE`.
- **Accent Action**: Orange solid (`#FF6B35`) with white text, reserved for "Publish SCORM" or "New Course".

### Navigation Items (Sidebar)
- Text and icons in light cobalt-slate (`#BFDBFE` / `#93C5FD`) over the royal cobalt background.
- Active item uses an illuminated container fill (`rgba(255, 255, 255, 0.12)` or solid high-contrast blue) with pure white text and an active indicator notch.

### Cards
- **Course Card**: 2-part structure. Top segment features a media container (`16:9` ratio) with `12px` upper rounded corners. Bottom segment contains an uppercase metadata tag (`label-sm`, `#64748B`), bold course title (`headline-sm`, `#0F172A`), and the full-width secondary action button.
- **Portal / Stat Card**: White container with `16px` radius, subtle top-right icon action button, dual-line metadata rows (`Active users`, `Courses`) formatted in clean tabular numeric alignments.

### Input Fields & Search
- Global header search bar features an enclosed capsule or rounded-rect shape (`8px` to `20px` radius), light neutral fill (`#FFFFFF` or `#F1F5F9`), subtle search glyph, and faint placeholder text (`#94A3B8`). Focus ring displays a 2px royal blue outline (`#004ECC`) with zero offset.

### Chips & Filters
- Compact horizontal filter chips featuring a solid blue active state (`#004ECC`) with white text, and an unselected outlined state (`#E2E8F0` border, `#334155` text). Includes optional count badges enclosed in rounded pills.

### Portal Switcher Flyout
- An elevated white card container holding a prominent header label ("Switch portal"), individual option rows with hover fills (`#F8FAFC`), and a selected royal blue tile (`#004ECC`) featuring white typography and a right-aligned checkmark glyph.