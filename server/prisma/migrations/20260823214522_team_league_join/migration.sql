-- CreateTable
CREATE TABLE "TeamLeague" (
    "teamId" INTEGER NOT NULL,
    "leagueId" INTEGER NOT NULL,

    PRIMARY KEY ("teamId", "leagueId"),
    CONSTRAINT "TeamLeague_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamLeague_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
