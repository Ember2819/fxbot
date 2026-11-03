import { Check, Copy } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

// A copy button for a code block. It stays hidden without JavaScript, which client.ts shows and runs.
export function CopyButton() {
  return (
    <button type="button" data-copy hidden aria-label="Copy" title="Copy" className="copy">
      <Copy aria-hidden="true" className="copy-idle size-4" />
      <Check aria-hidden="true" className="copy-done size-4" />
    </button>
  );
}
export const copyButton = renderToStaticMarkup(<CopyButton />);

// A command or code to copy, as Markdown's code blocks render it.
export function Command({ children }: { children: string }) {
  return (
    <div className="code" data-code>
      <pre>
        <code>{children}</code>
      </pre>
      <CopyButton />
    </div>
  );
}
