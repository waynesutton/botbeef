// Line icons in the Phosphor "regular" style (256 grid, 16px round strokes), drawn inline so they follow currentColor.
// No emoji in the UI chrome: they render differently on every OS and look cheap next to the art.
import type { CSSProperties, ReactElement } from "react";

const P: Record<string, ReactElement> = {
  moon: <path d="M108 40a92 92 0 1 0 108 108A80 80 0 0 1 108 40Z" />,
  sun: <><circle cx="128" cy="128" r="52" /><path d="M128 24v16M128 216v16M54.5 54.5l11.3 11.3M190.2 190.2l11.3 11.3M24 128h16M216 128h16M54.5 201.5l11.3-11.3M190.2 65.8l11.3-11.3" /></>,
  eye: <><path d="M128 56C48 56 16 128 16 128s32 72 112 72 112-72 112-72-32-72-112-72Z" /><circle cx="128" cy="128" r="40" /></>,
  dice: <><rect x="40" y="40" width="176" height="176" rx="28" /><g fill="currentColor" stroke="none"><circle cx="92" cy="92" r="14" /><circle cx="164" cy="92" r="14" /><circle cx="128" cy="128" r="14" /><circle cx="92" cy="164" r="14" /><circle cx="164" cy="164" r="14" /></g></>,
  pencil: <><path d="M92.7 216H48a8 8 0 0 1-8-8v-44.7a8 8 0 0 1 2.3-5.6l120-120a8 8 0 0 1 11.3 0l44.7 44.7a8 8 0 0 1 0 11.3l-120 120a8 8 0 0 1-5.6 2.3Z" /><path d="m136 64 56 56" /></>,
  lock: <><rect x="40" y="88" width="176" height="128" rx="12" /><path d="M88 88V56a40 40 0 0 1 80 0v32" /></>,
  check: <path d="m40 144 56 56L224 72" />,
  out: <path d="M64 192 192 64M88 64h104v104" />,
  play: <path d="M76 44v168a6 6 0 0 0 9.2 5.1l134-84a6 6 0 0 0 0-10.2l-134-84A6 6 0 0 0 76 44Z" />,
  x: <path d="M200 56 56 200M200 200 56 56" />,
  cpu: <><rect x="64" y="64" width="128" height="128" rx="16" /><rect x="100" y="100" width="56" height="56" rx="6" /><path d="M104 64V32M152 64V32M104 224v-32M152 224v-32M64 104H32M64 152H32M224 104h-32M224 152h-32" /></>,
  layers: <><path d="m32 92 96 52 96-52-96-52Z" /><path d="m32 140 96 52 96-52" /><path d="m32 184 96 52 96-52" /></>,
  zap: <path d="M144 24 48 144h72l-8 88 96-120h-72Z" />,
  gavel: <><path d="m112 40 64 64M88 64l64 64M100 52l64 64" /><path d="m124 104-92 92a17 17 0 0 0 24 24l92-92" /><path d="M136 224h88" /></>,
  info: <><circle cx="128" cy="128" r="96" /><path d="M120 120h8v56h8" /><circle cx="126" cy="84" r="4" fill="currentColor" /></>,
  shuffle: <><path d="M176 104h48V56" /><path d="M190.2 190.2a88 88 0 1 1 0-124.4L224 99.4" /></>,
  down: <path d="m208 96-80 80-80-80" />,
  up: <path d="m48 160 80-80 80 80" />,
  user: <><circle cx="128" cy="96" r="56" /><path d="M32 216c19.4-33.5 54.9-56 96-56s76.6 22.5 96 56" /></>,
  expand: <path d="M160 48h48v48M96 208H48v-48M208 48l-56 56M48 208l56-56" />,
  plus: <path d="M40 128h176M128 40v176" />,
  minus: <path d="M40 128h176" />,
  trophy: <><path d="M72 40h112v56a56 56 0 0 1-112 0Z" /><path d="M72 64H40v16a32 32 0 0 0 32 32M184 64h32v16a32 32 0 0 1-32 32M128 152v40M88 216h80M104 192h48" /></>,
  clock: <><circle cx="128" cy="128" r="96" /><path d="M128 72v56h56" /></>,
  target: <><circle cx="128" cy="128" r="96" /><circle cx="128" cy="128" r="56" /><circle cx="128" cy="128" r="16" /></>,
  alert: <><path d="M114 40 24 196a16 16 0 0 0 14 24h180a16 16 0 0 0 14-24L142 40a16 16 0 0 0-28 0Z" /><path d="M128 104v48" /><circle cx="128" cy="184" r="4" fill="currentColor" /></>,
  coin: <><circle cx="128" cy="128" r="96" /><path d="M156 96c-6-10-16-16-28-16-18 0-30 10-30 24 0 32 60 18 60 50 0 14-14 24-30 24-13 0-24-6-30-16M128 64v16M128 176v16" /></>,
  chart: <path d="M40 216V40M40 216h176M80 176v-48M128 176V88M176 176v-80" />,
};
export type IconName = keyof typeof P;
export function I({ n, size = "1em", style, className, label }: { n: IconName; size?: number | string; style?: CSSProperties; className?: string; label?: string }) {
  return (
    <svg className={className ? `ic ${className}` : "ic"} viewBox="0 0 256 256" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round"
      style={style} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })} data-icon={n}>{P[n]}</svg>
  );
}

/** Bot Battle mark: a mic resting on a keyboard. Solid monochrome, follows currentColor (auto-inverts in dark mode). */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="mark" viewBox="0 0 32 32" width={size} height={size} fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d={LOGO_BODY} />
      <g transform="rotate(8 16 9)"><rect x="11.8" y="7.3" width="15.3" height="3.4" rx="1.7" /><path fillRule="evenodd" d={LOGO_HEAD} /></g>
    </svg>
  );
}

const LOGO_BODY = "M6.2 14.4h19.6a4.2 4.2 0 0 1 4.2 4.2v7.799999999999999a4.2 4.2 0 0 1 -4.2 4.2h-19.6a4.2 4.2 0 0 1 -4.2 -4.2v-7.799999999999999a4.2 4.2 0 0 1 4.2 -4.2zM5.9 17.2h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM10.5 17.2h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM15.099999999999998 17.2h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM19.7 17.2h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM24.299999999999997 17.2h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM5.9 21.6h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM10.5 21.6h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM15.099999999999998 21.6h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM19.7 21.6h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM24.299999999999997 21.6h1.6a0.7 0.7 0 0 1 0.7 0.7v1.4a0.7 0.7 0 0 1 -0.7 0.7h-1.6a0.7 0.7 0 0 1 -0.7 -0.7v-1.4a0.7 0.7 0 0 1 0.7 -0.7zM9.9 26h12.2a0.9 0.9 0 0 1 0.9 0.9v0.19999999999999996a0.9 0.9 0 0 1 -0.9 0.9h-12.2a0.9 0.9 0 0 1 -0.9 -0.9v-0.19999999999999996a0.9 0.9 0 0 1 0.9 -0.9z";
const LOGO_HEAD = "M3 9a4.6 4.6 0 1 0 9.2 0a4.6 4.6 0 1 0 -9.2 0zM4.3999999999999995 7.6h6.4v1h-6.4zM4.199999999999999 10h6.8v1h-6.8z";
