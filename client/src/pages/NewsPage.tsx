import React from "react";
import { Newspaper, RefreshCw } from "lucide-react";
import { api, parseNewsImages } from "../services/api";
import { useAsync } from "../hooks/useAsync";
import { usePolling, useLiveReload } from "../lib/live";
import { timeAgo } from "../lib/format";
import { EmptyState, LeagueEmoji } from "../components/ui/primitives";
import { ListSkeleton } from "../components/ui/skeletons";
import { DiscordText } from "../components/news/DiscordText";
import { News } from "../types";

const NewsCard: React.FC<{ post: News }> = ({ post }) => {
  const images = parseNewsImages(post.images);
  return (
    <article className="card flex flex-col gap-3 p-4">
      <header className="flex items-center gap-2.5">
        {post.league && <LeagueEmoji emoji={post.league.emoji} size={22} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-txt">
            {post.league?.name ?? "News"}
          </p>
          <p className="text-2xs font-medium text-faint">
            {post.author ? `${post.author} · ` : ""}
            {timeAgo(post.createdAt)}
          </p>
        </div>
      </header>

      <DiscordText content={post.content} />

      {images.length > 0 && (
        <div
          className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
        >
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              loading="lazy"
              className="max-h-96 w-full rounded-lg border border-line object-cover"
            />
          ))}
        </div>
      )}
    </article>
  );
};

const NewsPage: React.FC = () => {
  const { data, loading, error, reload } = useAsync(() => api.getNews(), []);
  usePolling(reload, 60000);
  useLiveReload(reload);

  const posts = data ?? [];

  return (
    <div className="flex flex-col gap-5 animate-fadeUp">
      <header className="flex items-center justify-between gap-2 px-1">
        <h1 className="text-xl font-extrabold tracking-tight">News</h1>
        <button
          type="button"
          onClick={reload}
          className="press focus-ring flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-txt"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </header>

      {error && (
        <EmptyState
          icon={<Newspaper size={28} />}
          title="Could not load news"
          hint={error.message}
        >
          <button
            type="button"
            onClick={reload}
            className="press focus-ring chip bg-accent/15 font-bold text-accent"
          >
            Retry
          </button>
        </EmptyState>
      )}

      {loading && !data && <ListSkeleton count={3} />}

      {!error && !loading && posts.length === 0 && (
        <EmptyState
          icon={<Newspaper size={28} />}
          title="No news yet"
          hint="Post one on Discord with /news [league]."
        />
      )}

      <div className="flex flex-col divide-y divide-line">
        {posts.map((post) => (
          <div key={post.id} className="py-3 first:pt-0">
            <NewsCard post={post} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewsPage;
