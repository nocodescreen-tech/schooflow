SchoolFlow Visual Rebuild — Implementation Plan

**Goal**: Completely replace the existing visual language with a new premium, editorial SchoolFlow design system. No patching of old components; rebuild App Shell, authentication, landing, dashboards and workspaces from scratch while preserving all functional logic, accounts, data and API contracts.

**Constraints from audit**
- Existing design tokens exist in client/src/styles/tokens.css and client/src/index.css with slate/blue primitives and motion tokens.
- Functional backend is intact: OtpService, EmailService, auth, RBAC, documents. No data changes allowed.
- Current UI uses dark sidebar and mixed neutral surfaces. New direction requires light neutral system everywhere.
- Primary accent will change from current blue to a new brand color to be defined during build.
- Photography will be sourced as licensed realistic educational stock.

**Phase 1 — Audit & Inventory**
- Map all UI entry points: Landing, AuthLayout and pages Login/Register/ForgotPassword/ResetPassword/Activate/VerifyEmail, Onboarding, Layout, Sidebar, Topbar, Dashboard, role workspaces, DocumentBuilder, tables, forms, modals.
- Identify components that enforce old visual patterns and list shared UI primitives that must be refactored.
- Document current Tailwind config, breakpoints, and motion utilities.

**Phase 2 — New Design System**
Create a centralized design system consumed by all pages:
- Color tokens: white, off-white, slate/gray/ graphite, black, new primary accent, functional status colors. No decorative gradients.
- Typography tokens: display, h1-h3, body, small, caption with a modern readable family.
- Spacing, radius, border, shadow, motion tokens as defined in tokens.css but aligned to light neutral system.
- Component states for buttons, inputs, cards, tables, modals, toasts, badges.
- Layout rules: 12-col grid, container max widths, sidebar 280px collapsed/expanded, sticky offset.

**Phase 3 — App Shell Rebuild**
- Rebuild Layout, Sidebar, Topbar with light neutral surfaces, refined typography, subtle motion for expand/collapse.
- Page transitions using opacity + translateY 150-250ms with respect to prefers-reduced-motion.
- Global search Command Palette, Toast system, Loading/Error/Empty states.

**Phase 4 — Public & Auth Rebuild**
- Landing: editorial narrative hero with headline, subhead, CTAs, realistic human photography, problem → solution sections for Academic/Admin/Teachers/Students/Parents/Documents/Finance/Security, product preview, final CTA, footer.
- Login: desktop left visual area with photography and right auth form, balanced composition. Tested at 1440/1366/1280/1024px. Mobile simplified to form-first.
- Register, Forgot Password, Reset Password, Account Activation, Email Verification rebuilt as step flows with consistent visual language, OTP premium component with auto-advance, countdown and resend.
- Onboarding stepper with progress indicator.

**Phase 5 — Workspaces & Core UI**
- Dashboard rebuilt with role-specific compositions, primary insight cards, secondary data, activity timeline, alerts, quick actions. No repetitive card grids.
- Tables: clean header, row hover, status pills, avatars, row actions menu, filters, sorting, pagination with server-side behavior preserved.
- Forms: premium labels, focus states, validation, helper text, loading states.
- Modals/Drawers with scale + opacity entrance, backdrop, focus management.
- DocumentBuilder UI refreshed to match new system while preserving drag/drop, live preview and PDF generation logic.

**Phase 6 — Responsive & Motion**
- Desktop-first validation at 1440/1366/1280/1024, tablet 768, mobile 430/390/375.
- No horizontal overflow, no cut elements, touch targets ≥24px.
- Motion system: transform + opacity only, durations 100-350ms, purposeful micro-interactions for buttons, focus, validation, modal, sidebar.

**Phase 7 — Quality Gates**
- Visual review per critical screen: Landing, Login, Register, Forgot/Reset, Activate, Verify Email, Dashboard, Sidebar, Student/Teacher/Parent workspaces, Documents, Settings.
- Verify every button triggers real business action with loading/success/error states.
- Ensure permissions gated UI matches backend RBAC.
- Regression test auth, OTP email delivery, password reset, sessions, document generation.

**Deliverables**
- New design system tokens and components
- Rebuilt Landing, Auth, Onboarding, App Shell, Dashboard, Workspaces
- Responsive validation and motion system
- No legacy visual remnants; single cohesive SchoolFlow identity

**Risks mitigated**
- Functional logic untouched; only presentation layer changes.
- Existing accounts, sessions, OTP flows preserved.
- No destructive DB changes; all edits are UI-only.

Plan ready for approval.