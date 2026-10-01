import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/learn" className="lp-btn">
        Go to your path
      </Link>
    </div>
  );
}
