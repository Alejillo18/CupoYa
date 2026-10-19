-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('ACTIVO', 'CANCELADO');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "venue" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "total_capacity" INTEGER NOT NULL,
    "available_capacity" INTEGER NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_starts_at_idx" ON "events"("starts_at");
ALTER TABLE "events" ADD CONSTRAINT "events_total_capacity_positive" CHECK ("total_capacity" > 0);
ALTER TABLE "events" ADD CONSTRAINT "events_available_capacity_range"
  CHECK ("available_capacity" >= 0 AND "available_capacity" <= "total_capacity");