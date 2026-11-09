---
name: Aptio SCORM System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf6'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dde9ff'
  surface-container-highest: '#d3e3ff'
  on-surface: '#0b1c30'
  on-surface-variant: '#434654'
  inverse-surface: '#213146'
  inverse-on-surface: '#ebf1ff'
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
  tertiary: '#792300'
  on-tertiary: '#ffffff'
  tertiary-container: '#a13200'
  on-tertiary-container: '#ffc1ad'
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
  tertiary-fixed: '#ffdbcf'
  tertiary-fixed-dim: '#ffb59c'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832700'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e3ff'
  primary-hover: '#003EA3'
  primary-soft: '#EFF6FF'
  ai-text: '#AB3500'
  ai-surface-soft: '#FFF1EB'
  ai-border: '#FFD3C2'
  secondary-muted-text: '#64748B'
  page-background: '#F4F6F9'
  panel-card-surface: '#FFFFFF'
  surface-soft: '#F1F5F9'
  border-subtle: '#E2E8F0'
  success-text: '#0F766E'
  success-surface: '#CCFBF1'
  warning-text: '#92400E'
  warning-surface: '#FEF3C7'
  error-text: '#BA1A1A'
  error-surface: '#FFDAD6'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 44px
    fontWeight: '800'
    lineHeight: 52px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-tag-lg:
    fontFamily: Barlow Condensed
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.06em
  label-tag-sm:
    fontFamily: Barlow Condensed
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
  code-metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  code-metric-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
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

This design system establishes a high-trust, production-grade enterprise EdTech interface engineered for corporate instructional designers, human resources directors, and training administrators across Latin America. The platform translates complex AI operations—ingesting enterprise source files, generating interactive SCORM 1.2 packages, rendering lip-synced avatar presenters, and synthesizing bilingual audio tracks—into a structured, dependable workflow verified by human instructional reviewers.

The aesthetic fuses **Corporate SaaS Clarity** with **Modular Tactile Tooling** inspired by modern technical enterprise suites. The user interface prioritizes clarity, systematic density, and cognitive comfort. It avoids gimmicky decorative graphics in favor of live interactive mockups, clear status telemetry, precise tabular inspectors, and distinct visual compartmentalization.

The emotional signature is **dependable innovation**: absolute institutional stability through deep cobalt blues and structured architectural lines, energized by targeted sparks of vibrant cadmium orange reserved exclusively for AI telemetry, real-time avatar generation, and automated synthesis checkpoints.

## Colors

The color architecture enforces strict functional boundaries between standard user interactions, administrative operations, and artificial intelligence processes:

- **Primary Accent (`#004ECC`):** Governs structural UI controls, navigation states, primary action buttons, active tabs, and canonical platform triggers. On interaction states, it shifts to `#003EA3`. The tint `#EFF6FF` provides soft selection states, focus highlights, and active container fills.
- **Secondary / AI Accent (`#FF6B35`):** Strictly reserved for AI-generated artifacts, synthetic video/audio ingestion telemetry, avatar lip-sync monitors, and automated script recommendations. Never use this color for standard navigational or destructive actions. It operates with a dedicated trio: `#AB3500` for high-contrast legible text on badges, `#FFF1EB` for container surface fills, and `#FFD3C2` for AI perimeter lines.
- **Neutral Core (`#0B1C30` & `#64748B`):** Deep slate-navy serves as the primary body ink to maximize legibility and visual weight over stark pure black. Muted metadata, field hints, and inactive UI iconography use `#64748B`.
- **Surfaces & Divisions:** Canvas backgrounds default to cool neutral `#F4F6F9`. Card panels, modals, and tables reside on `#FFFFFF`, accented by `#F1F5F9` for secondary well containers. All dividing rules, table borders, and input strokes adhere to `#E2E8F0`.
- **Feedback & Validation:** Semantic feedback pairs deep text pigments with low-intensity tinted surfaces: Teal for SCORM and human-QA validation (`#0F766E` / `#CCFBF1`), Amber for conversion or asset processing warnings (`#92400E` / `#FEF3C7`), and Crimson for packaging failures or parsing rejections (`#BA1A1A` / `#FFDAD6`).

## Typography

The type system assigns discrete typographical roles based on reader intent, functional speed, and technical comprehension:

1. **Plus Jakarta Sans (Headings & UI Chrome):** Delivers clean geometry, crisp modern counters, and professional authority for product titles, card headers, button labels, and navigation menus.
2. **Atkinson Hyperlegible Next (Body & Instructional Copy):** Enhances instructional accessibility, script transcriptions, and long-form training modules. Its distinct letterforms prevent character ambiguity during rapid scanning.
3. **Barlow Condensed (Overlines, Status Flags, LMS Tags):** Utilized exclusively in uppercase (`letter-spacing: 0.06em` to `0.08em`) for compact, punchy status badges such as `SCORM 1.2`, `HUMAN QA VERIFIED`, `MOODLE READY`, and `AI GENERATING`.
4. **JetBrains Mono (Metrics, Currency, Code & Timeline Indicators):** Renders all numeric telemetry, video duration counters (`04:32 / 07:15`), file payload sizes, and Peruvian localized currency strings (`S/ 1,500.00` or `US$ 58.20`) with tabular alignment.

## Layout & Spacing

The layout is built around a responsive 12-column desktop grid (max-width `1280px`), adapting down to a 6-column tablet structure (`768px`) and a single-column fluid mobile canvas optimized for standard `390px` touch devices.

- **Vertical Rhythm & Padding:** Spacing operates strictly on a base-4 and base-8 metric. Component internals rely on `space-xs` (4px), `space-sm` (8px), and `space-md` (16px). Section padding expands from `space-lg` (24px) up to `space-2xl` (48px) for desktop operational canvases.
- **Persistent Bottom Controls (Mobile):** For viewport widths under 768px, key conversion controls, SCORM packaging triggers, and file drop drawers dock fixed to the bottom edge above safe areas, backed by an elevated blur panel.
- **Minimum Target Dimensions:** Every interactive tap zone enforces a hard baseline of at least 44×44px, ensuring frictionless tablet and smartphone usage in corporate production environments.

## Elevation & Depth

Visual depth is achieved through structural layering and tinted, diffused ambient shadows:

- **Surface Tier 0 (Base Canvas):** `#F4F6F9`. Background context for modular workspaces, document converters, and dashboard views.
- **Surface Tier 1 (Cards, Workspaces, Inspectors):** Pure `#FFFFFF` resting with a low-contrast perimeter stroke (`1px solid #E2E8F0`) and the Soft Shadow: `0 2px 8px -2px rgba(15, 23, 42, 0.06)`.
- **Surface Tier 2 (Flyouts, Active Dropdowns, Hovered Cards):** Lifted with the Elevated Shadow: `0 12px 24px -6px rgba(0, 78, 204, 0.10)`. The subtle primary-blue tint prevents clinical dullness and anchors actionable components.
- **Surface Tier 3 (Modals, Avatar Preview Overlays):** Deep modal backdrop (`rgba(11, 28, 48, 0.60)`) accompanied by a dual-stage shadow: `0 20px 32px -8px rgba(11, 28, 48, 0.20), 0 0 0 1px rgba(226, 232, 240, 0.80)`.
- **Tonal Well (`#F1F5F9`):** Sub-recessed layout areas such as raw JSON inspectors, video timeline tracks, and LMS payload configuration logs sit inset with no external shadow.

## Shapes

The shape hierarchy establishes clear mental models for different component functions:

- **8px (`rounded-md`):** Assigned to interactive controls, inputs, dropdown selectors, action triggers, and utility buttons. This compact radius provides clean corporate discipline without visual harshness.
- **12px (`rounded-lg`):** Assigned to structural containers, modular dashboard panels, live video preview frames, file upload dropzones, and document parsing monitors.
- **999px (`rounded-full`):** Reserved exclusively for status chips, overline pills, avatar badges, LMS protocol chips (`SCORM 1.2`, `Canvas`), and AI pipeline indicators.

## Components

### Buttons & CTAs
- **Primary:** Background `#004ECC`, text `#FFFFFF`, radius 8px, 44px minimum height. Hover state shifts to `#003EA3`. Active state scales subtly (`0.98`).
- **Secondary / Outlined:** Surface `#FFFFFF`, border `1px solid #E2E8F0`, text `#0B1C30`. Hover applies background `#F1F5F9` and border `#CBD5E1`.
- **AI Action Highlight:** Used solely when initiating automated lip-sync or AI translation. Background `#FFF1EB`, border `1px solid #FFD3C2`, text `#AB3500`, icon tinted `#FF6B35`.
- **Persistent CTA Bar:** A fixed bottom docked tray on mobile devices housing the primary step action with safe-area padding and a soft backdrop blur.

### Badges, Pills & Status Chips
- **AI Indicator:** Background `#FFF1EB`, border `1px solid #FFD3C2`, text `#AB3500`, font *Barlow Condensed 700* uppercase with an accompanying 6px pulsating dot in `#FF6B35`.
- **LMS Compatibility Chip:** Background `#F1F5F9`, border `1px solid #E2E8F0`, text `#0B1C30`, font *Barlow Condensed 600* uppercase (e.g., `CANVAS`, `MOODLE`, `BLACKBOARD`).
- **Human QA Verification Badge:** Background `#CCFBF1`, border `1px solid #99F6E4`, text `#0F766E` with a checkmark glyph.

### Form Inputs & Selectors
- Standard inputs utilize a 44px height, 8px radius, white background, `#0B1C30` text in *Atkinson Hyperlegible*, and a `1px solid #E2E8F0` border.
- Focus state applies a crisp `2px` ring in `#004ECC` with an outer soft glow using `#EFF6FF`.
- Helper labels sit above in *Plus Jakarta Sans 600* (14px); auxiliary notes sit below in *Atkinson Hyperlegible* (13px, `#64748B`).

### Checkboxes & Radio Controls
- Control boxes sized at 20×20px with a 44×44px hit-box envelope.
- Selected state uses background `#004ECC` with an interior pure-white vector icon. Unchecked uses background `#FFFFFF` and border `1.5px solid #CBD5E1`.

### Cards & Modular Mockups
- Built on `#FFFFFF` with a 12px radius, `1px solid #E2E8F0` border, and soft shadow (`0 2px 8px -2px rgba(15,23,42,.06)`).
- Headers display metadata overlines in *Barlow Condensed*, paired with primary titles in *Plus Jakarta Sans*.
- Modular mockups embed mini live inspectors showing real-time lip-sync waveform monitors, dual-language script toggles (`ES` / `EN`), and SCORM manifest telemetry.

### Metrics & Pricing Tables
- Numbers and amounts formatted in *JetBrains Mono* conforming strictly to Peruvian formatting standards: Soles displayed as `S/ 1,500.00` and US Dollars as `US$ 58.20`.
- Metric change rates and numeric capacity bars reside inside `#F1F5F9` wells with progress fills executed in `#004ECC`.