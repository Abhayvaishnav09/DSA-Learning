import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from './router';

/** next/link for the demo: hash URLs, client-side navigation, same props. */
export default function Link({
  href,
  onClick,
  prefetch: _prefetch,
  replace,
  scroll: _scroll,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    navigate(href, replace);
  };
  // Children arrive through `rest`, like next/link.
  // eslint-disable-next-line jsx-a11y-x/anchor-has-content
  return <a href={`#${href}`} onClick={handle} {...rest} />;
}
