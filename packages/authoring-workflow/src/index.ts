/**
 * The writer → admin review workflow (ADR-0017), as pure rules shared by the authoring service
 * and the in-browser demo backend, so both behave the same.
 *
 *   draft ──submit──▶ in_review ──approve──▶ approved ──(content service)──▶ published
 *     ▲                 │    │                   │
 *     └────withdraw─────┘    └─request changes─▶ changes_requested ◀── publish failed
 *                                                     │
 *                                                     └──submit──▶ in_review
 */

export type DraftStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'published';
export type Role = 'student' | 'writer' | 'admin';

export type DraftAction =
  | 'edit'
  | 'delete'
  | 'submit'
  | 'withdraw'
  | 'approve'
  | 'request_changes'
  | 'publish_succeeded'
  | 'publish_failed';

export interface Actor {
  id: string;
  role: Role;
}

export interface DraftRef {
  authorId: string;
  status: DraftStatus;
}

interface Rule {
  from: readonly DraftStatus[];
  to: DraftStatus | null;
  /** Who may do it: the draft's author, an admin, or only the system (event handlers). */
  who: 'author' | 'admin' | 'system';
}

export const RULES: Record<DraftAction, Rule> = {
  edit: { from: ['draft', 'changes_requested'], to: null, who: 'author' },
  delete: { from: ['draft'], to: null, who: 'author' },
  submit: { from: ['draft', 'changes_requested'], to: 'in_review', who: 'author' },
  withdraw: { from: ['in_review'], to: 'draft', who: 'author' },
  approve: { from: ['in_review'], to: 'approved', who: 'admin' },
  request_changes: { from: ['in_review'], to: 'changes_requested', who: 'admin' },
  publish_succeeded: { from: ['approved'], to: 'published', who: 'system' },
  publish_failed: { from: ['approved'], to: 'changes_requested', who: 'system' },
};

const RANK: Record<Role, number> = { student: 0, writer: 1, admin: 2 };

/** Writers and admins may write content; students may not. */
export const canAuthor = (role: Role) => RANK[role] >= RANK.writer;
export const canReview = (role: Role) => role === 'admin';

/** May this person see the draft? Authors see their own, admins see everything. */
export const canView = (actor: Actor, draft: DraftRef) =>
  actor.role === 'admin' || (canAuthor(actor.role) && actor.id === draft.authorId);

export type Decision =
  | { ok: true; next: DraftStatus }
  | { ok: false; reason: 'forbidden' | 'invalid_state'; message: string };

/**
 * Can `actor` do `action` on `draft` now? `actor` is null for the system.
 * Admins may edit or submit any writer's draft (to fix a typo before approving), but nobody,
 * admins included, can approve their own submission: a second pair of eyes is the point.
 */
export function decide(action: DraftAction, draft: DraftRef, actor: Actor | null): Decision {
  const rule = RULES[action];
  if (rule.who === 'system') {
    if (actor) return { ok: false, reason: 'forbidden', message: 'only the system can do this' };
  } else {
    if (!actor || !canAuthor(actor.role))
      return { ok: false, reason: 'forbidden', message: 'only writers and admins can do this' };
    if (rule.who === 'admin') {
      if (!canReview(actor.role))
        return { ok: false, reason: 'forbidden', message: 'only admins can review' };
      if (actor.id === draft.authorId)
        return { ok: false, reason: 'forbidden', message: 'you cannot review your own work' };
    } else if (actor.id !== draft.authorId && actor.role !== 'admin') {
      return { ok: false, reason: 'forbidden', message: 'this is not your draft' };
    }
  }
  if (!rule.from.includes(draft.status)) {
    return {
      ok: false,
      reason: 'invalid_state',
      message: `cannot ${action.replace('_', ' ')} a draft that is ${draft.status.replace('_', ' ')}`,
    };
  }
  return { ok: true, next: rule.to ?? draft.status };
}

/** Actions the UI should offer this person for this draft. */
export function availableActions(draft: DraftRef, actor: Actor): DraftAction[] {
  return (Object.keys(RULES) as DraftAction[]).filter(
    (action) => RULES[action].who !== 'system' && decide(action, draft, actor).ok,
  );
}
