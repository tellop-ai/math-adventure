-- CreateTable
CREATE TABLE "players" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "animal" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "sound_on" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "topic_scores" (
    "player_id" INTEGER NOT NULL,
    "owner_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "best_stars" INTEGER NOT NULL DEFAULT 0,
    "best_correct" INTEGER NOT NULL DEFAULT 0,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("player_id", "topic"),
    CONSTRAINT "topic_scores_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "players_by_seat" ON "players"("owner_id", "seat");

-- CreateIndex
CREATE INDEX "topic_scores_by_owner" ON "topic_scores"("owner_id", "player_id");
