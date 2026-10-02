'use client';

import { Check } from 'lucide-react';
import { DropdownMenu as DM, Tabs as T, Tooltip as TT } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

// ---------- tooltip ----------

export const TooltipProvider = TT.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TT.Root delayDuration={300}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-lg bg-fg px-2.5 py-1.5 text-xs font-medium text-bg shadow-floating data-[state=delayed-open]:animate-pop"
        >
          {content}
          <TT.Arrow className="fill-fg" />
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

// ---------- dropdown menu ----------

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;

export function MenuContent({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={8}
        className={cn(
          'z-[60] min-w-52 rounded-xl border border-border bg-surface p-1.5 shadow-overlay data-[state=open]:animate-pop',
          className,
        )}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted';

export function MenuItem({
  children,
  onSelect,
  icon,
  danger = false,
  disabled,
  asChild,
}: {
  children: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  asChild?: boolean;
}) {
  return (
    <DM.Item
      asChild={asChild}
      disabled={disabled}
      onSelect={onSelect}
      className={cn(itemClass, danger && 'text-danger [&_svg]:text-danger')}
    >
      {asChild ? (
        children
      ) : (
        <span className="flex w-full items-center gap-2.5">
          {icon}
          {children}
        </span>
      )}
    </DM.Item>
  );
}

export function MenuRadio<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
}) {
  return (
    <DM.Group>
      <DM.Label className="px-2.5 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
        {label}
      </DM.Label>
      <DM.RadioGroup value={value} onValueChange={(v) => onChange(v as V)}>
        {options.map((o) => (
          <DM.RadioItem key={o.value} value={o.value} className={itemClass}>
            <span className="grid size-4 place-items-center">
              <DM.ItemIndicator>
                <Check aria-hidden />
              </DM.ItemIndicator>
            </span>
            {o.label}
          </DM.RadioItem>
        ))}
      </DM.RadioGroup>
    </DM.Group>
  );
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2.5 py-2 text-sm">{children}</DM.Label>;
}

// ---------- tabs ----------

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <T.List
      aria-label={label}
      className={cn('inline-flex gap-1 rounded-xl bg-surface-2 p-1', className)}
    >
      {children}
    </T.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <T.Trigger
      value={value}
      className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-raised"
    >
      {children}
    </T.Trigger>
  );
}
