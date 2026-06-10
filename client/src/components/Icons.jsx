/**
 * Icons.jsx
 * Small inline SVG icons used across the app — no icon library dependency.
 * All take a `className` prop so size/colour is controlled with Tailwind classes.
 */

import React from 'react';

/** Water droplet — used for zones and the app logo. */
export const Droplet = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" />
  </svg>
);

/** Rain cloud — used for the rain delay feature. */
export const CloudRain = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
    <line x1="8" y1="19" x2="8" y2="21" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="16" y1="19" x2="16" y2="21" />
  </svg>
);

/** Clock — used for schedules and history timestamps. */
export const Clock = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

/** Play triangle — run buttons. */
export const Play = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

/** Stop square — stop buttons. */
export const Stop = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

/** Calendar — schedules tab. */
export const Calendar = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

/** History / list — history tab. */
export const History = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);

/** Snowflake — air conditioning module. */
export const Snowflake = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="3.34" y1="7" x2="20.66" y2="17" />
    <line x1="3.34" y1="17" x2="20.66" y2="7" />
    <path d="M12 2l2 3-2 1-2-1 2-3" fill="none" />
  </svg>
);

/** Flame — underfloor heating module. */
export const Flame = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 23c-4.97 0-8-3.58-8-8 0-3.07 1.64-5.64 3.2-7.4.83-.93 2.3-.3 2.3.95V10a1.5 1.5 0 0 0 2.9.54c.83-2.14 1.6-4.93 1.6-7.04 0-.96 1.06-1.57 1.83-1 2.66 1.97 6.17 5.94 6.17 12.5 0 4.42-3.03 8-8 8h-2z" transform="scale(0.9) translate(1.2 0.5)" />
  </svg>
);

/** Chevron left — back navigation. */
export const ChevronLeft = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

/** Chevron right — tile affordance. */
export const ChevronRight = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/** Gauge / meter — usage & cost tab. */
export const Gauge = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15l3.5-5.5" />
    <path d="M20.2 17.2a9 9 0 1 0 -16.4 0" />
    <circle cx="12" cy="15" r="1.5" fill="currentColor" />
  </svg>
);

/** Thermometer — temperature-conditional schedules. */
export const Thermometer = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
);

/** Map pin — home location setting. */
export const MapPin = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
