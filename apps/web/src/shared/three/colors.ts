'use client';

import { useEffect, useState } from 'react';
import { Color } from 'three';

export interface SceneColors {
  accent: Color;
  accent2: Color;
  xp: Color;
  success: Color;
  muted: Color;
  surface: Color;
  bg: Color;
  dark: boolean;
}

const read = (): SceneColors => {
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) =>
    new Color(style.getPropertyValue(name).trim() || fallback);
  return {
    accent: pick('--accent', '#5546d6'),
    accent2: pick('--accent-2', '#0f8fa8'),
    xp: pick('--xp', '#b45309'),
    success: pick('--success', '#0e7247'),
    muted: pick('--subtle', '#6b6b85'),
    surface: pick('--surface', '#ffffff'),
    bg: pick('--bg', '#f7f7fc'),
    dark: style.colorScheme.includes('dark') || document.documentElement.dataset.theme === 'dark',
  };
};

/** The design tokens as three.js colours, updated when the theme changes. */
export function useSceneColors(): SceneColors | null {
  const [colors, setColors] = useState<SceneColors | null>(null);
  useEffect(() => {
    const update = () => setColors(read());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-contrast'],
    });
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, []);
  return colors;
}
