'use client';

import { IconButton, Tabs, TabsContent, TabsList, TabsTrigger, toast } from '@logicpath/ui';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** Code in one or more languages, with a copy button (for developer docs). */
export function CodeSample({
  samples,
  label,
}: {
  samples: { lang: string; code: string }[];
  label: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (code: string, lang: string) => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(lang);
      toast.success('Copied');
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const block = (s: { lang: string; code: string }) => (
    <div className="relative">
      {/* Focusable so long lines can be scrolled with the keyboard. */}
      <pre
        tabIndex={0}
        aria-label={`${s.lang} example`}
        className="overflow-x-auto rounded-xl bg-[#0f0f1d] p-4 pr-14 font-mono text-sm leading-6 text-[#e6e6f5]"
      >
        <code>{s.code}</code>
      </pre>
      <IconButton
        label={`Copy ${s.lang}`}
        size="icon-sm"
        className="absolute top-2 right-2 text-[#c7c7e0] hover:bg-white/10 hover:text-white"
        onClick={() => copy(s.code, s.lang)}
      >
        {copied === s.lang ? <Check /> : <Copy />}
      </IconButton>
    </div>
  );
  if (samples.length === 1) return block(samples[0]!);
  return (
    <Tabs defaultValue={samples[0]!.lang} className="flex flex-col gap-2">
      <TabsList label={label}>
        {samples.map((s) => (
          <TabsTrigger key={s.lang} value={s.lang}>
            {s.lang}
          </TabsTrigger>
        ))}
      </TabsList>
      {samples.map((s) => (
        <TabsContent key={s.lang} value={s.lang}>
          {block(s)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
