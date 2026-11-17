// SkyCast — Vintage Weather Bureau design system.
// Keep the existing token names (background, panel, border, text, muted, accent)
// so current screens remain compatible while the redesign is adopted incrementally.

export const colors = {
  // Core paper-and-ink palette
  background: "#F2EBDD",
  panel: "#FBF7EE",
  panelAlt: "#E9E0CF",
  border: "#CFC2AA",
  text: "#243746",
  muted: "#68777A",

  // Brand accents
  accent: "#8B3F46",       // archival burgundy
  accentDark: "#672D35",
  teal: "#456D70",         // faded weather-map teal
  tealDark: "#315256",
  navy: "#243746",
  brass: "#B18A52",
  sky: "#A9C1C0",

  // Feedback and overlays
  success: "#52745F",
  warning: "#A97836",
  danger: "#A34E46",
  overlay: "rgba(27, 39, 47, 0.48)",
  onAccent: "#FFF9EF",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 26,
  full: 9999,
};

// Use the platform's serif face for the editorial weather-bureau character.
// These are family hints, so unsupported names fall back to the platform serif.
export const typography = {
  display: { fontFamily: "serif", fontSize: 34, lineHeight: 40 },
  title: { fontFamily: "serif", fontSize: 26, lineHeight: 32 },
  heading: { fontFamily: "serif", fontSize: 20, lineHeight: 26 },
  body: { fontFamily: "sans-serif", fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: "sans-serif", fontSize: 12, lineHeight: 17 },
  label: { fontFamily: "sans-serif", fontSize: 11, lineHeight: 15 },
};

export const motion = {
  fast: 140,
  standard: 220,
  slow: 360,
};
