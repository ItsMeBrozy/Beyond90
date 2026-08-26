-- CreateTable
CREATE TABLE "Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "homeScore" INTEGER DEFAULT 0,
    "awayScore" INTEGER DEFAULT 0
);
