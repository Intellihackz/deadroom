import { useSyncExternalStore } from "react";

// Whether the "dig up a coffin" modal is open. Shared by the nav, the home page and the modal itself.
let createOpen = false;
const subs = new Set<() => void>();
const set = (v: boolean) => {
  createOpen = v;
  subs.forEach((f) => f());
};

export const openCreate = () => set(true);
export const closeCreate = () => set(false);
export const useCreateOpen = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => createOpen,
  );
