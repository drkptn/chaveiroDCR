import type { SVGProps } from "react";

/** Ícones próprios do DCR — traço técnico de 1.5px, cantos chanfrados. */
type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 24): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

export const IconCopy = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="6.5" cy="8" r="3.5" />
    <path d="M10 8h10.5l-1 1.6 1 1.4-1 1.4H18l-.8-1-.8 1h-1.2l-.8-1-.8 1H10" />
    <circle cx="6.5" cy="8" r="1" />
    <path d="M4 15.5h7M4 18.5h11" strokeDasharray="1.6 1.8" />
  </svg>
);

export const IconCar = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="4" width="9" height="13" rx="3.2" />
    <circle cx="7.5" cy="8.2" r="1.2" />
    <path d="M6 12.5h3" />
    <path d="M12 13.5l3.2 3.2 1.4-.6 1.2 1.2-.6 1.4 1.2 1.2 1.2-.4" />
  </svg>
);

export const IconCylinder = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M8 3.5a5 5 0 0 1 3.4 8.7V20.5H4.6v-8.3A5 5 0 0 1 8 3.5Z" />
    <circle cx="8" cy="8.5" r="2.6" />
    <path d="M8 7.4v2.2" />
    <path d="M15 6h5M15 10h3.5M15 14h5M15 18h3.5" />
  </svg>
);

export const IconDoor = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 21V3.5h11V21" />
    <path d="M3 21h18" />
    <circle cx="13" cy="12" r="1.3" />
    <path d="M13 13.3v2" />
    <path d="M16 7.5l3-1.5v13l-3-1.5" />
  </svg>
);

export const IconShield = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 2.8 19.5 6v5.4c0 4.6-3.1 8.2-7.5 9.8-4.4-1.6-7.5-5.2-7.5-9.8V6Z" />
    <rect x="8.6" y="10.4" width="6.8" height="5.4" rx="1" />
    <path d="M10 10.4V9a2 2 0 0 1 4 0v1.4" />
  </svg>
);

export const IconWhatsapp = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4.2 19.8 5.3 16A8.2 8.2 0 1 1 8.4 19Z" />
    <path d="M9.2 8.4c.3-.6.6-.6.9-.6h.6c.2 0 .4.1.5.4l.7 1.6c.1.3 0 .5-.1.7l-.5.6c-.1.2-.1.4 0 .6.6 1 1.5 1.9 2.6 2.4.2.1.4.1.6-.1l.6-.7c.2-.2.4-.2.7-.1l1.5.7c.3.1.4.3.4.6 0 .9-.6 1.6-1.6 1.8-1.2.2-3.1-.4-4.9-2.1-1.8-1.7-2.5-3.5-2.4-4.7.1-.4.2-.8.4-1.1Z" />
  </svg>
);

export const IconInstagram = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="3.8" />
    <circle cx="17" cy="7" r=".6" fill="currentColor" />
  </svg>
);

export const IconPhone = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6.6 3.5h2.6l1.5 4-2 1.3a10.5 10.5 0 0 0 6.5 6.5l1.3-2 4 1.5v2.6a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1Z" />
  </svg>
);

export const IconPin = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const IconClock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3.2 2" />
    <path d="M12 3.5v1.2M20.5 12h-1.2M12 20.5v-1.2M3.5 12h1.2" />
  </svg>
);

export const IconArrow = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 12h15M14 7l5 5-5 5" />
  </svg>
);

export const IconChevron = ({ size, dir = "right", ...p }: P & { dir?: "left" | "right" }) => (
  <svg {...base(size)} {...p} style={{ transform: dir === "left" ? "scaleX(-1)" : undefined, ...p.style }}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconChat = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 5.5h16v10H10l-4 3.5v-3.5H4Z" />
    <path d="M8 9.5h8M8 12.3h5" />
  </svg>
);

export const IconSearch = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
    <path d="M8 10.5h5M10.5 8v5" />
  </svg>
);

export const IconWrench = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M14.5 4.2a4.6 4.6 0 0 0 5.3 5.3l-9.6 9.6a2.1 2.1 0 1 1-3-3l9.6-9.6" />
    <path d="M14.6 4.2 17 6.6l-1 2.4-2.4 1-2.4-2.4" />
  </svg>
);

export const IconCheck = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8 12.3l2.7 2.7L16.2 9.4" />
  </svg>
);

export const IconXray = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3.5 7.5v-4h4M16.5 3.5h4v4M20.5 16.5v4h-4M7.5 20.5h-4v-4" />
    <path d="M12 6.5a3 3 0 0 1 2 5.2V17.5h-4v-5.8a3 3 0 0 1 2-5.2Z" />
  </svg>
);

/** Ícone-mecanismo: chave que entra no buraco e gira (anima via CSS do botão). */
export const IconKeyTurn = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="key-turn">
    <path className="kt-hole" d="M12 4.6a3.4 3.4 0 0 1 2 6.2l1 7.6H9l1-7.6a3.4 3.4 0 0 1 2-6.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <g className="kt-key">
      <circle cx="12" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 10.2v9.3M12 14.5h2M12 17h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  </svg>
);

export const categoryIcon = {
  copy: IconCopy,
  car: IconCar,
  cylinder: IconCylinder,
  door: IconDoor,
  shield: IconShield,
} as const;
