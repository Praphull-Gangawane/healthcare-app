const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  checkCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l3 3 5-6',
  alert: 'M12 4l9 16H3L12 4zM12 10v4.5M12 17.5v.01',
  alertCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5v6M12 16.5v.01',
  xCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5.5M12 7.5v.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8.5 3v4M15.5 3v4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3.5h16V16',
  download: 'M12 4v12M7 11l5 5 5-5M4 16v3.5h16V16',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  home: 'M4 11l8-7 8 7v9h-5.5v-6h-5v6H4z',
  pill: 'M9 15l6-6M6.8 17.2a4 4 0 0 1 0-5.6l4.8-4.8a4 4 0 0 1 5.6 5.6l-4.8 4.8a4 4 0 0 1-5.6 0z',
  flask: 'M9.5 3h5M10 3v6l-5 9.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9',
  activity: 'M3 12h4l2.5-6 5 12 2.5-6h4',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4',
  shield: 'M12 3l7.5 3v6c0 4.5-3.3 7.8-7.5 9-4.2-1.2-7.5-4.5-7.5-9V6z',
  shieldCheck: 'M12 3l7.5 3v6c0 4.5-3.3 7.8-7.5 9-4.2-1.2-7.5-4.5-7.5-9V6zM8.5 12l2.5 2.5 4.5-5',
  stethoscope: 'M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2M20 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  building: 'M4 21V5l8-2v18M12 7h8v14M7.5 8v.01M7.5 12v.01M7.5 16v.01M15.5 11v.01M15.5 15v.01M2 21h20',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6v.01M4.5 12v.01M4.5 18v.01',
  queue: 'M4 5h10M4 10h16M4 15h16M4 20h10',
  wallet: 'M4 7a2 2 0 0 1 2-2h12v4M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16.5 14.5v.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5l1.6 1.2-1.8 3.2-1.9-.7a7 7 0 0 1-1.8 1l-.3 2h-3.6l-.3-2a7 7 0 0 1-1.8-1l-1.9.7-1.8-3.2 1.6-1.2a7 7 0 0 1 0-2l-1.6-1.2 1.8-3.2 1.9.7a7 7 0 0 1 1.8-1l.3-2h3.6l.3 2a7 7 0 0 1 1.8 1l1.9-.7 1.8 3.2-1.6 1.2a7 7 0 0 1 0 2z',
  video: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h9a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 14 18H5a1.5 1.5 0 0 1-1.5-1.5zM15.5 10.5l5-3v9l-5-3',
  mapPin: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  language: 'M4 5h9M8.5 3v2M11 5c-1 4.5-3.5 8-7 10M6 9c1.5 2.5 3.5 4.5 6 6M13 21l4-9 4 9M14.5 18h5',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5-2.6M19 12.5a10 10 0 0 0-2.5-1.8M2 9a15 15 0 0 1 4.5-2.7M22 9A15 15 0 0 0 11 5.1M12 20v.01',
  lock: 'M6.5 11h11v9.5h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  camera: 'M4 8h3l2-2.5h6L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z',
  dot: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  square: 'M7 7h10v10H7z',
  diamond: 'M12 4l8 8-8 8-8-8z',
  pause: 'M9 5v14M15 5v14',
  cross: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
