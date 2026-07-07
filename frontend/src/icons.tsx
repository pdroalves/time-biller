type P = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconStopwatch = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 13v-3" />
    <path d="M9 2h6" />
    <circle cx="12" cy="13" r="8" />
    <path d="m17 7 1.5-1.5" />
  </svg>
);
export const IconDashboard = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 0 1 18 0" />
    <path d="M12 12l4-2" />
    <circle cx="12" cy="12" r="1" />
    <path d="M3 12v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6" />
  </svg>
);
export const IconTimer = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13V9" />
    <path d="M9 2h6" />
  </svg>
);
export const IconList = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
export const IconUsers = (p: P) => (
  <svg {...base} {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
  </svg>
);
export const IconFolder = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.5l-2-2H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Z" />
  </svg>
);
export const IconInvoice = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6M9 17h6" />
  </svg>
);
export const IconSettings = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 6h10M18 6h2" />
    <path d="M4 12h2M10 12h10" />
    <path d="M4 18h14M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);
export const IconPlay = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 4l14 8-14 8V4Z" />
  </svg>
);
export const IconPause = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 5v14M16 5v14" />
  </svg>
);
export const IconStop = (p: P) => (
  <svg {...base} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);
