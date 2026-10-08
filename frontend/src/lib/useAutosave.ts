import { useCallback, useEffect, useRef, useState } from "react";
import { saveDraft, type DraftContent } from "@/lib/api";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;

// One editor is open at a time. Its save in progress (always resolved, even when the save
// fails) lets the documents list wait for it before loading, and saveNow lets signing out
// save the latest changes while the session still exists.
let pending: Promise<void> = Promise.resolve();
let saveOpenEditor: (() => Promise<boolean>) | null = null;
export const whenSaved = () => pending;
// Saves the open editor's changes now; false if they couldn't be saved.
export const saveNow = () => saveOpenEditor?.() ?? Promise.resolve(true);

// Saves the draft a moment after it stops changing, and when the editor closes. One save
// runs at a time; changes made meanwhile are saved right after it, so the latest version
// always wins. Nothing is saved while `skip` is true, or while the content matches
// `savedContent` (what the server already has).
export function useAutosave(id: string, content: DraftContent, skip: boolean, savedContent?: DraftContent) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const key = JSON.stringify(content);
  const latest = useRef({ content, key, skip });
  const savedKey = useRef(savedContent ? JSON.stringify(savedContent) : null);
  const saving = useRef(false);
  const lastSaveOk = useRef(true);

  const flush = useCallback(async (): Promise<boolean> => {
    if (saving.current) {
      // The save in progress picks up the latest content when it finishes.
      await pending;
      return lastSaveOk.current;
    }
    saving.current = true;
    let done!: () => void;
    pending = new Promise((resolve) => (done = resolve));
    try {
      while (!latest.current.skip && latest.current.key !== savedKey.current) {
        const { content, key } = latest.current;
        setStatus("saving");
        await saveDraft(id, content);
        savedKey.current = key;
      }
      lastSaveOk.current = true;
      if (savedKey.current !== null) setStatus("saved");
    } catch {
      lastSaveOk.current = false;
      setStatus("error"); // the next change, or Retry, tries again
    } finally {
      saving.current = false;
      done();
    }
    return lastSaveOk.current;
  }, [id]);

  useEffect(() => {
    latest.current = { content, key, skip };
    if (skip || key === savedKey.current) return;
    const timer = setTimeout(flush, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [content, key, skip, flush]);

  // Save straight away when the editor closes, e.g. on going back to the documents list.
  useEffect(() => {
    saveOpenEditor = flush;
    return () => {
      if (saveOpenEditor === flush) saveOpenEditor = null;
      void flush();
    };
  }, [flush]);

  return { status, retry: flush };
}
