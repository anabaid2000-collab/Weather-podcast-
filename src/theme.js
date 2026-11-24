// SkyCast — Dual Atmosphere design tokens.
// The app uses a bright sky-blue day palette; weather scenes supply the
// atmospheric variation for rain, sunset and night without changing data logic.
export const colors = {
  // SkyCast reference palette: cool coastal blue, slate ink and warm amber.
  background: "#EEF6F7",
  panel: "#F8FBFC",
  panelAlt: "#BFE0EE",
  border: "rgba(16, 34, 47, 0.17)",
  text: "#10222F",
  muted: "#48606F",
  accent: "#7FB7C9",
  accentDark: "#315F73",
  teal: "#4F9D9A",
  tealDark: "#315F73",
  navy: "#0F2230",
  brass: "#F2B84B",
  sky: "#BFE0EE",
  success: "#3F8E76",
  warning: "#A96C1D",
  danger: "#B94F55",
  overlay: "rgba(8, 19, 31, 0.55)",
  onAccent: "#0F2230",
};
export const spacing = { xs:4, sm:8, md:16, lg:24, xl:32, xxl:40 };
export const radius = { sm:3, md:4, lg:6, xl:8, full:9999 };
export const typography = {
  display:{fontFamily:"sans-serif",fontSize:36,lineHeight:42,fontWeight:"800"},
  title:{fontFamily:"sans-serif",fontSize:27,lineHeight:33,fontWeight:"800"},
  heading:{fontFamily:"sans-serif",fontSize:20,lineHeight:26,fontWeight:"700"},
  body:{fontFamily:"sans-serif",fontSize:15,lineHeight:22},
  caption:{fontFamily:"sans-serif",fontSize:12,lineHeight:17},
  label:{fontFamily:"sans-serif",fontSize:11,lineHeight:15,fontWeight:"700"},
};
export const motion = { fast:140, standard:220, slow:360 };
