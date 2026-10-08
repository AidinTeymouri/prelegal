"use client";

import { useCallback, useEffect, useState } from "react";
import { DocumentBuilderClient } from "@/components/DocumentBuilderClient";
import { ApiError, errorMessage, getDraft, type DraftContent } from "@/lib/api";
import type { LoadedDocument } from "@/lib/documents";
import { buttonClass } from "@/lib/ui";
import { forgetStarted, isStartedHere } from "@/lib/newDocument";

type State = { kind: "loading" } | { kind: "ready"; saved?: DraftContent } | { kind: "error"; message: string };

// Opens a document in the editor: a saved one with its fields and conversation, or a new one.
// An id that isn't saved (e.g. a new document reloaded before anything was typed) starts afresh.
export function EditorPage({ documents, id }: { documents: LoadedDocument[]; id: string }) {
  const [isNew] = useState(() => isStartedHere(id));
  const [state, setState] = useState<State>(isNew ? { kind: "ready" } : { kind: "loading" });

  const load = useCallback(() => {
    getDraft(id).then(
      ({ document, fields, messages }) => {
        // A document type that no longer exists starts over with the choice of documents.
        const known = documents.some((d) => d.spec.id === document);
        setState({ kind: "ready", saved: known ? { document, fields, messages } : { document: null, fields: null, messages } });
      },
      (e) =>
        setState(
          e instanceof ApiError && e.status === 404
            ? { kind: "ready" }
            : { kind: "error", message: errorMessage(e) },
        ),
    );
  }, [documents, id]);

  useEffect(() => {
    if (!isNew) load();
    return () => void forgetStarted(id);
  }, [id, isNew, load]);

  function retry() {
    setState({ kind: "loading" });
    load();
  }

  switch (state.kind) {
    case "ready":
      return <DocumentBuilderClient documents={documents} id={id} saved={state.saved} />;
    case "loading":
      return (
        <p role="status" className="p-6 text-sm text-zinc-500">
          Loading your document…
        </p>
      );
    case "error":
      return (
        <div role="alert" className="mx-auto max-w-md px-6 py-16 text-center text-sm text-red-700">
          {state.message}{" "}
          <button type="button" onClick={retry} className={`font-medium ${buttonClass("link")}`}>
            Try again
          </button>
        </div>
      );
  }
}
