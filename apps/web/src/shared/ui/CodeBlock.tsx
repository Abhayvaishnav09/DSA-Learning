interface CodeBlockProps {
  code: string;
  label?: string;
}

/** Read-only program listing with line numbers (numbers are hidden from screen readers). */
export function CodeBlock({ code, label }: CodeBlockProps) {
  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <pre
      className="overflow-x-auto rounded-xl bg-code p-3 font-mono text-sm leading-7"
      aria-label={label}
    >
      <code>
        {lines.map((line, i) => (
          <span key={i} className="flex gap-3">
            <span className="w-5 shrink-0 select-none text-right text-muted opacity-60" aria-hidden>
              {i + 1}
            </span>
            <span className="whitespace-pre">{line || ' '}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}
