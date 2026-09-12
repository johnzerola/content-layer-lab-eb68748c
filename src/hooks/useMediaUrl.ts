/** Resolve referências de mídia guardadas no armazenamento para exibir na tela. */
import { useEffect, useState } from "react";
import { isStorageRef, peekMediaUrl, resolveMediaUrl } from "@/lib/media-store";

export function useMediaUrl(value: string | null | undefined): string {
  const initial = value && isStorageRef(value) ? (peekMediaUrl(value) ?? "") : (value ?? "");
  const [url, setUrl] = useState(initial);

  useEffect(() => {
    if (!value) {
      setUrl("");
      return;
    }
    if (!isStorageRef(value)) {
      setUrl(value);
      return;
    }
    const cached = peekMediaUrl(value);
    if (cached) {
      setUrl(cached);
      return;
    }
    let alive = true;
    void resolveMediaUrl(value).then((resolved) => {
      if (alive) setUrl(resolved);
    });
    return () => {
      alive = false;
    };
  }, [value]);

  return url;
}
