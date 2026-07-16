-- CreateIndex
CREATE INDEX "QueueEntry_doctorId_serviceDay_status_idx" ON "QueueEntry"("doctorId", "serviceDay", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_doctorId_status_completedAt_idx" ON "QueueEntry"("doctorId", "status", "completedAt" DESC);
