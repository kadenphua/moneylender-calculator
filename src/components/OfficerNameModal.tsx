import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onSubmit: (name: string) => void;
}

export function OfficerNameModal({ open, onSubmit }: Props) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Welcome — please log in</DialogTitle>
          <DialogDescription>
            Enter your name. It is recorded on every calculation as the
            officer's signature in the audit log.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) onSubmit(trimmed);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="officer-name">Officer name</Label>
            <Input
              id="officer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wei Ming"
              autoFocus
              required
              maxLength={80}
            />
          </div>
          <Button type="submit" disabled={!trimmed} className="w-full">
            Continue
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
