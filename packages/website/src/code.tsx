import { Check, Copy } from "lucide-react";

// A copy button for a code block. It stays hidden without JavaScript, which client.ts shows and runs.
export function CopyButton() {
  return (
    <button type="button" data-copy hidden aria-label="Copy" title="Copy" className="copy">
      <Copy aria-hidden="true" className="copy-idle size-4" />
      <Check aria-hidden="true" className="copy-done size-4" />
    </button>
  );
}

// A command or code to copy.
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
