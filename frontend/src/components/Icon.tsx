export type IconName = 'arrow' | 'lock' | 'close' | 'board' | 'eye' | 'sound' | 'check' | 'link' | 'mic' | 'micOff' | 'pause' | 'play' | 'settings';

const paths: Record<IconName, string> = {
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
  close: 'm6 6 12 12M6 18 18 6',
  board: 'M3 4h18v15H3zM7 8h3v4H7zM14 7h3v4h-3zM9 16l6-3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  sound: 'M4 10v4h4l5 4V6l-5 4H4m12-2a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  check: 'm5 12 4 4L19 6',
  link: 'm10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4m12 2 2-2a4 4 0 0 0-6-6l-4 4',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-7 9a7 7 0 0 0 14 0m-7 7v4m-4 0h8',
  micOff: 'M2 2l20 20M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-1m14 0v1a7 7 0 0 1-.11 1.23M12 19v3m-4 0h8',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  play: 'M6 4l14 8-14 8V4z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z',
};

/** <summary>Small local SVG icons, with no font or CDN dependency.</summary> */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
