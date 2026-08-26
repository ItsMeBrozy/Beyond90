import React from 'react';
import { Link } from 'react-router-dom';
import { StandingsTable as StandingsTableData } from '../../types';
import { Crest } from '../ui/Crest';
import { LeagueEmoji } from '../ui/primitives';

// ---------------------------------------------------------------------------
// FotMob-style league table: prominent header strip with the league logo +
// name, then the full W/D/L/GD/Pts grid. Stat columns beyond Played and Pts
// hide on small screens so nothing gets cramped on mobile.
// ---------------------------------------------------------------------------

const FORM_STYLES: Record<string, string> = {
  W: 'bg-accent/15 text-accent',
  D: 'bg-surface3 text-muted',
  L: 'bg-live/15 text-live',
};

const ADJ_STYLE = 'text-[9px] font-medium uppercase tracking-wider text-faint/70';

const HeadCell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th scope="col" className={`px-2 py-2 text-center text-2xs font-bold uppercase tracking-wider text-faint ${className ?? ''}`}>
    {children}
  </th>
);

// Display optional adjustment line under a row. Shows "+W +D -L +GF -GA +Pts"
// when any value is non-zero; nothing when all zero.
export function AdjLine({ extraWon, extraDrawn, extraLost, extraGoalsFor, extraGoalsAgainst, extraPoints }: {
  extraWon: number;
  extraDrawn: number;
  extraLost: number;
  extraGoalsFor: number;
  extraGoalsAgainst: number;
  extraPoints: number;
}) {
  const parts: string[] = [];
  if (extraWon)   parts.push(`${extraWon > 0 ? '+' : ''}${extraWon}W`);
  if (extraDrawn) parts.push(`${extraDrawn > 0 ? '+' : ''}${extraDrawn}D`);
  if (extraLost)  parts.push(`${extraLost > 0 ? '+' : ''}${extraLost}L`);
  if (extraGoalsFor)  parts.push(`${extraGoalsFor > 0 ? '+' : ''}${extraGoalsFor}GF`);
  if (extraGoalsAgainst) parts.push(`${extraGoalsAgainst > 0 ? '+' : ''}${extraGoalsAgainst}GA`);
  if (extraPoints)    parts.push(`${extraPoints > 0 ? '+' : ''}${extraPoints}Pts`);
  if (parts.length === 0) return null;
  return <div className={`mt-1 text-xs ${ADJ_STYLE}`}>{parts.join(' ')}</div>;
}

export const StandingsTableCard: React.FC<{ table: StandingsTableData }> = ({ table }) => (
  <section aria-label={`${table.league.name} standings`} className="overflow-hidden rounded-xl border border-line shadow-card">
    {/* league header — matches the match-list sections */}
    <div className="flex items-center gap-2 border-b border-line bg-surface2 px-3.5 py-2.5">
      <LeagueEmoji emoji={table.league.emoji} size={22} />
      <span className="truncate text-sm font-bold text-txt">{table.league.name}</span>
      <span className="ml-auto shrink-0 text-2xs font-semibold uppercase tracking-wide text-faint">Table</span>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            <HeadCell className="w-8 pl-3 text-left">#</HeadCell>
            <HeadCell className="text-left">Team</HeadCell>
            <HeadCell>P</HeadCell>
            <HeadCell className="hidden sm:table-cell">W</HeadCell>
            <HeadCell className="hidden sm:table-cell">D</HeadCell>
            <HeadCell className="hidden sm:table-cell">L</HeadCell>
            <HeadCell className="hidden md:table-cell">GF</HeadCell>
            <HeadCell className="hidden md:table-cell">GA</HeadCell>
            <HeadCell>GD</HeadCell>
            <HeadCell className="pr-3">Pts</HeadCell>
            <HeadCell className="hidden pr-3 lg:table-cell">Form</HeadCell>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {table.rows.map(row => (
            <tr key={row.team} className="transition-colors hover:bg-surface2/60">
              <td className="tnum py-2 pl-3 pr-2 text-center font-bold text-faint">{row.position}</td>
              <td className="max-w-[180px] py-2 pr-2">
                {row.teamId ? (
                  <Link
                    to={`/team/${row.teamId}`}
                    className="focus-ring flex min-w-0 items-center gap-2 rounded transition-colors hover:text-accent"
                  >
                    {row.emoji ? <LeagueEmoji emoji={row.emoji} size={18} /> : <Crest name={row.team} size={18} />}
                    <span className={`truncate font-semibold ${row.points > 0 || row.played > 0 ? 'text-txt' : 'text-muted'}`}>
                      {row.team}
                    </span>
                  </Link>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    {row.emoji ? <LeagueEmoji emoji={row.emoji} size={18} /> : <Crest name={row.team} size={18} />}
                    <span className={`truncate font-semibold ${row.points > 0 || row.played > 0 ? 'text-txt' : 'text-muted'}`}>
                      {row.team}
                    </span>
                  </div>
                )}
              </td>
              <td className="tnum px-2 text-center font-semibold text-muted">{row.played}</td>
              <td className="tnum hidden px-2 text-center text-muted sm:table-cell">{row.won}</td>
              <td className="tnum hidden px-2 text-center text-muted sm:table-cell">{row.drawn}</td>
              <td className="tnum hidden px-2 text-center text-muted sm:table-cell">{row.lost}</td>
              <td className="tnum hidden px-2 text-center text-muted md:table-cell">{row.goalsFor}</td>
              <td className="tnum hidden px-2 text-center text-muted md:table-cell">{row.goalsAgainst}</td>
              <td className="tnum px-2 text-center font-semibold text-muted">
                {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
              </td>
              <td className="tnum px-2 pr-3 text-center font-extrabold text-txt">{row.points}</td>
              <td className="hidden px-2 lg:table-cell">
                <div className="flex justify-end gap-1 pr-1">
                  {row.form.map((f, i) => (
                    <span
                      key={i}
                      className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-extrabold ${FORM_STYLES[f] ?? ''}`}
                      title={f === 'W' ? 'Win' : f === 'D' ? 'Draw' : 'Loss'}
                    >
                      {f}
                    </span>
                  ))}
                </div>
                {/* adjustment bonus line — appears only when at least one bonus is non-zero */}
                {AdjLine({
                  extraWon: row.extraWon ?? 0,
                  extraDrawn: row.extraDrawn ?? 0,
                  extraLost: row.extraLost ?? 0,
                  extraGoalsFor: row.extraGoalsFor ?? 0,
                  extraGoalsAgainst: row.extraGoalsAgainst ?? 0,
                  extraPoints: row.extraPoints ?? 0,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

export default StandingsTableCard;
