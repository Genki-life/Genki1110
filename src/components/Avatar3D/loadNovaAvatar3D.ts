import React from 'react';

type NovaAvatar3DModule = {
  default: typeof import('./NovaAvatar3D').NovaAvatar3D;
};

let novaAvatar3DPromise: Promise<NovaAvatar3DModule> | null = null;

export function loadNovaAvatar3D(): Promise<NovaAvatar3DModule> {
  if (!novaAvatar3DPromise) {
    novaAvatar3DPromise = import('./NovaAvatar3D')
      .then((module) => ({ default: module.NovaAvatar3D }))
      .catch((error) => {
        novaAvatar3DPromise = null;
        throw error;
      });
  }
  return novaAvatar3DPromise;
}

export const LazyNovaAvatar3D = React.lazy(loadNovaAvatar3D);
