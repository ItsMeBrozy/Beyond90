import React from 'react';
import { Star } from 'lucide-react';
import { useFavorites, FavKind } from '../../store/FavoritesContext';

interface FollowButtonProps {
  kind: FavKind;
  id: string;
  size?: 'sm' | 'md';
  withLabel?: boolean;
  /** borderless icon-only style that blends into the surrounding card */
  ghost?: boolean;
  className?: string;
}

export const FollowButton: React.FC<FollowButtonProps> = ({ kind, id, size = 'sm', withLabel = false, ghost = false, className }) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(kind, id);
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const skin = ghost
    ? active
      ? 'border-transparent bg-transparent text-accent'
      : 'border-transparent bg-transparent text-faint hover:text-txt'
    : active
      ? 'border-accent/40 bg-accent/15 text-accent'
      : 'border-line bg-surface2 text-faint hover:text-txt hover:border-line2';
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(kind, id);
      }}
      className={`press focus-ring inline-flex items-center gap-1.5 rounded-lg border transition-colors ${
        skin
      } ${dim} ${withLabel ? 'w-auto px-2.5' : ''} ${className ?? ''}`}
    >
      <Star size={size === 'sm' ? 14 : 16} className={active ? 'fill-current' : ''} />
      {withLabel && <span className="text-xs font-semibold">{active ? 'Following' : 'Follow'}</span>}
    </button>
  );
};
