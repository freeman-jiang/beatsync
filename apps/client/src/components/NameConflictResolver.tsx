"use client";

import { Button } from "@/components/ui/button";
import { generateNameConflictResolution, NameConflictResolution } from "@/lib/customName";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface NameConflictResolverProps {
  isOpen: boolean;
  onResolve: (newName: string) => void;
  onClose: () => void;
  currentName: string;
  conflictingNames: string[];
}

export const NameConflictResolver = ({
  isOpen,
  onResolve,
  onClose,
  currentName,
  conflictingNames,
}: NameConflictResolverProps) => {
  const [selectedName, setSelectedName] = useState<string>("");
  const [conflictResolution, setConflictResolution] = useState<NameConflictResolution | null>(null);

  useEffect(() => {
    if (isOpen && currentName && conflictingNames.length > 0) {
      const resolution = generateNameConflictResolution(currentName, conflictingNames);
      setConflictResolution(resolution);
      setSelectedName(resolution.autoResolvedName || resolution.suggestedNames[0] || currentName);
    }
  }, [isOpen, currentName, conflictingNames]);

  const handleAcceptSuggestion = () => {
    if (selectedName && selectedName.trim()) {
      onResolve(selectedName.trim());
      toast.success(`Name updated to "${selectedName}"`);
    }
  };


  const handleCustomNameChange = (newName: string) => {
    setSelectedName(newName);
  };

  if (!isOpen || !conflictResolution) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-md w-full"
        >
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Name Already Taken
            </h3>
            <p className="text-sm text-neutral-400">
              The name <span className="text-primary font-medium">&quot;{currentName}&quot;</span> is already in use in this room.
              Please choose a different name:
            </p>
          </div>

          {/* Suggested Names */}
          <div className="space-y-3 mb-6">
            <div className="text-sm font-medium text-neutral-300 mb-2">
              Suggested alternatives:
            </div>
            <div className="grid gap-2">
              {conflictResolution.suggestedNames.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant={selectedName === suggestion ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedName(suggestion)}
                  className="justify-start text-left w-full"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Name Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Or enter your own:
            </label>
            <input
              type="text"
              value={selectedName}
              onChange={(e) => handleCustomNameChange(e.target.value)}
              placeholder="Enter a unique name"
              className="w-full px-3 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded-md text-white placeholder-neutral-500 focus:border-primary/70 focus:outline-none"
              maxLength={50}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleAcceptSuggestion}
              disabled={!selectedName || !selectedName.trim()}
              className="flex-1"
            >
              Use Selected Name
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 pt-4 border-t border-neutral-700">
              <details className="text-xs text-neutral-500">
                <summary className="cursor-pointer">Debug Info</summary>
                <div className="mt-2 space-y-1">
                  <div>Current: {currentName}</div>
                  <div>Conflicts: {conflictingNames.join(", ")}</div>
                  <div>Suggestions: {conflictResolution.suggestedNames.join(", ")}</div>
                </div>
              </details>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};