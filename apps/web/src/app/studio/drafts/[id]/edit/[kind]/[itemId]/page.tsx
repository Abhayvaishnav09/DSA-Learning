import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EditorScreen } from '@/features/studio/editor/EditorScreen';

export const metadata: Metadata = { title: 'Edit' };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; kind: string; itemId: string }>;
}) {
  const { id, kind, itemId } = await params;
  // The editor reads ?type= and ?concept= for new questions, which needs a Suspense boundary.
  return (
    <Suspense>
      <EditorScreen draftId={id} kind={kind} targetId={itemId} />
    </Suspense>
  );
}
