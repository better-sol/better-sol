import { useEffect, useRef } from "react";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import "highlight.js/styles/github-dark-dimmed.min.css";

hljs.registerLanguage("typescript", typescript);

type HighlightCodeProps = {
  readonly code: string;
};

export function HighlightCode({ code }: HighlightCodeProps) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current === null) return;
    delete codeRef.current.dataset.highlighted;
    hljs.highlightElement(codeRef.current);
  }, [code]);

  return (
    <pre>
      <code ref={codeRef} className="language-typescript">
        {code}
      </code>
    </pre>
  );
}
