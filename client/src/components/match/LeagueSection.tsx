import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Match } from '../../types';
import { LeagueEmoji } from '../ui/primitives';
import { MatchCard } from './MatchCard';

// ---------------------------------------------------------------------------
// A league "category" box, fotmob-style: prominent header strip with the
// league logo + bold name, then the match rows sitting flush against the
// section edges, separated by thin dividers. Several games from the same
// competition share one box. Tapping the header opens the league's page;
// the arrow on the right collapses/expands the section.
// ---------------------------------------------------------------------------

interface LeagueSectionProps {
  name: string;
  emoji?: string;
  matches: Match[];
  /** When set, the header links to the league detail page. */
  leagueId?: number;
}

export const LeagueSection: React.FC<LeagueSectionProps> = ({ name, emoji, matches, leagueId }) => {
  const [collapsed, setCollapsed] = useState(false);

  const headerContent = (
    <>
      {emoji && <LeagueEmoji emoji={emoji} size={22} />}
      <span className="truncate text-sm font-bold text-txt">{name}</span>
      {leagueId != null && (
        <ChevronRight
          size={16}
          className="shrink-0 text-faint transition-transform duration-150 group-hover/header:translate-x-0.5"
        />
      )}
    </>
  );

  return (
    <section aria-label={name} className="overflow-hidden rounded-xl border border-line shadow-card">
      {/* league header — logo + name (opens the league), collapse arrow on the right */}
      <div className="flex items-center gap-2 border-b border-line bg-surface2 py-2.5 pl-3.5 pr-2">
        {leagueId != null ? (
          <Link
            to={`/league/${leagueId}`}
            aria-label={`Open ${name}`}
            className="group/header flex min-w-0 flex-1 items-center gap-2 rounded-lg transition-colors duration-150 hover:opacity-90"
          >
            {headerContent}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">{headerContent}</div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
          className="press focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-surface3 hover:text-txt"
        >
          <ChevronDown size={16} className={`transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      </div>
      {/* matches run edge-to-edge and fill the section to the bottom */}
      {!collapsed && (
        <div className="flex flex-col divide-y divide-line">
          {matches.map(m => (
            <MatchCard key={m.id} match={m} showLeague={false} flush />
          ))}
        </div>
      )}
    </section>
  );
};

export default LeagueSection;
