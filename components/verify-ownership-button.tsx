"use client";

import React, { useState } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import VerifyOwnershipModal from "@/components/verify-ownership-modal";
import { cn } from "@/lib/utils";

interface VerifyOwnershipButtonProps {
  snippetId: string;
  isOwner: boolean;
  onSuccess: () => void;
  className?: string;
}

export default function VerifyOwnershipButton({
  snippetId,
  isOwner,
  onSuccess,
  className,
}: VerifyOwnershipButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!isOwner) {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setIsModalOpen(true)}
        variant="outline"
        className={cn("gap-2", className)}
      >
        <CheckCircle className="w-4 h-4" />
        Verify Ownership
      </Button>

      <VerifyOwnershipModal
        snippetId={snippetId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          onSuccess();
        }}
      />
    </>
  );
}
