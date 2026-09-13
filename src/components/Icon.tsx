import type { CSSProperties } from "react";

export type IconName = "cube" | "arrow" | "arrowDown" | "trees" | "clock" | "users" | "volume" | "muted" | "mic" | "micOff" | "settings" | "help" | "chevron" | "check" | "plus" | "minus" | "expand" | "compass" | "copy" | "close" | "wifi" | "logOut" | "book" | "sparkles" | "wood" | "stone" | "glass" | "backpack" | "flag" | "rotate" | "trophy" | "leaf" | "sun";
const paths: Record<IconName, React.ReactNode> = {
  cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.7 8-4.7M12 12v9M8 5.2l8 4.6"/></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  arrowDown: <path d="M12 4v16m-6-6 6 6 6-6"/>,
  trees: <><path d="m8 3-5 7h3l-4 6h12l-4-6h3L8 3Zm0 13v5M17 5l-3 5h2l-3 6h8l-3-6h2l-3-5Zm0 11v5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/></>,
  volume: <><path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  muted: <><path d="m11 5-6 4H2v6h3l6 4V5Zm5 4 5 6m0-6-5 6"/></>,
  mic: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
  micOff: <><path d="m3 3 18 18M9 9v3a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 0v5M5 10v2a7 7 0 0 0 12 5m2-5v-2M12 19v3m-4 0h8"/></>,
  settings: <><path d="m10 3-1 3-3 1-2 2 2 3-1 3 2 3h3l2 3 3-2 3-1v-3l3-2-2-3-1-3h-3l-2-3-3 2Z"/><circle cx="12" cy="12" r="3"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1.5-1.5 2m0 3h.01"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  minus: <path d="M5 12h14"/>,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
  compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  wifi: <><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-10 4a5 5 0 0 1 6 0m-3 4h.01"/></>,
  logOut: <><path d="M9 3H4v18h5m4-14 5 5-5 5m-5-5h13"/></>,
  book: <><path d="M12 5C9 3 5 3 2 4v15c4-1 7-1 10 1m0-15c3-2 7-2 10-1v15c-4-1-7-1-10 1V5Z"/></>,
  sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/></>,
  wood: <><path d="m3 9 12-6 6 4-12 6-6-4Zm0 0v8l6 4 12-6V7M9 13v8m-3-8v3m6-3 6-3m-6 6 6-3"/></>,
  stone: <><path d="m7 4 10 1 5 9-7 7-11-3-2-8 5-6Z"/><path d="m7 4 2 8 6 9m-6-9 13 2M2 10l7 2 8-7"/></>,
  glass: <><path d="m12 2 7 5 2 10-9 5-9-5L5 7l7-5Z"/><path d="m12 2 3 8-3 12-3-12 3-8ZM5 7l4 3h6l4-3"/></>,
  backpack: <><path d="M9 5V3h6v2M5 21V10a7 7 0 0 1 14 0v11H5Z"/><rect x="8" y="12" width="8" height="6" rx="1"/><path d="M2 13v7h3m14-7h3v7h-3"/></>,
  flag: <><path d="M5 22V3m0 1c5-4 9 4 15 0v11c-6 4-10-4-15 0"/></>,
  rotate: <><path d="M3 9a9 9 0 1 1 1 9M3 3v6h6"/></>,
  trophy: <><path d="M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v6m-5 0h10"/></>,
  leaf: <><path d="M20 3C4 1 1 11 6 17S22 19 20 3ZM5 21 16 9"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
};
export function Icon({ name, size = 20, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">{paths[name]}</svg>;
}
