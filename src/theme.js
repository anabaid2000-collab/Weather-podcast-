// SkyCast — Dual Atmosphere design tokens.
// The app uses a bright sky-blue day palette; weather scenes supply the
// atmospheric variation for rain, sunset and night without changing data logic.
export const colors = {
  background: "#F3F8FF",
  panel: "#FFFFFF",
  panelAlt: "#E8F2FC",
  border: "#D8E7F5",
  text: "#203B56",
  muted: "#71849A",
  accent: "#287FC5",
  accentDark: "#1D639E",
  teal: "#3D9FA8",
  tealDark: "#287783",
  navy: "#183A5B",
  brass: "#8FB9DE",
  sky: "#B8D9F4",
  success: "#39856B",
  warning: "#B77C32",
  danger: "#B94F55",
  overlay: "rgba(16, 31, 49, 0.48)",
  onAccent: "#FFFFFF",
};
export const spacing = { xs:4, sm:8, md:16, lg:24, xl:32, xxl:40 };
export const radius = { sm:10, md:16, lg:22, xl:28, full:9999 };
export const typography = {
  display:{fontFamily:"sans-serif",fontSize:36,lineHeight:42,fontWeight:"800"},
  title:{fontFamily:"sans-serif",fontSize:27,lineHeight:33,fontWeight:"800"},
  heading:{fontFamily:"sans-serif",fontSize:20,lineHeight:26,fontWeight:"700"},
  body:{fontFamily:"sans-serif",fontSize:15,lineHeight:22},
  caption:{fontFamily:"sans-serif",fontSize:12,lineHeight:17},
  label:{fontFamily:"sans-serif",fontSize:11,lineHeight:15,fontWeight:"700"},
};
export const motion = { fast:140, standard:220, slow:360 };
