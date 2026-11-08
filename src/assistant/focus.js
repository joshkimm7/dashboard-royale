// Which evidence-map boxes the assistant is currently pointing at, shared across components.
import { useSyncExternalStore } from 'react';

let focus = null; // { ids: string[], label: string } | null
const listeners = new Set();

export function setMapFocus(next) {
  focus = next;
  for (const l of listeners) l();
}
export function useMapFocus() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => focus);
}

// Requests to open the assistant (optionally asking a question), e.g. from the top-bar search box.
const openers = new Set();
export function requestAssistant(question = '') {
  for (const l of openers) l(question);
}
export function onAssistantRequest(listener) {
  openers.add(listener);
  return () => openers.delete(listener);
}
