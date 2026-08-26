import React, { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, Home, Moon, Search, Settings, Star, Sun, Trophy, UserRound } from 'lucide-react';
import { useFavorites } from '../../store/FavoritesContext';

export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/statistics', label: 'Statistics', icon: BarChart3 },
  { to: '/leagues', label: 'Leagues', icon: Trophy },
  { to: '/favorites', label: 'Favorites', icon: Star },
];

const LogoMark: React.FC<{ size?: number }> = ({ size = 30 }) => (
  <span
    className="relative flex shrink-0 items-center justify-center rounded-[9px] bg-accent font-black text-accent-ink shadow-pop"
    style={{ width: size, height: size, fontSize: size * 0.42 }}
    aria-hidden
  >
    90
    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-surface bg-live" />
  </span>
);

export const BrandWordmark: React.FC = () => (
  <span className="flex items-baseline gap-1 leading-none">
    Beyond
    <span className="font-black text-accent">90</span>
  </span>
);

function usePopover<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const SettingsMenu: React.FC<{ theme: 'dark' | 'light'; onToggleTheme: () => void }> = ({ theme, onToggleTheme }) => {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="press focus-ring rounded-full p-2 text-muted transition-colors hover:bg-surface2 hover:text-txt"
        aria-label="Settings"
      >
        <Settings size={19} />
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden py-1 shadow-pop animate-slideDown">
          <div className="px-3.5 py-2.5">
            <p className="text-sm font-bold">Guest supporter</p>
            <p className="text-2xs text-faint">Favorites are saved in this browser</p>
          </div>
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            onClick={() => {
              onToggleTheme();
              setOpen(false);
            }}
            className="press focus-ring flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-surface2"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            Switch to {theme === 'dark' ? 'light' : 'dark'} mode
          </button>
          <NavLink
            to="/favorites"
            onClick={() => setOpen(false)}
            className="press focus-ring flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-surface2"
          >
            <UserRound size={15} /> My favorites
          </NavLink>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// FotMob-style top bar: brand left, search pill, text tabs, settings gear.
// The only navigation — no sidebar. On small screens the tabs live in the
// bottom nav instead.
// ---------------------------------------------------------------------------

export const TopNav: React.FC<{ theme: 'dark' | 'light'; onToggleTheme: () => void; onOpenSearch: () => void }> = ({
  theme,
  onToggleTheme,
  onOpenSearch,
}) => {
  const { matches } = useFavorites();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:gap-4 sm:px-5">
        <NavLink to="/" className="focus-ring flex shrink-0 items-center gap-2 rounded-lg" aria-label="Beyond90 home">
          <LogoMark size={28} />
          <span className="text-[16px] font-extrabold tracking-tight text-txt">
            <BrandWordmark />
          </span>
        </NavLink>

        <button
          type="button"
          onClick={onOpenSearch}
          className="press focus-ring flex h-10 w-full max-w-md min-w-0 items-center gap-2.5 rounded-full bg-surface3 px-4 text-left text-sm text-faint transition-colors hover:bg-line"
          aria-label="Search"
        >
          <Search size={16} className="shrink-0" />
          <span className="flex-1 truncate">Search</span>
          <kbd className="hidden rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold text-faint sm:block">
            /
          </kbd>
        </button>

        <nav className="ml-auto hidden items-center gap-0.5 md:flex" aria-label="Main navigation">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `press focus-ring rounded-lg px-3 py-2 text-[15px] font-bold transition-colors ${
                  isActive ? 'text-txt' : 'text-muted hover:text-txt'
                }`
              }
            >
              {label}
              {label === 'Favorites' && matches.length > 0 && (
                <span className="tnum ml-1.5 rounded-md bg-surface3 px-1.5 py-0.5 align-middle text-2xs font-bold text-muted">
                  {matches.length}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <SettingsMenu theme={theme} onToggleTheme={onToggleTheme} />
      </div>
    </header>
  );
};

export const BottomNav: React.FC<{ onOpenSearch: () => void }> = ({ onOpenSearch }) => (
  <nav
    className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    aria-label="Bottom navigation"
  >
    <div className="mx-auto grid max-w-md grid-cols-5">
      {NAV_ITEMS.slice(0, 2).map(({ to, label, icon: Icon }) => (
        <NavItemMobile key={to} to={to} label={label} Icon={Icon} end={to === '/'} />
      ))}
      <button
        type="button"
        onClick={onOpenSearch}
        className="press focus-ring flex flex-col items-center justify-center gap-0.5 py-2 text-2xs font-semibold text-muted"
        aria-label="Search"
      >
        <Search size={19} strokeWidth={2.2} />
        Search
      </button>
      {NAV_ITEMS.slice(2).map(({ to, label, icon: Icon }) => (
        <NavItemMobile key={to} to={to} label={label} Icon={Icon} />
      ))}
    </div>
  </nav>
);

const NavItemMobile: React.FC<{ to: string; label: string; Icon: React.ComponentType<any>; end?: boolean }> = ({
  to,
  label,
  Icon,
  end,
}) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `press focus-ring flex flex-col items-center justify-center gap-0.5 py-2 text-2xs font-semibold transition-colors ${
        isActive ? 'text-accent' : 'text-muted hover:text-txt'
      }`
    }
  >
    <Icon size={19} strokeWidth={2.2} />
    {label}
  </NavLink>
);

export { LogoMark };
