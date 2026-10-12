"use client";

import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { qk } from "@/hooks/query-keys";
import { isAssetImage } from "@/lib/files";
import { cn } from "@/lib/utils";
import { materialService } from "@/services/materialService";

/**
 * URL da mostrare per un'immagine del Markdown: quelle inserite dall'editor (solo nome file)
 * vengono risolte in `assetDir` su Storage, le altre restano com'erano.
 */
export function useAssetImage(assetDir: string | undefined, src: string | undefined): string | undefined {
  const asset = !!assetDir && isAssetImage(src);
  const url = useQuery({
    queryKey: qk.materialUrl(`${assetDir}/${src}`),
    queryFn: () => materialService.imageUrl(assetDir!, src!),
    enabled: asset,
    staleTime: 30 * 60_000,
  });
  return asset ? url.data : src;
}

function MarkdownImage({ assetDir, src, alt, ...props }: React.ComponentProps<"img"> & { assetDir?: string }) {
  const url = useAssetImage(assetDir, typeof src === "string" ? src : undefined);
  // eslint-disable-next-line @next/next/no-img-element -- URL dinamico (Storage o sito esterno)
  return <img {...props} src={url} alt={alt ?? ""} />;
}

/**
 * Rendering Markdown (GFM: tabelle, liste di controllo, barrato). L'HTML grezzo non viene interpretato.
 * `assetDir` è la cartella Storage del materiale, per le immagini inserite dall'editor.
 */
export function Markdown({ children, className, assetDir }: { children: string; className?: string; assetDir?: string }) {
  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `node` non va passato al DOM
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `node` non va passato al DOM
          img: ({ node, ...props }) => <MarkdownImage {...props} assetDir={assetDir} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
