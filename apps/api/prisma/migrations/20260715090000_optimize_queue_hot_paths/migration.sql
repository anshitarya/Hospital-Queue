CREATE INDEX "QueueEntry_doctorId_serviceDay_status_idx"
  ON "QueueEntry"("doctorId", "serviceDay", "status");

CREATE INDEX "QueueEntry_doctorId_serviceDay_calledAt_idx"
  ON "QueueEntry"("doctorId", "serviceDay", "calledAt");
