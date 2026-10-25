-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'LISTO', 'ERROR');

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDIENTE',
    "result" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_requested_by_created_at_idx" ON "reports"("requested_by", "created_at");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
