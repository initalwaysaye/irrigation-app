/**
 * ComingSoon.jsx
 * Shared placeholder screen for modules that aren't wired to hardware yet
 * (Air Conditioning, Underfloor Heating). Shows the module's branding with
 * a glowing icon so the app feels complete while integrations are pending.
 *
 * Props:
 *   title       - module name, e.g. "Air Conditioning"
 *   description - one-liner about what the module will do
 *   icon        - icon element to feature
 *   accent      - 'blue' | 'amber' — accent colour theme
 *   onBack      - navigate back to the landing screen
 */

import React from 'react';
import { ChevronLeft } from '../components/Icons';

// Static accent class lookups — Tailwind needs full class names at build time,
// so we can't construct them dynamically from the accent string.
const ACCENTS = {
  blue: {
    iconBg: 'bg-blue-500/10 text-blue-400',
    glow: 'shadow-[0_0_60px_8px_rgba(59,130,246,0.15)]',
    pill: 'bg-blue-500/10 text-blue-400',
  },
  amber: {
    iconBg: 'bg-amber-500/10 text-amber-400',
    glow: 'shadow-[0_0_60px_8px_rgba(245,158,11,0.15)]',
    pill: 'bg-amber-500/10 text-amber-400',
  },
};

export default function ComingSoon({ title, description, icon, accent, onBack }) {
  const a = ACCENTS[accent] ?? ACCENTS.blue;

  return (
    <div className="max-w-lg mx-auto px-5 pt-6 pb-12">

      {/* Back navigation */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-slate-400 hover:text-gray-200 text-sm font-medium mb-12 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Home
      </button>

      {/* Centred module branding */}
      <div className="flex flex-col items-center text-center pt-10">
        <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-6 ${a.iconBg} ${a.glow}`}>
          {icon}
        </div>

        <h1 className="text-xl font-bold text-gray-100 mb-2">{title}</h1>
        <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-6">{description}</p>

        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${a.pill}`}>
          Not connected yet
        </span>
      </div>
    </div>
  );
}
