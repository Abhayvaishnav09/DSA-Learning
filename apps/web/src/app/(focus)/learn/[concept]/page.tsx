import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LessonPlayer } from '@/features/lesson-player/LessonPlayer';
import { bundle, getConcept, getLesson } from '@/shared/content/bundle';

type Params = { concept: string };

export function generateStaticParams(): Params[] {
  return Object.keys(bundle.lessons).map((concept) => ({ concept }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const concept = getConcept((await params).concept);
  return concept ? { title: concept.title.en } : {};
}

export default async function LessonPage({ params }: { params: Promise<Params> }) {
  const { concept } = await params;
  if (!getLesson(concept)) notFound();
  return <LessonPlayer conceptId={concept} />;
}
