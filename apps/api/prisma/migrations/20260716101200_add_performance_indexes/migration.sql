-- CreateIndex
CREATE INDEX "QueueEntry_doctorId_serviceDay_status_idx" ON "QueueEntry"("doctorId", "serviceDay", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_patientId_joinedAt_idx" ON "QueueEntry"("patientId", "joinedAt");
