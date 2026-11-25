import React, { useEffect } from 'react';
import type { NovaAvatar3DProps } from './NovaAvatar3D';
import { FurryNovaStaticAvatar } from './FurryNovaStaticAvatar';

type NovaAvatar3DComponent = React.ComponentType<NovaAvatar3DProps>;

type NovaAvatar3DModule = {
  default: NovaAvatar3DComponent;
};

function NovaAvatar3DFallback({
  className = '',
  isListening = false,
  onReady,
  variant = 'default',
}: NovaAvatar3DProps) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return React.createElement(FurryNovaStaticAvatar, {
    size: variant === 'compact' ? 96 : 248,
    isListening,
    className: className || 'w-full h-full',
  });
}

let novaAvatar3DPromise: Promise<NovaAvatar3DModule> | null = null;

async function importNovaAvatar3DWithRetry(maxAttempts = 3): Promise<NovaAvatar3DModule> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const module = await import('./NovaAvatar3D');
      return { default: module.NovaAvatar3D };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }

  console.warn('[NovaAvatar3D] Dynamic import failed after retries; using static fallback.', lastError);
  return { default: NovaAvatar3DFallback };
}

export function loadNovaAvatar3D(): Promise<NovaAvatar3DModule> {
  if (!novaAvatar3DPromise) {
    novaAvatar3DPromise = importNovaAvatar3DWithRetry().then((resolved) => {
      if (resolved.default === NovaAvatar3DFallback) {
        // Allow future visits to retry loading the 3D module cleanly
        novaAvatar3DPromise = null;
      }
      return resolved;
    });
  }
  return novaAvatar3DPromise;
}

export const LazyNovaAvatar3D = React.lazy(loadNovaAvatar3D);
