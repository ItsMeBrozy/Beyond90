import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, MessageCircle, RefreshCw, Table2, Edit, X } from 'lucide-react';
import axios from 'axios';
import { api, leagueSubline } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { usePolling, useLiveReload } from '../lib/live';
import { StandingsTableCard, AdjLine } from '../components/league/StandingsTable';
import { EmptyState, LeagueEmoji } from '../components/ui/primitives';
import { Crest } from '../components/ui/Crest';

// Form styles for league table
const FORM_STYLES: Record<string, string> = {
  W: 'bg-accent/15 text-accent',
  D: 'bg-surface3 text-muted',
  L: 'bg-live/15 text-live',
};
// Manual adjustments layered on top of the auto-computed table
interface StandingAdjust {
  extraWon: number;
  extraDrawn: number;
  extraLost: number;
  extraGoalsFor: number;
  extraGoalsAgainst: number;
  extraPoints: number;
}

// ---------------------------------------------------------------------------
// A single league's page: big logo + name up top, standings table underneath.
// ---------------------------------------------------------------------------

const LeagueDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const leagueId = Number(id);

  const leagues = useAsync(() => api.getLeagues(), []);
  const tables = useAsync(() => api.getStandings(), []);
  usePolling(tables.reload, 60000);
  useLiveReload(() => {
    tables.reload();
    leagues.reload();
  });

  const all = leagues.data ?? [];
  const league = all.find(l => l.id === leagueId);
  const parent = all.find(l => l.id === league?.parentId);
  const children = all.filter(l => l.parentId === leagueId);
  const table = (tables.data ?? []).find(t => t.league.id === leagueId);
  const loading = leagues.loading || tables.loading;
  const error = leagues.error ?? tables.error;

  // --- edit-standings state ---
  const [editOpen, setEditOpen] = React.useState(false);
  const [editTeam, setEditTeam] = React.useState<number | null>(null);
  const [editStats, setEditStats] = React.useState<{
    extraWon: number;
    extraDrawn: number;
    extraLost: number;
    extraGoalsFor: number;
    extraGoalsAgainst: number;
    extraPoints: number;
  }>({
    extraWon: 0,
    extraDrawn: 0,
    extraLost: 0,
    extraGoalsFor: 0,
    extraGoalsAgainst: 0,
    extraPoints: 0,
  });

  // close edit form
  const closeEdit = () => {
    setEditOpen(false);
    setEditTeam(null);
    setEditStats({
      extraWon: 0,
      extraDrawn: 0,
      extraLost: 0,
      extraGoalsFor: 0,
      extraGoalsAgainst: 0,
      extraPoints: 0,
    });
  };

  // apply adjustments via API
  const handleApply = async () => {
    if (editTeam == null) return;
    try {
      const { data } = await axios.put<{ adjust: StandingAdjust }>(`/api/standings/adjust`, {
        leagueId,
        teamId: editTeam,
        ...editStats,
      });
      // update local state immediately so UI reflects the new bonuses
      const row = (tables.data ?? []).find(t => t.league.id === leagueId)?.rows.find(
        r => r.team.toLowerCase() === editTeam.toString().toLowerCase()
      );
      if (row) {
        setEditStats({
          extraWon: data.adjust.extraWon,
          extraDrawn: data.adjust.extraDrawn,
          extraLost: data.adjust.extraLost,
          extraGoalsFor: data.adjust.extraGoalsFor,
          extraGoalsAgainst: data.adjust.extraGoalsAgainst,
          extraPoints: data.adjust.extraPoints,
        });
      }
      // simple inline feedback
      const parts = [
        editStats.extraWon > 0 ? '+' + editStats.extraWon + 'W' : '',
        editStats.extraDrawn > 0 ? '+' + editStats.extraDrawn + 'D' : '',
        editStats.extraLost > 0 ? '+' + editStats.extraLost + 'L' : '',
        editStats.extraGoalsFor > 0 ? '+' + editStats.extraGoalsFor + 'GF' : '',
        editStats.extraGoalsAgainst < 0 ? editStats.extraGoalsAgainst + 'GA' : '',
        editStats.extraPoints > 0 ? '+' + editStats.extraPoints + 'Pts' : '',
      ].filter(Boolean).join(' ');
      window.alert('✅ Manual tweaks saved: ' + (parts || 'no change'));
    } catch (e: any) {
      window.alert('❌ Failed to edit standings: ' + (e?.response?.data?.error ?? e.message ?? 'Unknown error'));
    }
    closeEdit();
  };

  // ---

  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    return (
      <div className="animate-fadeUp">
        <EmptyState icon={<Table2 size={28} />} title="League not found">
          <BackToLeagues />
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-fadeUp">
      <Link
        to="/leagues"
        className="press focus-ring flex w-fit items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-muted transition-colors hover:text-txt"
      >
        <ArrowLeft size={14} /> All leagues
      </Link>

      {error && (
        <EmptyState icon={<MessageCircle size={28} />} title="Could not load this league" hint={error.message}>
          <button type="button" onClick={() => { leagues.reload(); tables.reload(); }} className="press focus-ring chip bg-accent/15 font-bold text-accent">
            Retry
          </button>
        </EmptyState>
      )}

      {loading && !league && (
        <div className="card flex items-center gap-3 p-5">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-surface3" />
          <div className="h-5 w-40 animate-pulse rounded-md bg-surface3" />
        </div>
      )}

      {league && (
        <header className="flex items-center gap-3 px-1">
          <LeagueEmoji emoji={league.emoji} size={34} />
          <div className="min-w-0">
            {parent && (
              <Link
                to={`/league/${parent.id}`}
                className="press focus-ring flex w-fit items-center gap-1 text-2xs font-semibold text-faint transition-colors hover:text-accent"
              >
                Inside
                <LeagueEmoji emoji={parent.emoji} size={11} />
                <span className="truncate">{parent.name}</span>
              </Link>
            )}
            <h1 className="truncate text-xl font-extrabold tracking-tight">{league.name}</h1>
            {leagueSubline(league, all) && <p className="tnum text-xs font-medium text-faint">{leagueSubline(league, all)}</p>}
          </div>
          {/* Edit Standings button — real competitions only, containers have no table */}
          {children.length === 0 && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="press focus-ring ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-transition-colors hover:text-txt"
              title="Edit standings — add bonus W/D/L/GF/GA/Pts on top of tracked matches"
            >
              <Edit size={13} /> Standings
            </button>
          )}
        </header>
      )}

      {editOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl p-6 max-w-md w-full relative">
            <X
              className="absolute top-4 right-4 text-xl cursor-pointer"
              onClick={closeEdit}
            />
            <h2 className="text-lg font-bold mb-4">Edit Standings</h2>
            <p className="text-sm text-muted mb-6">
              Bonus stats added on top of tracked matches. Set to 0 to remove.
            </p>

            <div className="space-y-4">
              {/* Team selector */}
              <div>
                <label className="block text-sm font-medium mb-2">Team</label>
                <select
                  value={editTeam != null ? String(editTeam) : ''}
                  onChange={(e) => setEditTeam(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  disabled={tables.loading}
                >
                  <option value="">— Select a team —</option>
                  {table?.rows.map((row) => (
                    <option key={row.team} value={row.team}>
                      {row.emoji ? (
                        <span className="mr-1">
                          <LeagueEmoji emoji={row.emoji} size={14} />
                        </span>
                      ) : (
                        <Crest name={row.team} size={14} />
                      )}
                      {row.team}
                    </option>
                  ))}
                </select>
                {editTeam == null && <p className="text-xs text-muted mt-1">Select a team to adjust</p>}
              </div>

              {/* Adjustment fields */}
              <div>
                <label className="block text-sm font-medium mb-2">Extra Wins</label>
                <input
                  type="number"
                  value={editStats.extraWon}
                  onChange={(e) =>
                    setEditStats({
                      ...editStats,
                      extraWon: Number(e.target.value),
                    })
                  }
                  min="-999"
                  max="999"
                  step="1"
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. 1 or -1 for deduction"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Extra Draws</label>
                <input
                  type="number"
                  value={editStats.extraDrawn}
                  onChange={(e) =>
                    setEditStats({
                      ...editStats,
                      extraDrawn: Number(e.target.value),
                    })
                  }
                  min="-999"
                  max="999"
                  step="1"
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. 1 or -1 for deduction"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Extra Losses</label>
                <input
                  type="number"
                  value={editStats.extraLost}
                  onChange={(e) =>
                    setEditStats({
                      ...editStats,
                      extraLost: Number(e.target.value),
                    })
                  }
                  min="-999"
                  max="999"
                  step="1"
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. 1 or -1 for deduction"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Extra Goals For</label>
                <input
                  type="number"
                  value={editStats.extraGoalsFor}
                  onChange={(e) =>
                    setEditStats({
                      ...editStats,
                      extraGoalsFor: Number(e.target.value),
                    })
                  }
                  min="-999"
                  max="999"
                  step="1"
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. 3 for +3 GF"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Extra Goals Against</label>
                <input
                  type="number"
                  value={editStats.extraGoalsAgainst}
                  onChange={(e) =>
                    setEditStats({
                      ...editStats,
                      extraGoalsAgainst: Number(e.target.value),
                    })
                  }
                  min="-999"
                  max="999"
                  step="1"
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. -2 for -2 GA (deduction)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Extra Points</label>
                <input
                  type="number"
                  value={editStats.extraPoints}
                  onChange={(e) =>
                    setEditStats({
                      ...editStats,
                      extraPoints: Number(e.target.value),
                    })
                  }
                  min="-999"
                  max="999"
                  step="1"
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. 3 for +3pts or -10 for deduction"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="flex-1 flex rounded border px-4 py-2 text-sm text-muted hover:text-tital transition-colors">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 flex rounded border bg-accent px-4 py-2 text-sm font-semibold text-txt hover:bg-accent/90 transition-colors">
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* container league — holds other leagues, no table of its own */}
      {league && children.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Leagues inside">
          <p className="px-1 text-xs font-medium text-faint">
            This league contains other leagues — open one to see its table.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {children.map(child => (
              <Link
                key={child.id}
                to={`/league/${child.id}`}
                aria-label={`Open ${child.name}`}
                className="press focus-ring card group flex items-center gap-3 p-3.5 transition-all duration-150 hover:border-line2 hover:bg-surface2/60 hover:shadow-pop"
              >
                <LeagueEmoji emoji={child.emoji} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-txt">{child.name}</p>
                  {leagueSubline(child, all) && (
                    <p className="tnum mt-0.5 text-2xs font-medium text-faint">{leagueSubline(child, all)}</p>
                  )}
                </div>
                <ChevronRight size={16} className="shrink-0 text-faint transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ) : (
        /* league table */
        <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-2 py-2 text-center text-2xs font-bold uppercase tracking-wider text-faint">#</th>
              <th scope="col" className="text-left">Team</th>
              <th>P</th>
              <th className="hidden sm:table-cell">W</th>
              <th className="hidden sm:table-cell">D</th>
              <th className="hidden sm:table-cell">L</th>
              <th className="hidden md:table-cell">GF</th>
              <th className="hidden md:table-cell">GA</th>
              <th>GD</th>
              <th className="pr-3">Pts</th>
              <th className="hidden pr-3 lg:table-cell">Form</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {table?.rows.map(row => (
              <tr key={row.team} className="transition-colors hover:bg-surface2/60">
                <td className="tnum py-2 pl-3 pr-2 text-center font-bold text-faint">{row.position}</td>
                <td className="max-w-[180px] py-2 pr-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {row.emoji ? <LeagueEmoji emoji={row.emoji} size={18} /> : <Crest name={row.team} size={18} />}
                    <span className={`truncate font-semibold ${row.points > 0 || row.played > 0 ? 'text-txt' : 'text-muted'}`}>
                      {row.team}
                    </span>
                  </div>
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
            {(!table || table.rows.length === 0) && (
              <tr>
                <td colSpan={12} className="text-center text-muted py-8">
                  No standings yet — add matches with /fixture or teams with /addteam
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
};

const BackToLeagues: React.FC = () => (
  <Link to="/leagues" className="press focus-ring chip bg-accent/15 font-bold text-accent">
    Browse all leagues
  </Link>
);

export default LeagueDetailPage;