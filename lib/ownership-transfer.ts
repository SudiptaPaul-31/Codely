import { submitOwnershipTransferMemoToStellar as submitOnChain } from "@/lib/stellar";

export async function submitOwnershipTransferMemoToStellar(params: {
  snippetId: string;
  oldOwnerWalletAddress: string;
  newOwnerWalletAddress: string;
}): Promise<{
  success: boolean;
  transactionHash?: string;
  memo?: string;
  error?: string;
}> {
  return await submitOnChain({
    snippetId: params.snippetId,
    oldOwnerWalletAddress: params.oldOwnerWalletAddress,
    newOwnerWalletAddress: params.newOwnerWalletAddress,
  });
}



