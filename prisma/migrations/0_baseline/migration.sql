-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SSLobbyStatus" AS ENUM ('WAITING', 'IN_MATCH', 'CLOSED');

-- CreateEnum
CREATE TYPE "SSMatchStatus" AS ENUM ('RUNNING', 'FINISHED');

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('STAGING', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "DmPrivacy" AS ENUM ('EVERYONE', 'FOLLOWERS', 'NONE');

-- CreateEnum
CREATE TYPE "BuildVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "username" TEXT,
    "handle" TEXT,
    "handleChangedAt" TIMESTAMP(3),
    "email" TEXT,
    "emailVerified" BOOLEAN,
    "password" TEXT,
    "image" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT,
    "tags" TEXT[],
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltairPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "bestTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalKills" INTEGER NOT NULL DEFAULT 0,
    "totalXP" INTEGER NOT NULL DEFAULT 0,
    "totalGold" INTEGER NOT NULL DEFAULT 0,
    "totalTimeSurvived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "AltairPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaundryPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "LaundryPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lights_out_score" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "moves" INTEGER NOT NULL DEFAULT 0,
    "hintUsed" BOOLEAN NOT NULL DEFAULT false,
    "dnf" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lights_out_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VegaPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "highestLoop" INTEGER NOT NULL DEFAULT 1,
    "highestLevel" INTEGER NOT NULL DEFAULT 1,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "VegaPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalForgePlayer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "floorReached" INTEGER NOT NULL DEFAULT 1,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "savedRunState" JSONB,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "SignalForgePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temple_of_joy_save" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saveData" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temple_of_joy_save_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeonDriftwayPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "bestDistance" INTEGER NOT NULL DEFAULT 0,
    "bestTimeMs" INTEGER NOT NULL DEFAULT 0,
    "bestLevel" INTEGER NOT NULL DEFAULT 1,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "NeonDriftwayPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoidBreakerPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "bestWave" INTEGER NOT NULL DEFAULT 0,
    "totalKills" INTEGER NOT NULL DEFAULT 0,
    "bestTimeMs" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "VoidBreakerPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Song" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "description" TEXT,
    "duration" DOUBLE PRECISION NOT NULL,
    "bpm" DOUBLE PRECISION,
    "audioUrl" TEXT NOT NULL,
    "coverUrl" TEXT,
    "fileSizeBytes" INTEGER,
    "analysisData" JSONB,
    "uploadedBy" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongLike" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongRating" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongComment" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongLeaderboard" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "maxCombo" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speedMod" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "modifiers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongLeaderboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongPlay" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastPlayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongPlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synapse_storm_player" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "puzzlesSolved" INTEGER NOT NULL DEFAULT 0,
    "maxCombo" INTEGER NOT NULL DEFAULT 0,
    "peakDifficulty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "totalTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "synapse_storm_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ss_lobby" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "SSLobbyStatus" NOT NULL DEFAULT 'WAITING',
    "hostUserId" TEXT NOT NULL,

    CONSTRAINT "ss_lobby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ss_lobby_member" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "isHost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ss_lobby_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ss_match" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" "SSMatchStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ss_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ss_player_match" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxCombo" INTEGER NOT NULL DEFAULT 0,
    "puzzlesSolved" INTEGER NOT NULL DEFAULT 0,
    "puzzlesMissed" INTEGER NOT NULL DEFAULT 0,
    "finishedAt" TIMESTAMP(3),
    "lastUpdateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ss_player_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhbox_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalGamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "totalWins" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "totalPlayTimeMs" INTEGER NOT NULL DEFAULT 0,
    "minigameStats" JSONB NOT NULL DEFAULT '{}',
    "currentWinStreak" INTEGER NOT NULL DEFAULT 0,
    "bestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhbox_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhbox_match" (
    "id" TEXT NOT NULL,
    "minigameId" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "winnerUserId" TEXT,
    "playerCount" INTEGER NOT NULL,
    "gameLog" JSONB,
    "results" JSONB NOT NULL,

    CONSTRAINT "rmhbox_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhbox_match_player" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "wasWinner" BOOLEAN NOT NULL DEFAULT false,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhbox_match_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_room" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "hostId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "password" TEXT,
    "maxMembers" INTEGER NOT NULL DEFAULT 20,
    "allowMemberQueue" BOOLEAN NOT NULL DEFAULT true,
    "allowMemberSkip" BOOLEAN NOT NULL DEFAULT true,
    "autoPlay" BOOLEAN NOT NULL DEFAULT true,
    "scheduledFor" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "rmhtube_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_room_member" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "rmhtube_room_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_chat_message" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtube_chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_queue_item" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration" INTEGER,
    "thumbnailUrl" TEXT,
    "addedById" TEXT NOT NULL,
    "addedByName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtube_queue_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_playlist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhtube_playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_playlist_item" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration" INTEGER,
    "thumbnailUrl" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "rmhtube_playlist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_user_stats" (
    "userId" TEXT NOT NULL,
    "totalWatchTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "videosWatched" INTEGER NOT NULL DEFAULT 0,
    "roomsCreated" INTEGER NOT NULL DEFAULT 0,
    "roomsJoined" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "reactionsUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhtube_user_stats_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "rmhtype_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "totalGamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "totalWins" INTEGER NOT NULL DEFAULT 0,
    "bestWpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestWpmAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgWpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCharsTyped" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhtype_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtype_match" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "passageLength" TEXT NOT NULL,
    "rounds" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "winnerUserId" TEXT,
    "playerCount" INTEGER NOT NULL,
    "isSolo" BOOLEAN NOT NULL DEFAULT false,
    "results" JSONB NOT NULL,

    CONSTRAINT "rmhtype_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtype_match_player" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "wasWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtype_match_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhstudy_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalFocusTimeMs" BIGINT NOT NULL DEFAULT 0,
    "sessionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastStudyDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhstudy_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhstudy_session" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT,
    "focusTimeMs" INTEGER NOT NULL,
    "breakTimeMs" INTEGER NOT NULL,
    "sessionsInRun" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "rmhstudy_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versecraft_save" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saveData" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versecraft_save_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versecraft_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedChapters" JSONB NOT NULL DEFAULT '[]',
    "unlockedEndings" JSONB NOT NULL DEFAULT '[]',
    "completedRoutes" JSONB NOT NULL DEFAULT '[]',
    "totalPoemsWritten" INTEGER NOT NULL DEFAULT 0,
    "totalPlaytime" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versecraft_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forest_explorer_save" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saveData" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forest_explorer_save_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "altair_meta_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "upgrades" JSONB NOT NULL DEFAULT '{}',
    "unlockedClasses" JSONB NOT NULL DEFAULT '["knight","arcanist","ranger"]',
    "doubleTimeUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "classFirstClears" JSONB NOT NULL DEFAULT '[]',
    "totalRunsPlayed" INTEGER NOT NULL DEFAULT 0,
    "bestTimeSurvived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestKills" INTEGER NOT NULL DEFAULT 0,
    "bossesDefeated" JSONB NOT NULL DEFAULT '[]',
    "bestiary" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "altair_meta_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "altair_coop_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalCoopRuns" INTEGER NOT NULL DEFAULT 0,
    "totalCoopWins" INTEGER NOT NULL DEFAULT 0,
    "totalRevivesGiven" INTEGER NOT NULL DEFAULT 0,
    "totalRevivesReceived" INTEGER NOT NULL DEFAULT 0,
    "totalCoopKills" INTEGER NOT NULL DEFAULT 0,
    "totalCoopCoins" INTEGER NOT NULL DEFAULT 0,
    "favoriteClassId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "altair_coop_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "altair_match" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "playerCount" INTEGER NOT NULL,
    "doubleTime" BOOLEAN NOT NULL DEFAULT false,
    "victory" BOOLEAN NOT NULL DEFAULT false,
    "sharedKills" INTEGER NOT NULL DEFAULT 0,
    "bossesDefeated" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "results" JSONB,

    CONSTRAINT "altair_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "altair_match_player" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "finalLevel" INTEGER NOT NULL DEFAULT 1,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "timeSurvived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wasDowned" BOOLEAN NOT NULL DEFAULT false,
    "wasRevived" BOOLEAN NOT NULL DEFAULT false,
    "revivesGiven" INTEGER NOT NULL DEFAULT 0,
    "wasAliveAtEnd" BOOLEAN NOT NULL DEFAULT true,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "altair_match_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "gifUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "originalId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rmheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_like" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_comment" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rmheet_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_comment_like" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_comment_like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_comment_repost" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_comment_repost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_comment_view" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_comment_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_repost" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_repost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_view" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_poll" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "question" VARCHAR(200) NOT NULL,
    "multiSelect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_poll_option" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "text" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "rmheet_poll_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_poll_vote" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_poll_vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" VARCHAR(50),
    "customImage" TEXT,
    "customImageSizeBytes" INTEGER,
    "bio" VARCHAR(160),
    "location" VARCHAR(100),
    "website" VARCHAR(200),
    "showLikes" BOOLEAN NOT NULL DEFAULT false,
    "dmPrivacy" "DmPrivacy" NOT NULL DEFAULT 'EVERYONE',
    "profileSongSpotifyId" VARCHAR(50),
    "profileSongTitle" VARCHAR(200),
    "profileSongArtist" VARCHAR(200),
    "profileSongPreviewUrl" VARCHAR(500),
    "profileSongAlbumArt" VARCHAR(500),
    "coins" INTEGER NOT NULL DEFAULT 10,
    "hasProfilePet" BOOLEAN NOT NULL DEFAULT false,
    "showProfilePet" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sourceTitle" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePublisher" TEXT NOT NULL,
    "sourceDate" TEXT,
    "image" TEXT,
    "discordMessageId" TEXT,
    "status" "NewsStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmh_music_room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "hostId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "password" TEXT,
    "maxMembers" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmh_music_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmh_music_room_member" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "rmh_music_room_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmh_music_queue_item" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "spotifyUri" TEXT NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "artist" VARCHAR(256) NOT NULL,
    "albumArt" VARCHAR(500) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedByName" VARCHAR(50) NOT NULL,
    "position" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmh_music_queue_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmh_music_chat_message" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" VARCHAR(50) NOT NULL,
    "content" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmh_music_chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "participantOneId" TEXT NOT NULL,
    "participantTwoId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhcode_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" VARCHAR(100),
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhcode_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_build" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "readme" TEXT,
    "repoUrl" VARCHAR(500),
    "demoUrl" VARCHAR(500),
    "thumbnailUrl" VARCHAR(500),
    "visibility" "BuildVisibility" NOT NULL DEFAULT 'PUBLIC',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "isCurated" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "technologies" JSONB NOT NULL DEFAULT '[]',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "categoryId" TEXT,

    CONSTRAINT "user_build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_version" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "changelog" TEXT,
    "commitHash" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_category" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "description" VARCHAR(200),
    "iconName" VARCHAR(50),
    "color" VARCHAR(50),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "build_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_tag" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "name" VARCHAR(30) NOT NULL,

    CONSTRAINT "build_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_like" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_comment" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "build_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_view" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "userId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DreamRiftPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "highScoreEasy" INTEGER NOT NULL DEFAULT 0,
    "highScoreNormal" INTEGER NOT NULL DEFAULT 0,
    "highScoreHard" INTEGER NOT NULL DEFAULT 0,
    "highScoreLunatic" INTEGER NOT NULL DEFAULT 0,
    "bestStage" INTEGER NOT NULL DEFAULT 1,
    "character" TEXT NOT NULL DEFAULT 'rei',
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "totalGraze" INTEGER NOT NULL DEFAULT 0,
    "spellsCaptured" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "DreamRiftPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_handle_key" ON "user"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "blog_post_slug_key" ON "blog_post"("slug");

-- CreateIndex
CREATE INDEX "blog_post_date_idx" ON "blog_post"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AltairPlayer_username_key" ON "AltairPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AltairPlayer_userId_key" ON "AltairPlayer"("userId");

-- CreateIndex
CREATE INDEX "idx_altair_best_time" ON "AltairPlayer"("bestTime" DESC);

-- CreateIndex
CREATE INDEX "idx_altair_kills" ON "AltairPlayer"("totalKills" DESC);

-- CreateIndex
CREATE INDEX "idx_altair_xp" ON "AltairPlayer"("totalXP" DESC);

-- CreateIndex
CREATE INDEX "idx_altair_gold" ON "AltairPlayer"("totalGold" DESC);

-- CreateIndex
CREATE INDEX "idx_altair_survival" ON "AltairPlayer"("totalTimeSurvived" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LaundryPlayer_username_key" ON "LaundryPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "LaundryPlayer_userId_key" ON "LaundryPlayer"("userId");

-- CreateIndex
CREATE INDEX "idx_laundry_high_score" ON "LaundryPlayer"("highScore" DESC);

-- CreateIndex
CREATE INDEX "lights_out_score_dateKey_moves_idx" ON "lights_out_score"("dateKey", "moves" ASC);

-- CreateIndex
CREATE INDEX "lights_out_score_dateKey_dnf_idx" ON "lights_out_score"("dateKey", "dnf" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "lights_out_score_userId_dateKey_key" ON "lights_out_score"("userId", "dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "Player_username_key" ON "Player"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VegaPlayer_username_key" ON "VegaPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "VegaPlayer_userId_key" ON "VegaPlayer"("userId");

-- CreateIndex
CREATE INDEX "idx_vega_loop" ON "VegaPlayer"("highestLoop" DESC);

-- CreateIndex
CREATE INDEX "idx_vega_level" ON "VegaPlayer"("highestLevel" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SignalForgePlayer_username_key" ON "SignalForgePlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "SignalForgePlayer_userId_key" ON "SignalForgePlayer"("userId");

-- CreateIndex
CREATE INDEX "idx_signal_forge_high_score" ON "SignalForgePlayer"("highScore" DESC);

-- CreateIndex
CREATE INDEX "idx_signal_forge_floor" ON "SignalForgePlayer"("floorReached" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "temple_of_joy_save_userId_key" ON "temple_of_joy_save"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NeonDriftwayPlayer_username_key" ON "NeonDriftwayPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "NeonDriftwayPlayer_userId_key" ON "NeonDriftwayPlayer"("userId");

-- CreateIndex
CREATE INDEX "idx_neon_driftway_high_score" ON "NeonDriftwayPlayer"("highScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "VoidBreakerPlayer_username_key" ON "VoidBreakerPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "VoidBreakerPlayer_userId_key" ON "VoidBreakerPlayer"("userId");

-- CreateIndex
CREATE INDEX "idx_void_breaker_high_score" ON "VoidBreakerPlayer"("highScore" DESC);

-- CreateIndex
CREATE INDEX "Song_title_idx" ON "Song"("title");

-- CreateIndex
CREATE INDEX "Song_artist_idx" ON "Song"("artist");

-- CreateIndex
CREATE INDEX "Song_uploadedBy_idx" ON "Song"("uploadedBy");

-- CreateIndex
CREATE UNIQUE INDEX "SongLike_songId_userId_key" ON "SongLike"("songId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SongRating_songId_userId_key" ON "SongRating"("songId", "userId");

-- CreateIndex
CREATE INDEX "SongLeaderboard_songId_score_idx" ON "SongLeaderboard"("songId", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SongLeaderboard_songId_userId_key" ON "SongLeaderboard"("songId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SongPlay_songId_userId_key" ON "SongPlay"("songId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "synapse_storm_player_userId_key" ON "synapse_storm_player"("userId");

-- CreateIndex
CREATE INDEX "synapse_storm_player_highScore_idx" ON "synapse_storm_player"("highScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ss_lobby_code_key" ON "ss_lobby"("code");

-- CreateIndex
CREATE INDEX "ss_lobby_member_lobbyId_idx" ON "ss_lobby_member"("lobbyId");

-- CreateIndex
CREATE UNIQUE INDEX "ss_lobby_member_lobbyId_userId_key" ON "ss_lobby_member"("lobbyId", "userId");

-- CreateIndex
CREATE INDEX "ss_match_lobbyId_idx" ON "ss_match"("lobbyId");

-- CreateIndex
CREATE INDEX "ss_player_match_matchId_idx" ON "ss_player_match"("matchId");

-- CreateIndex
CREATE INDEX "ss_player_match_lobbyId_idx" ON "ss_player_match"("lobbyId");

-- CreateIndex
CREATE UNIQUE INDEX "ss_player_match_matchId_userId_key" ON "ss_player_match"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "rmhbox_profile_userId_key" ON "rmhbox_profile"("userId");

-- CreateIndex
CREATE INDEX "rmhbox_profile_totalWins_idx" ON "rmhbox_profile"("totalWins" DESC);

-- CreateIndex
CREATE INDEX "rmhbox_profile_totalScore_idx" ON "rmhbox_profile"("totalScore" DESC);

-- CreateIndex
CREATE INDEX "rmhbox_match_minigameId_idx" ON "rmhbox_match"("minigameId");

-- CreateIndex
CREATE INDEX "rmhbox_match_startedAt_idx" ON "rmhbox_match"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "rmhbox_match_lobbyId_idx" ON "rmhbox_match"("lobbyId");

-- CreateIndex
CREATE INDEX "rmhbox_match_player_profileId_idx" ON "rmhbox_match_player"("profileId");

-- CreateIndex
CREATE INDEX "rmhbox_match_player_userId_idx" ON "rmhbox_match_player"("userId");

-- CreateIndex
CREATE INDEX "rmhbox_match_player_createdAt_idx" ON "rmhbox_match_player"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmhbox_match_player_matchId_userId_key" ON "rmhbox_match_player"("matchId", "userId");

-- CreateIndex
CREATE INDEX "rmhtube_room_isPublic_closedAt_idx" ON "rmhtube_room"("isPublic", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rmhtube_room_member_roomId_userId_key" ON "rmhtube_room_member"("roomId", "userId");

-- CreateIndex
CREATE INDEX "rmhtube_chat_message_roomId_createdAt_idx" ON "rmhtube_chat_message"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "rmhtube_queue_item_roomId_position_idx" ON "rmhtube_queue_item"("roomId", "position");

-- CreateIndex
CREATE INDEX "rmhtube_playlist_userId_idx" ON "rmhtube_playlist"("userId");

-- CreateIndex
CREATE INDEX "rmhtube_playlist_item_playlistId_position_idx" ON "rmhtube_playlist_item"("playlistId", "position");

-- CreateIndex
CREATE INDEX "rmhtype_profile_difficulty_bestWpm_idx" ON "rmhtype_profile"("difficulty", "bestWpm" DESC);

-- CreateIndex
CREATE INDEX "rmhtype_profile_totalWins_idx" ON "rmhtype_profile"("totalWins" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmhtype_profile_userId_difficulty_key" ON "rmhtype_profile"("userId", "difficulty");

-- CreateIndex
CREATE INDEX "rmhtype_match_startedAt_idx" ON "rmhtype_match"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "rmhtype_match_winnerUserId_idx" ON "rmhtype_match"("winnerUserId");

-- CreateIndex
CREATE INDEX "rmhtype_match_player_profileId_idx" ON "rmhtype_match_player"("profileId");

-- CreateIndex
CREATE INDEX "rmhtype_match_player_userId_idx" ON "rmhtype_match_player"("userId");

-- CreateIndex
CREATE INDEX "rmhtype_match_player_wpm_idx" ON "rmhtype_match_player"("wpm" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmhtype_match_player_matchId_userId_key" ON "rmhtype_match_player"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "rmhstudy_profile_userId_key" ON "rmhstudy_profile"("userId");

-- CreateIndex
CREATE INDEX "rmhstudy_profile_totalFocusTimeMs_idx" ON "rmhstudy_profile"("totalFocusTimeMs" DESC);

-- CreateIndex
CREATE INDEX "rmhstudy_profile_sessionsCompleted_idx" ON "rmhstudy_profile"("sessionsCompleted" DESC);

-- CreateIndex
CREATE INDEX "rmhstudy_profile_currentStreak_idx" ON "rmhstudy_profile"("currentStreak" DESC);

-- CreateIndex
CREATE INDEX "rmhstudy_session_profileId_idx" ON "rmhstudy_session"("profileId");

-- CreateIndex
CREATE INDEX "rmhstudy_session_userId_idx" ON "rmhstudy_session"("userId");

-- CreateIndex
CREATE INDEX "rmhstudy_session_startedAt_idx" ON "rmhstudy_session"("startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "versecraft_save_userId_key" ON "versecraft_save"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "versecraft_progress_userId_key" ON "versecraft_progress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "forest_explorer_save_userId_key" ON "forest_explorer_save"("userId");

-- CreateIndex
CREATE INDEX "feedback_userId_idx" ON "feedback"("userId");

-- CreateIndex
CREATE INDEX "feedback_createdAt_idx" ON "feedback"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "altair_meta_progress_userId_key" ON "altair_meta_progress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "altair_coop_profile_userId_key" ON "altair_coop_profile"("userId");

-- CreateIndex
CREATE INDEX "altair_coop_profile_totalCoopWins_idx" ON "altair_coop_profile"("totalCoopWins" DESC);

-- CreateIndex
CREATE INDEX "altair_coop_profile_totalRevivesGiven_idx" ON "altair_coop_profile"("totalRevivesGiven" DESC);

-- CreateIndex
CREATE INDEX "altair_match_startedAt_idx" ON "altair_match"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "altair_match_lobbyId_idx" ON "altair_match"("lobbyId");

-- CreateIndex
CREATE INDEX "altair_match_player_userId_idx" ON "altair_match_player"("userId");

-- CreateIndex
CREATE INDEX "altair_match_player_createdAt_idx" ON "altair_match_player"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "altair_match_player_matchId_userId_key" ON "altair_match_player"("matchId", "userId");

-- CreateIndex
CREATE INDEX "rmheet_userId_idx" ON "rmheet"("userId");

-- CreateIndex
CREATE INDEX "rmheet_createdAt_idx" ON "rmheet"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_like_rmheetId_userId_key" ON "rmheet_like"("rmheetId", "userId");

-- CreateIndex
CREATE INDEX "rmheet_comment_rmheetId_createdAt_idx" ON "rmheet_comment"("rmheetId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_comment_like_commentId_userId_key" ON "rmheet_comment_like"("commentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_comment_repost_commentId_userId_key" ON "rmheet_comment_repost"("commentId", "userId");

-- CreateIndex
CREATE INDEX "rmheet_comment_view_commentId_idx" ON "rmheet_comment_view"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_comment_view_commentId_userId_key" ON "rmheet_comment_view"("commentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_comment_view_commentId_ipHash_key" ON "rmheet_comment_view"("commentId", "ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_repost_rmheetId_userId_key" ON "rmheet_repost"("rmheetId", "userId");

-- CreateIndex
CREATE INDEX "rmheet_view_rmheetId_idx" ON "rmheet_view"("rmheetId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_view_rmheetId_userId_key" ON "rmheet_view"("rmheetId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_view_rmheetId_ipHash_key" ON "rmheet_view"("rmheetId", "ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_poll_rmheetId_key" ON "rmheet_poll"("rmheetId");

-- CreateIndex
CREATE INDEX "rmheet_poll_option_pollId_idx" ON "rmheet_poll_option"("pollId");

-- CreateIndex
CREATE INDEX "rmheet_poll_vote_optionId_idx" ON "rmheet_poll_vote"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_poll_vote_optionId_userId_key" ON "rmheet_poll_vote"("optionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profile_userId_key" ON "user_profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "news_article_slug_key" ON "news_article"("slug");

-- CreateIndex
CREATE INDEX "news_article_status_date_idx" ON "news_article"("status", "date" DESC);

-- CreateIndex
CREATE INDEX "news_article_category_idx" ON "news_article"("category");

-- CreateIndex
CREATE INDEX "news_article_slug_idx" ON "news_article"("slug");

-- CreateIndex
CREATE INDEX "follow_followerId_idx" ON "follow"("followerId");

-- CreateIndex
CREATE INDEX "follow_followingId_idx" ON "follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "follow_followerId_followingId_key" ON "follow"("followerId", "followingId");

-- CreateIndex
CREATE UNIQUE INDEX "rmh_music_room_code_key" ON "rmh_music_room"("code");

-- CreateIndex
CREATE INDEX "rmh_music_room_isPublic_createdAt_idx" ON "rmh_music_room"("isPublic", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmh_music_room_member_roomId_userId_key" ON "rmh_music_room_member"("roomId", "userId");

-- CreateIndex
CREATE INDEX "rmh_music_queue_item_roomId_position_idx" ON "rmh_music_queue_item"("roomId", "position");

-- CreateIndex
CREATE INDEX "rmh_music_chat_message_roomId_createdAt_idx" ON "rmh_music_chat_message"("roomId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "conversation_participantOneId_lastMessageAt_idx" ON "conversation"("participantOneId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "conversation_participantTwoId_lastMessageAt_idx" ON "conversation"("participantTwoId", "lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participantOneId_participantTwoId_key" ON "conversation"("participantOneId", "participantTwoId");

-- CreateIndex
CREATE INDEX "direct_message_conversationId_createdAt_idx" ON "direct_message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "direct_message_senderId_idx" ON "direct_message"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "rmhcode_token_token_key" ON "rmhcode_token"("token");

-- CreateIndex
CREATE INDEX "rmhcode_token_userId_idx" ON "rmhcode_token"("userId");

-- CreateIndex
CREATE INDEX "rmhcode_token_token_idx" ON "rmhcode_token"("token");

-- CreateIndex
CREATE UNIQUE INDEX "user_build_slug_key" ON "user_build"("slug");

-- CreateIndex
CREATE INDEX "user_build_userId_idx" ON "user_build"("userId");

-- CreateIndex
CREATE INDEX "user_build_visibility_publishedAt_idx" ON "user_build"("visibility", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "user_build_slug_idx" ON "user_build"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "build_version_buildId_version_key" ON "build_version"("buildId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "build_category_name_key" ON "build_category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "build_category_slug_key" ON "build_category"("slug");

-- CreateIndex
CREATE INDEX "build_tag_name_idx" ON "build_tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "build_tag_buildId_name_key" ON "build_tag"("buildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "build_like_buildId_userId_key" ON "build_like"("buildId", "userId");

-- CreateIndex
CREATE INDEX "build_comment_buildId_createdAt_idx" ON "build_comment"("buildId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "build_view_buildId_userId_key" ON "build_view"("buildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "build_view_buildId_ipHash_key" ON "build_view"("buildId", "ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "DreamRiftPlayer_username_key" ON "DreamRiftPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "DreamRiftPlayer_userId_key" ON "DreamRiftPlayer"("userId");

-- CreateIndex
CREATE INDEX "idx_dream_rift_high_score" ON "DreamRiftPlayer"("highScoreNormal" DESC);

-- CreateIndex
CREATE INDEX "idx_dream_rift_best_stage" ON "DreamRiftPlayer"("bestStage" DESC);

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltairPlayer" ADD CONSTRAINT "AltairPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryPlayer" ADD CONSTRAINT "LaundryPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lights_out_score" ADD CONSTRAINT "lights_out_score_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VegaPlayer" ADD CONSTRAINT "VegaPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalForgePlayer" ADD CONSTRAINT "SignalForgePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temple_of_joy_save" ADD CONSTRAINT "temple_of_joy_save_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeonDriftwayPlayer" ADD CONSTRAINT "NeonDriftwayPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoidBreakerPlayer" ADD CONSTRAINT "VoidBreakerPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongLike" ADD CONSTRAINT "SongLike_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongLike" ADD CONSTRAINT "SongLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongRating" ADD CONSTRAINT "SongRating_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongRating" ADD CONSTRAINT "SongRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongComment" ADD CONSTRAINT "SongComment_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongComment" ADD CONSTRAINT "SongComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongLeaderboard" ADD CONSTRAINT "SongLeaderboard_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongLeaderboard" ADD CONSTRAINT "SongLeaderboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongPlay" ADD CONSTRAINT "SongPlay_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongPlay" ADD CONSTRAINT "SongPlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synapse_storm_player" ADD CONSTRAINT "synapse_storm_player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ss_lobby_member" ADD CONSTRAINT "ss_lobby_member_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "ss_lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ss_match" ADD CONSTRAINT "ss_match_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "ss_lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ss_player_match" ADD CONSTRAINT "ss_player_match_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "ss_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhbox_profile" ADD CONSTRAINT "rmhbox_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhbox_match_player" ADD CONSTRAINT "rmhbox_match_player_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "rmhbox_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhbox_match_player" ADD CONSTRAINT "rmhbox_match_player_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "rmhbox_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_room" ADD CONSTRAINT "rmhtube_room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_room_member" ADD CONSTRAINT "rmhtube_room_member_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmhtube_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_room_member" ADD CONSTRAINT "rmhtube_room_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_chat_message" ADD CONSTRAINT "rmhtube_chat_message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmhtube_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_chat_message" ADD CONSTRAINT "rmhtube_chat_message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "rmhtube_chat_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_queue_item" ADD CONSTRAINT "rmhtube_queue_item_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmhtube_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_queue_item" ADD CONSTRAINT "rmhtube_queue_item_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_playlist" ADD CONSTRAINT "rmhtube_playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_playlist_item" ADD CONSTRAINT "rmhtube_playlist_item_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "rmhtube_playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_user_stats" ADD CONSTRAINT "rmhtube_user_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtype_profile" ADD CONSTRAINT "rmhtype_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtype_match_player" ADD CONSTRAINT "rmhtype_match_player_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "rmhtype_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtype_match_player" ADD CONSTRAINT "rmhtype_match_player_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "rmhtype_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhstudy_profile" ADD CONSTRAINT "rmhstudy_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhstudy_session" ADD CONSTRAINT "rmhstudy_session_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "rmhstudy_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versecraft_save" ADD CONSTRAINT "versecraft_save_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versecraft_progress" ADD CONSTRAINT "versecraft_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forest_explorer_save" ADD CONSTRAINT "forest_explorer_save_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "altair_meta_progress" ADD CONSTRAINT "altair_meta_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "altair_coop_profile" ADD CONSTRAINT "altair_coop_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "altair_match_player" ADD CONSTRAINT "altair_match_player_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "altair_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "altair_match_player" ADD CONSTRAINT "altair_match_player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet" ADD CONSTRAINT "rmheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet" ADD CONSTRAINT "rmheet_originalId_fkey" FOREIGN KEY ("originalId") REFERENCES "rmheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_like" ADD CONSTRAINT "rmheet_like_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_like" ADD CONSTRAINT "rmheet_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment" ADD CONSTRAINT "rmheet_comment_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment" ADD CONSTRAINT "rmheet_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment" ADD CONSTRAINT "rmheet_comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "rmheet_comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment_like" ADD CONSTRAINT "rmheet_comment_like_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "rmheet_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment_like" ADD CONSTRAINT "rmheet_comment_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment_repost" ADD CONSTRAINT "rmheet_comment_repost_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "rmheet_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment_repost" ADD CONSTRAINT "rmheet_comment_repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment_view" ADD CONSTRAINT "rmheet_comment_view_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "rmheet_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment_view" ADD CONSTRAINT "rmheet_comment_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_repost" ADD CONSTRAINT "rmheet_repost_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_repost" ADD CONSTRAINT "rmheet_repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_view" ADD CONSTRAINT "rmheet_view_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_view" ADD CONSTRAINT "rmheet_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_poll" ADD CONSTRAINT "rmheet_poll_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_poll_option" ADD CONSTRAINT "rmheet_poll_option_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "rmheet_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_poll_vote" ADD CONSTRAINT "rmheet_poll_vote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "rmheet_poll_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_poll_vote" ADD CONSTRAINT "rmheet_poll_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmh_music_room" ADD CONSTRAINT "rmh_music_room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmh_music_room_member" ADD CONSTRAINT "rmh_music_room_member_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmh_music_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmh_music_room_member" ADD CONSTRAINT "rmh_music_room_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmh_music_queue_item" ADD CONSTRAINT "rmh_music_queue_item_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmh_music_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmh_music_queue_item" ADD CONSTRAINT "rmh_music_queue_item_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmh_music_chat_message" ADD CONSTRAINT "rmh_music_chat_message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmh_music_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmh_music_chat_message" ADD CONSTRAINT "rmh_music_chat_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_participantOneId_fkey" FOREIGN KEY ("participantOneId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_participantTwoId_fkey" FOREIGN KEY ("participantTwoId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhcode_token" ADD CONSTRAINT "rmhcode_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_build" ADD CONSTRAINT "user_build_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_build" ADD CONSTRAINT "user_build_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "build_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_version" ADD CONSTRAINT "build_version_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_tag" ADD CONSTRAINT "build_tag_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_like" ADD CONSTRAINT "build_like_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_like" ADD CONSTRAINT "build_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_comment" ADD CONSTRAINT "build_comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "build_comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_comment" ADD CONSTRAINT "build_comment_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_comment" ADD CONSTRAINT "build_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_view" ADD CONSTRAINT "build_view_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_view" ADD CONSTRAINT "build_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DreamRiftPlayer" ADD CONSTRAINT "DreamRiftPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

