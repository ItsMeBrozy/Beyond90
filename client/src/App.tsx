import React, { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { FavoritesProvider } from "./store/FavoritesContext";
import { TopNav, BottomNav } from "./components/navigation/Navigation";
import SearchOverlay from "./components/navigation/SearchOverlay";
import HomePage from "./pages/HomePage";
import StatisticsPage from "./pages/StatisticsPage";
import LeaguesPage from "./pages/LeaguesPage";
import LeagueDetailPage from "./pages/LeagueDetailPage";
import TeamDetailPage from "./pages/TeamDetailPage";
import FavoritesPage from "./pages/FavoritesPage";
import SearchPage from "./pages/SearchPage";
import MatchCenterPage from "./pages/MatchCenterPage";
import NewsPage from "./pages/NewsPage";

type Theme = "dark" | "light";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("beyond90.theme");
    return saved === "light" ? "light" : "dark";
  });
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("beyond90.theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta)
      meta.setAttribute("content", theme === "dark" ? "#080a0f" : "#e9ebf1");
  }, [theme]);
  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );
  return [theme, toggle];
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function Shell() {
  const [theme, toggleTheme] = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);

  // "/" keyboard shortcut for search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA"].includes(target.tagName);
      if (!typing && e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh">
      <TopNav
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <main
        className="mx-auto w-full max-w-7xl px-3 pb-24 pt-4 sm:px-5 md:pb-10"
        id="content"
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/matches" element={<Navigate to="/" replace />} />
          <Route path="/leagues" element={<LeaguesPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/league/:id" element={<LeagueDetailPage />} />
          <Route path="/team/:id" element={<TeamDetailPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/match/:id" element={<MatchCenterPage />} />
          <Route
            path="*"
            element={
              <p className="py-20 text-center text-sm text-muted">
                Page not found — head back to Home.
              </p>
            }
          />
        </Routes>
      </main>
      <BottomNav onOpenSearch={() => setSearchOpen(true)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

const App: React.FC = () => (
  <BrowserRouter>
    <FavoritesProvider>
      <ScrollToTop />
      <Shell />
    </FavoritesProvider>
  </BrowserRouter>
);

export default App;
