-- CreateTable
CREATE TABLE "StandingAdjust" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leagueId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "extraWon" INTEGER NOT NULL DEFAULT 0,
    "extraDrawn" INTEGER NOT NULL DEFAULT 0,
    "extraLost" INTEGER NOT NULL DEFAULT 0,
    "extraGoalsFor" INTEGER NOT NULL DEFAULT 0,
    "extraGoalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "extraPoints" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StandingAdjust_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StandingAdjust_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StandingAdjust_leagueId_teamId_key" ON "StandingAdjust"("leagueId", "teamId");
