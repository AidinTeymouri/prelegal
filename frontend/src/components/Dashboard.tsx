"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDraft, errorMessage, listDrafts, type DraftSummary } from "@/lib/api";
import type { LoadedDocument } from "@/lib/documents";
import { startNewDocument } from "@/lib/newDocument";
import { routeHref } from "@/lib/route";
import { timeAgo } from "@/lib/time";
import { buttonClass } from "@/lib/ui";
import { whenSaved } from "@/lib/useAutosave";

function StatusBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">Ready</span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20">Draft</span>
  );
}

function DocumentRow({ draft, typeName, onDeleted }: { draft: DraftSummary; typeName: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  // Keep keyboard focus on the row while asking to confirm, and after cancelling.
  const asked = useRef(false);
  useEffect(() => {
    if (confirming) cancelButton.current?.focus();
    else if (asked.current) deleteButton.current?.focus();
    asked.current = confirming;
  }, [confirming]);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteDraft(draft.id);
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-zinc-50">
      <div className="min-w-0 flex-1">
        <a href={routeHref({ page: "editor", id: draft.id })} className="font-medium text-brand-navy hover:underline">
          {draft.title}
        </a>
        <p className="mt-0.5 text-sm text-zinc-500">
          {typeName} · Updated {timeAgo(draft.updatedAt)}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
      <StatusBadge ready={draft.ready} />
      {confirming ? (
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            aria-label={`Confirm deleting ${draft.title}`}
            className={buttonClass("danger", "sm")}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            ref={cancelButton}
            type="button"
            onClick={() => setConfirming(false)}
            disabled={deleting}
            aria-label={`Keep ${draft.title}`}
            className={buttonClass("secondary", "sm")}
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          ref={deleteButton}
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${draft.title}`}
          className={buttonClass("secondary", "sm")}
        >
          Delete
        </button>
      )}
    </li>
  );
}

// The user's documents, newest first, with a button to start a new one.
export function Dashboard({ documents }: { documents: LoadedDocument[] }) {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    // An editor that was just closed may still be saving.
    whenSaved()
      .then(listDrafts)
      .then(setDrafts, (e) => setError(errorMessage(e)));
  }, []);

  useEffect(load, [load]);

  function retry() {
    setError(null);
    load();
  }

  const typeName = (id: string | null) => documents.find((d) => d.spec.id === id)?.spec.name ?? "Document not chosen yet";
  const newDocument = (
    <button type="button" onClick={startNewDocument} className={buttonClass("primary")}>
      New document
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-brand-navy">My documents</h1>
          <p className="mt-1 text-sm text-zinc-600">Your drafts are saved automatically as you work.</p>
        </div>
        {newDocument}
      </div>

      <div className="mt-8">
        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}{" "}
            <button type="button" onClick={retry} className={`font-medium ${buttonClass("link")}`}>
              Try again
            </button>
          </div>
        ) : drafts === null ? (
          <p role="status" className="text-sm text-zinc-500">
            Loading your documents…
          </p>
        ) : drafts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
            <h2 className="font-semibold text-brand-navy">No documents yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
              Start a new document and describe what you need, or pick one of {documents.length} Common Paper standard agreements.
            </p>
            <div className="mt-6">{newDocument}</div>
          </div>
        ) : (
          <ul aria-label="Documents" className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            {drafts.map((draft) => (
              <DocumentRow
                key={draft.id}
                draft={draft}
                typeName={typeName(draft.document)}
                onDeleted={() => setDrafts((current) => current?.filter((d) => d.id !== draft.id) ?? null)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
