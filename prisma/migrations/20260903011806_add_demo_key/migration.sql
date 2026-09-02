-- AlterTable: internal demo-record marker on EmergencyCase (M15)
ALTER TABLE "emergency_cases" ADD COLUMN     "demoKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "emergency_cases_demoKey_key" ON "emergency_cases"("demoKey");
