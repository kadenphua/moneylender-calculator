import { useState } from "react";

import { ModeAFullSettlement } from "@/components/ModeAFullSettlement";
import { ModeBScheduledPayment } from "@/components/ModeBScheduledPayment";
import { Label } from "@/components/ui/label";
import type { CalculationMode, CalculationRecord } from "@/lib/types";

interface Props {
  officerName: string;
  companyName: string;
  onCalculation: (record: CalculationRecord) => void;
}

export function Calculator({
  officerName,
  companyName,
  onCalculation,
}: Props) {
  const [mode, setMode] = useState<CalculationMode>("fullSettlement");

  return (
    <div className="space-y-6">
      <div>
        <Label>Mode</Label>
        <div
          role="group"
          className="mt-2 inline-flex flex-wrap rounded-md border bg-background p-0.5"
        >
          <button
            type="button"
            className={modeButtonClass(mode === "fullSettlement")}
            onClick={() => setMode("fullSettlement")}
          >
            Full Settlement
          </button>
          <button
            type="button"
            className={modeButtonClass(mode === "scheduled")}
            onClick={() => setMode("scheduled")}
          >
            Scheduled Payment (Early)
          </button>
        </div>
      </div>

      {mode === "fullSettlement" ? (
        <ModeAFullSettlement
          key="modeA"
          officerName={officerName}
          companyName={companyName}
          onCalculation={onCalculation}
        />
      ) : (
        <ModeBScheduledPayment
          key="modeB"
          officerName={officerName}
          companyName={companyName}
          onCalculation={onCalculation}
        />
      )}
    </div>
  );
}

function modeButtonClass(active: boolean): string {
  return [
    "px-4 py-2 text-sm font-medium rounded transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted",
  ].join(" ");
}
