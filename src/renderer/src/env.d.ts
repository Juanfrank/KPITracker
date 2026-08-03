/// <reference types="vite/client" />
import type { ApiRenderer } from '@shared/ipc';

declare global {
  interface Window {
    api: ApiRenderer;
  }
}

export {};
