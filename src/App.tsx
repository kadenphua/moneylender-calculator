import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Calculator } from "@/components/Calculator";
import { History } from "@/components/History";
import { Settings } from "@/components/Settings";
import { OfficerNameModal } from "@/components/OfficerNameModal";
import { PrintReceipt } from "@/components/PrintReceipt";

import { useLocalStorage } from "@/hooks/useLocalStorage";
import { clearCalculations, listCalculations } from "@/lib/db";
import type { CalculationRecord } from "@/lib/types";

export default function App() {
  const [officerName, setOfficerName] = useLocalStorage("officerName", "");
  const [companyName, setCompanyName] = useLocalStorage(
    "companyName",
    "Moneylender",
  );
  const [records, setRecords] = useState<CalculationRecord[]>([]);
  const [currentReceipt, setCurrentReceipt] = useState<CalculationRecord | null>(
    null,
  );

  const refreshRecords = useCallback(async () => {
    const all = await listCalculations();
    setRecords(all);
  }, []);

  useEffect(() => {
    void refreshRecords();
  }, [refreshRecords]);

  const handleCalculation = useCallback(
    (record: CalculationRecord) => {
      setCurrentReceipt(record);
      void refreshRecords();
    },
    [refreshRecords],
  );

  const handleClearHistory = useCallback(async () => {
    await clearCalculations();
    setCurrentReceipt(null);
    await refreshRecords();
  }, [refreshRecords]);

  const officerSet = officerName.trim().length > 0;

  return (
    <>
      <div className="print:hidden min-h-svh bg-background text-foreground">
        <header className="border-b">
          <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">
                Moneylender Payment Calculator
              </h1>
              <p className="text-xs text-muted-foreground">
                Stage 1 — Full Settlement
              </p>
            </div>
            <div className="text-right text-sm">
              <div className="font-medium">{officerName || "—"}</div>
              <div className="text-xs text-muted-foreground">
                {companyName || "Set company in Settings"}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">
          <Tabs defaultValue="calculator">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="calculator">Calculator</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="calculator" className="mt-6">
              <Calculator
                officerName={officerName}
                companyName={companyName}
                onCalculation={handleCalculation}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              <History records={records} />
            </TabsContent>

            <TabsContent value="settings" className="mt-6">
              <Settings
                officerName={officerName}
                setOfficerName={setOfficerName}
                companyName={companyName}
                setCompanyName={setCompanyName}
                records={records}
                onClearHistory={handleClearHistory}
              />
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <OfficerNameModal
        open={!officerSet}
        onSubmit={(name) => setOfficerName(name)}
      />

      {currentReceipt ? <PrintReceipt record={currentReceipt} /> : null}
    </>
  );
}
