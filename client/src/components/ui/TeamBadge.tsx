import React from 'react';
import { useTeamBadges } from '../../hooks/useTeamBadges';
import { Crest } from './Crest';
import { LeagueEmoji } from './primitives';

/**
 * A team's badge: their Discord emoji when the club is registered with one,
 * otherwise the generated initials crest. Use this anywhere a team name is
 * shown so logos stay consistent across the site.
 */
export const TeamBadge: React.FC<{ name: string; size?: number; className?: string; emoji?: string }> = ({
  name,
  size = 24,
  className,
  emoji,
}) => {
  const badgeFor = useTeamBadges();
  const resolved = emoji !== undefined ? emoji : badgeFor(name);
  return resolved ? (
    <LeagueEmoji emoji={resolved} size={size} className={className} />
  ) : (
    <Crest name={name} size={size} className={className} />
  );
};
