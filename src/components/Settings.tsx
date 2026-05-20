import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Download, Trash2, AlertTriangle } from "lucide-react";

import type { CalculationRecord } from "@/lib/types";

interface Props {
  officerName: string;
  setOfficerName: (name: string) => void;
  companyName: string;
  setCompanyName: (name: string) => void;
  records: CalculationRecord[];
  onClearHistory: () => Promise<void>;
}

export function Settings({
  officerName,
  setOfficerName,
  companyName,
  setCompanyName,
  records,
  onClearHistory,
}: Props) {
  const [officerDraft, setOfficerDraft] = useState(officerName);
  const [companyDraft, setCompanyDraft] = useState(companyName);
  const [confirmClear, setConfirmClear] = useState(false);

  function handleExport() {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      calculations: records,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `moneylender-history-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleConfirmedClear() {
    await onClearHistory();
    setConfirmClear(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identity & receipt header</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="officer-name">Officer name</Label>
            <div className="flex gap-2">
              <Input
                id="officer-name"
                value={officerDraft}
                onChange={(e) => setOfficerDraft(e.target.value)}
                maxLength={80}
              />
              <Button
                onClick={() => setOfficerName(officerDraft.trim())}
                disabled={!officerDraft.trim() || officerDraft.trim() === officerName}
              >
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Recorded on every calculation as the audit-log signature.
            </p>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="company-name">Company name (for receipt header)</Label>
            <div className="flex gap-2">
              <Input
                id="company-name"
                value={companyDraft}
                onChange={(e) => setCompanyDraft(e.target.value)}
                maxLength={120}
              />
              <Button
                onClick={() => setCompanyName(companyDraft.trim())}
                disabled={companyDraft.trim() === companyName}
              >
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History export</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Downloads all {records.length} calculation
            {records.length === 1 ? "" : "s"} as a JSON file.
          </p>
          <Button onClick={handleExport} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export history as JSON
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!confirmClear ? (
            <Button
              variant="outline"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear history…
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm">
                This will permanently delete <strong>{records.length}</strong>{" "}
                calculation
                {records.length === 1 ? "" : "s"} from this browser. The audit
                log cannot be recovered. Export first if you want a backup.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="destructive" onClick={handleConfirmedClear}>
                  Yes, delete everything
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
