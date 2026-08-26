import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface TabsProps {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Underline-style tab bar with animated indicator feel. */
export const Tabs: React.FC<TabsProps> = ({ tabs, active, onChange, className }) => (
  <div
    role="tablist"
    className={`no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-line ${className ?? ''}`}
  >
    {tabs.map((t) => {
      const isActive = t.id === active;
      return (
        <button
          key={t.id}
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(t.id)}
          className={`press focus-ring relative whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold rounded-t-lg transition-colors ${
            isActive ? 'text-txt' : 'text-muted hover:text-txt'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {t.label}
            {t.count != null && (
              <span className="tnum rounded-md bg-surface3 px-1.5 text-2xs font-bold text-muted">{t.count}</span>
            )}
          </span>
          {isActive && (
            <span className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-accent animate-fadeIn" />
          )}
        </button>
      );
    })}
  </div>
);

interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, icon, action, className }) => (
  <div className={`flex items-center justify-between gap-2 px-1 ${className ?? ''}`}>
    <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-muted">
      {icon}
      {title}
    </h2>
    {action}
  </div>
);

export const LiveDot: React.FC<{ size?: number }> = ({ size = 7 }) => (
  <span
    className="inline-block animate-pulseDot rounded-full bg-live"
    style={{ width: size, height: size }}
    aria-hidden
  />
);

export const LiveBadge: React.FC<{ compact?: boolean; plain?: boolean }> = ({ compact, plain }) =>
  plain ? (
    // bare dot + text — for the big match-page scoreboard
    <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-live">
      <LiveDot size={7} />
      Live
    </span>
  ) : compact ? (
    <span className="chip bg-live/15 text-live">
      <LiveDot size={5} />
      LIVE
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-live px-2 py-0.5 text-2xs font-extrabold uppercase tracking-wide text-white shadow-pop">
      <LiveDot size={6} />
      Live
    </span>
  );

/** Small helper for empty states across pages/tabs. */
export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; hint?: string; children?: React.ReactNode }> = ({
  icon,
  title,
  hint,
  children,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line2 bg-surface/50 px-6 py-12 text-center animate-fadeIn">
    {icon && <div className="text-faint">{icon}</div>}
    <p className="text-sm font-semibold">{title}</p>
    {hint && <p className="max-w-xs text-xs leading-relaxed text-muted">{hint}</p>}
    {children}
  </div>
);

/** Matches raw custom Discord emoji syntax: <:name:id> or animated <a:name:id>. */
export function parseDiscordEmoji(emoji: string): { id: string; animated: boolean } | null {
  const m = emoji.match(/^<(a?):(\w+):(\d+)>$/);
  return m ? { id: m[3], animated: m[1] === 'a' } : null;
}

/** Renders a league emoji — unicode chars as text, custom Discord emojis as CDN images. */
export const LeagueEmoji: React.FC<{ emoji: string; size?: number; className?: string }> = ({
  emoji,
  size = 14,
  className,
}) => {
  const custom = parseDiscordEmoji(emoji);
  if (custom) {
    // Discord preserves each upload's aspect ratio — constrain height only so
    // wide/tall logos keep their true shape instead of being squashed.
    return (
      <img
        src={`https://cdn.discordapp.com/emojis/${custom.id}.${custom.animated ? 'gif' : 'png'}`}
        alt=""
        aria-hidden
        className={`inline-block ${className ?? ''}`}
        style={{ height: Math.round(size * 1.2), width: 'auto' }}
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={className}
      style={{ fontSize: Math.round(size * 1.1), lineHeight: 1 }}
    >
      {emoji}
    </span>
  );
};
