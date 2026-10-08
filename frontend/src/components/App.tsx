"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthForm } from "@/components/AuthForm";
import { DocumentBuilderClient } from "@/components/DocumentBuilderClient";
import { ApiError, getCurrentUser, signOut, type User } from "@/lib/api";
import type { LoadedDocument } from "@/lib/documents";

// The page shell: shows the sign-in form until someone is signed in, then the document creator.
export function App({ documents }: { documents: LoadedDocument[] }) {
  // undefined while we don't yet know whether anyone is signed in.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const loadUser = useCallback(() => {
    getCurrentUser().then(setUser, (e) => setLoadError(e instanceof ApiError ? e.message : "Something went wrong. Please try again."));
  }, []);

  useEffect(loadUser, [loadUser]);

  function retry() {
    setLoadError(null);
    loadUser();
  }

  async function handleSignOut() {
    setSignOutError(null);
    try {
      await signOut();
      setUser(null);
    } catch (e) {
      setSignOutError(e instanceof ApiError ? e.message : "Couldn’t sign out. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[57px] items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6">
        <div className="min-w-0 truncate">
          <span className="font-semibold text-brand-navy">Prelegal</span>
          {user && <span className="ml-3 text-sm text-zinc-500">Legal agreement creator</span>}
        </div>
        <div className="flex min-w-0 items-center gap-4">
          <span className="hidden text-xs text-zinc-400 md:inline">Templates by Common Paper · CC BY 4.0</span>
          {user && (
            <>
              {signOutError && (
                <span role="alert" className="text-xs text-red-600">
                  {signOutError}
                </span>
              )}
              <span className="hidden truncate text-sm text-zinc-600 sm:inline">{user.email}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      {user ? (
        <DocumentBuilderClient documents={documents} />
      ) : (
        <main className="flex flex-1 items-start justify-center px-4 py-16">
          {user === null && <AuthForm onSignedIn={setUser} />}
          {user === undefined && !loadError && <p className="text-sm text-zinc-500">Loading…</p>}
          {loadError && (
            <div className="text-center">
              <p role="alert" className="text-sm text-red-600">
                {loadError}
              </p>
              <button type="button" onClick={retry} className="mt-3 text-sm font-medium text-brand-blue hover:underline">
                Try again
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
