import type { AnchorHTMLAttributes } from 'react';

export default function Link({
  href,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  // Children arrive through `rest`, like next/link.
  // eslint-disable-next-line jsx-a11y-x/anchor-has-content
  return <a href={`#${href}`} {...rest} />;
}
