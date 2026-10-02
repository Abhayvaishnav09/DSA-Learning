'use client';

import type { authoring } from '@logicpath/contracts';
import { Badge } from '@logicpath/ui';
import { useStrings } from '@/shared/i18n/useT';
import { studioStrings } from './strings';

const TONE = {
  draft: 'neutral',
  in_review: 'info',
  changes_requested: 'warning',
  approved: 'success',
  published: 'success',
} as const;

export function StatusBadge({ status }: { status: authoring.DraftStatus }) {
  const t = useStrings(studioStrings);
  return (
    <Badge tone={TONE[status]} data-testid={`status-${status}`}>
      {t.status[status]}
    </Badge>
  );
}
