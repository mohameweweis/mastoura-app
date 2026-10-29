import type { SVGProps } from 'react';

export type IconName =
  | 'grid'
  | 'users'
  | 'book'
  | 'card'
  | 'steering'
  | 'truck'
  | 'wrench'
  | 'branch'
  | 'report'
  | 'shield'
  | 'settings'
  | 'bell'
  | 'search'
  | 'plus'
  | 'eye'
  | 'edit'
  | 'trash'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'arrowLeft'
  | 'clock'
  | 'alert'
  | 'check'
  | 'menu'
  | 'logout'
  | 'filter'
  | 'calendar'
  | 'building'
  | 'briefcase'
  | 'id'
  | 'close'
  | 'upload'
  | 'download'
  | 'spinner'
  | 'x-circle';

const paths: Record<IconName, string[]> = {
  grid: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z'],
  card: ['M3 5h18v14H3z', 'M3 9h18', 'M7 13h4', 'M7 16h7'],
  steering: ['M12 3a9 9 0 1 0 9 9', 'M12 3a9 9 0 0 1 9 9', 'M3.3 9h17.4', 'M12 9v10'],
  truck: ['M3 7h11v10H3z', 'M14 10h4l3 3v4h-7z', 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  wrench: ['m14.7 6.3 3 3', 'M21 3a6 6 0 0 1-7.8 7.8L7 17l-4 1 1-4 6.2-6.2A6 6 0 0 1 18 1l-3 3 3 3 3-3Z'],
  branch: ['M5 4h4v4H5z', 'M15 16h4v4h-4z', 'M15 4h4v4h-4z', 'M7 8v5a3 3 0 0 0 3 3h5', 'M17 8v8'],
  report: ['M6 2h9l5 5v15H6z', 'M14 2v6h6', 'M9 13h6', 'M9 17h6'],
  shield: ['M12 3 20 6v6c0 5.5-3.8 9.5-8 11-4.2-1.5-8-5.5-8-11V6z', 'm9 12 2 2 4-4'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.6 1.6-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20h-2.3v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.6-1.6.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.3h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L9 7.1l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.3v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.6 1.6-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.3H20a1.7 1.7 0 0 0-1.6 1Z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
  search: ['m21 21-4.3-4.3', 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z'],
  plus: ['M12 5v14', 'M5 12h14'],
  eye: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 14h10l1-14', 'M9 7V4h6v3'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronLeft: ['m14 18-6-6 6-6'],
  chevronRight: ['m10 18 6-6-6-6'],
  arrowLeft: ['m12 19 7-7-7-7', 'M5 12h14'],
  clock: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  alert: ['M12 9v4', 'M12 17h.01', 'm10.3 3.7-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.3l-8-14a2 2 0 0 0-3.4 0Z'],
  check: ['m5 12 4 4L19 6'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  logout: ['M10 17l5-5-5-5', 'M15 12H3', 'M21 19V5a2 2 0 0 0-2-2h-6'],
  filter: ['M4 6h16', 'M7 12h10', 'M10 18h4'],
  calendar: ['M7 3v4', 'M17 3v4', 'M4 8h16', 'M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z'],
  building: ['M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16', 'M8 7h2', 'M8 11h2', 'M8 15h2', 'M16 9h4v12', 'M16 13h4', 'M16 17h4'],
  briefcase: ['M9 6V4h6v2', 'M4 8h16v11H4z', 'M4 12h16', 'M10 12v2h4v-2'],
  id: ['M4 5h16v14H4z', 'M8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M13 8h4', 'M13 12h4', 'M8 13.5c1.6 0 2.8 1 3.2 2.5'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  upload: ['M12 15V3', 'm7 8 5-5 5 5', 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 19h16'],
  spinner: ['M12 3a9 9 0 1 0 9 9'],
  'x-circle': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'm15 9-6 6', 'm9 9 6 6'],
};

export default function Icon({ name, size = 20, strokeWidth = 1.8, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].map((d, index) => <path d={d} key={index} />)}
    </svg>
  );
}
