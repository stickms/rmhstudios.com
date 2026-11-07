-- AlterTable
ALTER TABLE "notification_preference" ADD COLUMN     "callAnswerMode" VARCHAR(12) NOT NULL DEFAULT 'ring',
ADD COLUMN     "callBusyNote" VARCHAR(200);

