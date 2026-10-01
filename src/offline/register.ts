// Registers the offline worker in production builds only (dev keeps a clean network, and the
// Workers static deploy still serves the plain Vite output if no worker ever registers).
import { offline } from './client';

export function registerOffline(prod = import.meta.env.PROD) {
  if (!prod || typeof window === 'undefined') return;
  window.addEventListener('load', () => void offline.register('/sw.js'));
}
