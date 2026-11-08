// Small 18px line icons for the shell. Decorative: always paired with a visible or aria label.
const Svg = ({ children }) => (
  <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const ICONS = {
  overview: <Svg><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>,
  map: <Svg><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2.5" /><path d="M7 6.8 10.2 11M7 17.2l3.2-4.2M14 12h2.5" /></Svg>,
  audit: <Svg><rect x="4" y="3" width="16" height="18" rx="2.5" /><rect x="7" y="7" width="3" height="5" rx=".8" /><rect x="10.5" y="7" width="3" height="5" rx=".8" /><rect x="14" y="7" width="3" height="5" rx=".8" /><path d="M8 16h8" /></Svg>,
  demand: <Svg><path d="M3 17l5-5 4 4 8-8" /><path d="M15 8h5v5" /></Svg>,
  guests: <Svg><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.3c2.3.1 4 1.7 4.5 4.7" /></Svg>,
  model: <Svg><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></Svg>,
  plan: <Svg><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="m9 13 2 2 4-4" /></Svg>,
  claims: <Svg><path d="M7 4h8l4 4v12H7z" /><path d="M15 4v4h4" /><path d="M10 12h6M10 15.5h6" /><path d="M4 8v12" /></Svg>,
  search: <Svg><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>,
  spark: <Svg><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></Svg>,
  collapse: <Svg><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16M15.5 10l-2 2 2 2" /></Svg>,
  menu: <Svg><path d="M4 7h16M4 12h16M4 17h16" /></Svg>,
  calendar: <Svg><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>,
  reset: <Svg><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></Svg>,
};
