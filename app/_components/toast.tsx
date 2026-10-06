"use client";
// A tiny notice in the corner for things that went wrong (the bus said no, a reply timed out).
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = (text: string) => void;

const ToastContext = createContext<Toast>(() => {});

const SHOW_MS = 5_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<{ id: number; text: string }[]>([]);
  const show = useCallback<Toast>((text) => {
    const id = Date.now() + Math.random();
    setNotes((current) => [...current, { id, text }]);
    setTimeout(() => setNotes((current) => current.filter((n) => n.id !== id)), SHOW_MS);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex max-w-sm flex-col gap-2">
        {notes.map((n) => (
          <div key={n.id} role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 shadow">
            {n.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Toast {
  return useContext(ToastContext);
}
