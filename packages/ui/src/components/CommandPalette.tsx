'use client';

import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useEffect, type ReactNode } from 'react';
import { Kbd } from './Feedback';

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  /** Extra words that should find it (e.g. "settings" finds "Preferences"). */
  keywords?: string[];
  shortcut?: string;
  onSelect: () => void;
}

/**
 * ⌘K / Ctrl+K palette: jump anywhere, run actions, and (with `onQuery`) search content.
 * Items are filtered locally; `dynamic` items (search results) are shown as given.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  dynamic = [],
  placeholder,
  emptyText,
  onQuery,
  title = 'Command palette',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  dynamic?: CommandItem[];
  placeholder: string;
  emptyText: string;
  onQuery?: (query: string) => void;
  title?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const groups = [...new Set([...dynamic, ...items].map((i) => i.group))];
  const run = (item: CommandItem) => {
    onOpenChange(false);
    item.onSelect();
  };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
        <D.Content className="fixed top-[12dvh] left-1/2 z-50 w-[min(calc(100vw-1.5rem),40rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay data-[state=open]:animate-pop">
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{placeholder}</D.Description>
          <Command label={title} loop shouldFilter>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-5 shrink-0 text-muted" aria-hidden />
              <Command.Input
                placeholder={placeholder}
                onValueChange={onQuery}
                className="h-14 w-full bg-transparent text-base outline-none placeholder:text-subtle"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(60dvh,26rem)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
                {emptyText}
              </Command.Empty>
              {groups.map((group) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle"
                >
                  {[...dynamic, ...items]
                    .filter((i) => i.group === group)
                    .map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${item.label} ${item.id}`}
                        keywords={item.keywords}
                        onSelect={() => run(item)}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent [&_svg]:size-4"
                      >
                        {item.icon && <span aria-hidden>{item.icon}</span>}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
