import { useCallback, useState } from "react";

export function useCopyToClipboard(resetDelay = 2000) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = useCallback(
    (id: string, text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), resetDelay);
      });
    },
    [resetDelay],
  );

  return { copiedId, copy };
}
