/**
 * Tailwind wiring for the SchoolFlow design system.
 *
 * The tokens live in `src/styles/tokens.css` as CSS custom properties — they
 * are the single source of truth. This file only *maps* them onto Tailwind
 * utilities, so a value is never written twice.
 *
 * The v3 `rgb(var(--x) / <alpha-value>)` pattern is used because it is what
 * lets Tailwind's opacity modifiers work on a CSS variable.
 *
 * `primary-*` is kept as the historical name of the accent ramp because ~50
 * existing pages reference it; new code should prefer the semantic names
 * (`accent`, `surface`, `text-muted`) so it survives a palette change.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── primitives, mirrored from tokens.css ── */
        slate: {
          0: 'var(--slate-0)',
          25: 'var(--slate-25)',
          50: 'var(--slate-50)',
          100: 'var(--slate-100)',
          200: 'var(--slate-200)',
          300: 'var(--slate-300)',
          400: 'var(--slate-400)',
          500: 'var(--slate-500)',
          600: 'var(--slate-600)',
          700: 'var(--slate-700)',
          800: 'var(--slate-800)',
          900: 'var(--slate-900)',
          950: 'var(--slate-950)',
        },
        primary: {
          50: 'var(--blue-50)',
          100: 'var(--blue-100)',
          200: 'var(--blue-200)',
          300: 'var(--blue-300)',
          400: 'var(--blue-400)',
          500: 'var(--blue-500)',
          600: 'var(--blue-600)',
          700: 'var(--blue-700)',
          800: 'var(--blue-800)',
          900: 'var(--blue-900)',
          950: 'var(--blue-950)',
        },
        /* `purple` was removed on purpose: it existed only to feed the
           decorative blue→purple gradients the master prompt forbids (§2). */

        /* ── semantic roles: what components should actually use ── */
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          sunken: 'var(--surface-sunken)',
          hover: 'var(--surface-hover)',
          active: 'var(--surface-active)',
          inset: 'var(--surface-inset)',
          inverse: 'var(--surface-inverse)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          active: 'var(--accent-active)',
          subtle: 'var(--accent-subtle)',
          'subtle-hover': 'var(--accent-subtle-hover)',
          text: 'var(--accent-text)',
          border: 'var(--accent-border)',
        },
        ink: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
          placeholder: 'var(--text-placeholder)',
          inverse: 'var(--text-on-inverse)',
        },
        line: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
          subtle: 'var(--border-subtle)',
        },
        success: {
          DEFAULT: 'var(--success)',
          text: 'var(--success-text)',
          soft: 'var(--success-soft)',
          border: 'var(--success-border)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          text: 'var(--warning-text)',
          soft: 'var(--warning-soft)',
          border: 'var(--warning-border)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          text: 'var(--danger-text)',
          soft: 'var(--danger-soft)',
          border: 'var(--danger-border)',
        },
        info: {
          DEFAULT: 'var(--info)',
          text: 'var(--info-text)',
          soft: 'var(--info-soft)',
          border: 'var(--info-border)',
        },

        /* Historical aliases kept so existing pages do not break. They resolve
           to semantic tokens, so they stay theme-correct automatically. */
        background: 'var(--surface-sunken)',
        dark: 'var(--slate-950)',
        text: 'var(--text)',
        muted: 'var(--text-muted)',
        border: 'var(--border)',
      },

      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },

      fontSize: {
        display: ['var(--text-display)', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['var(--text-h1)', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '650' }],
        h2: ['var(--text-h2)', { lineHeight: '1.35', letterSpacing: '-0.005em', fontWeight: '600' }],
        h3: ['var(--text-h3)', { lineHeight: '1.45', fontWeight: '600' }],
        body: ['var(--text-body)', { lineHeight: '1.55' }],
        sm: ['var(--text-sm)', { lineHeight: '1.5' }],
        xs: ['var(--text-xs)', { lineHeight: '1.45' }],
        caption: ['var(--text-caption)', { lineHeight: '1.4', letterSpacing: '0.02em' }],
      },

      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },

      boxShadow: {
        none: 'var(--shadow-none)',
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        card: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        'card-hover': 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
      },

      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
        20: 'var(--space-20)',
      },

      transitionDuration: {
        instant: 'var(--duration-instant)',
        fast: 'var(--duration-fast)',
        standard: 'var(--duration-standard)',
        medium: 'var(--duration-medium)',
        slow: 'var(--duration-slow)',
      },

      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        enter: 'var(--ease-enter)',
        exit: 'var(--ease-exit)',
        emphasized: 'var(--ease-emphasized)',
      },

      zIndex: {
        base: 'var(--z-base)',
        raised: 'var(--z-raised)',
        sticky: 'var(--z-sticky)',
        topbar: 'var(--z-topbar)',
        drawer: 'var(--z-drawer)',
        dropdown: 'var(--z-dropdown)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
        tooltip: 'var(--z-tooltip)',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-down': { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(12px)' }, to: { opacity: '1', transform: 'none' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        'count-up': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-4px)' },
          '40%': { transform: 'translateX(4px)' },
          '60%': { transform: 'translateX(-2px)' },
          '80%': { transform: 'translateX(2px)' },
        },
      },

      animation: {
        'fade-in': 'fade-in var(--duration-fast) var(--ease-enter) both',
        'slide-up': 'slide-up var(--duration-standard) var(--ease-enter) both',
        'slide-down': 'slide-down var(--duration-standard) var(--ease-enter) both',
        'slide-in-right': 'slide-in-right var(--duration-standard) var(--ease-enter) both',
        'scale-in': 'scale-in var(--duration-fast) var(--ease-enter) both',
        shimmer: 'shimmer 1.6s linear infinite',
        shake: 'shake 0.3s ease-in-out',
      },
    },
  },
  plugins: [],
};