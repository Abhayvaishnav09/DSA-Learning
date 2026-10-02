import { CanvasTexture, SRGBColorSpace } from 'three';

let texture: CanvasTexture | null = null;

/**
 * A soft radial dot used for glows and particles: additive sprites give a bloom look without
 * a post-processing pass (which would cost a full-screen render on every frame).
 */
export function glowTexture(): CanvasTexture {
  if (texture) return texture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
