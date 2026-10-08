"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthForm } from "@/components/AuthForm";
import { Dashboard } from "@/components/Dashboard";
import { EditorPage } from "@/components/EditorPage";
import { Logo } from "@/components/Logo";
import { errorMessage, getCurrentUser, signOut, type User } from "@/lib/api";
import { DISCLAIMER } from "@/lib/disclaimer";
import type { LoadedDocument } from "@/lib/documents";
import { navigate, routeHref, useRoute } from "@/lib/route";
import { buttonClass } from "@/lib/ui";
import { saveNow } from "@/lib/useAutosave";

function Footer() {
  return (
    <footer className="shrink-0 border-t border-zinc-200 bg-white px-6 py-2.5 text-xs text-zinc-500">
      <p>
        {DISCLAIMER} Templates by{" "}
        <a href="https://commonpaper.com/standards/" target="_blank" rel="noreferrer" className="underline hover:text-zinc-700">
          Common Paper
        </a>{" "}
        under CC BY 4.0.
      </p>
    </footer>
  );
}

// The page shell: shows the sign-in screen until someone is signed in, then their
// documents or the editor, depending on the URL.
export function App({ documents }: { documents: LoadedDocument[] }) {
  // undefined while we don't yet know whether anyone is signed in.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  // Set when the open document's latest changes couldn't be saved; signing out again discards them.
  const [unsaved, setUnsaved] = useState(false);
  const route = useRoute();

  const loadUser = useCallback(() => {
    getCurrentUser().then(setUser, (e) => setLoadError(errorMessage(e)));
  }, []);

  useEffect(loadUser, [loadUser]);

  function retry() {
    setLoadError(null);
    loadUser();
  }

  function signedIn(user: User) {
    navigate({ page: "documents" });
    setUser(user);
  }

  async function handleSignOut() {
    setSignOutError(null);
    // Save the open document first: once signed out, it can't be saved.
    if (!unsaved && !(await saveNow())) {
      setUnsaved(true);
      setSignOutError("Your latest changes couldn’t be saved. Sign out again to discard them.");
      return;
    }
    try {
      await signOut();
      setUnsaved(false);
      // So the next person to sign in here doesn't land on this user's document.
      navigate({ page: "documents" });
      setUser(null);
    } catch (e) {
      setSignOutError(errorMessage(e, "Couldn’t sign out. Please try again."));
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        {user === null ? (
          <main className="flex flex-1 flex-col">
            <AuthForm onSignedIn={signedIn} documentNames={documents.map((d) => d.spec.name)} />
          </main>
        ) : (
          <main className="flex flex-1 items-center justify-center px-4">
            {!loadError && (
              <p role="status" className="text-sm text-zinc-500">
                Loading…
              </p>
            )}
            {loadError && (
              <div className="text-center">
                <p role="alert" className="text-sm text-red-600">
                  {loadError}
                </p>
                <button type="button" onClick={retry} className={`mt-3 font-medium ${buttonClass("link")}`}>
                  Try again
                </button>
              </div>
            )}
          </main>
        )}
        <Footer />
      </div>
    );
  }

  return (
    // The editor fills the space between the header and footer on wide screens.
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6">
        <div className="flex min-w-0 items-center gap-6">
          <a href={routeHref({ page: "documents" })} aria-label="Prelegal home">
            <Logo />
          </a>
          <nav aria-label="Main">
            <a
              href={routeHref({ page: "documents" })}
              aria-current={route.page === "documents" ? "page" : undefined}
              className={`text-sm font-medium ${route.page === "documents" ? "text-brand-navy" : "text-zinc-600 hover:text-brand-navy"}`}
            >
              My documents
            </a>
          </nav>
        </div>
        <div className="flex min-w-0 items-center gap-4">
          {signOutError && (
            <span role="alert" className="text-xs text-red-600">
              {signOutError}
            </span>
          )}
          <span className="hidden truncate text-sm text-zinc-600 sm:inline">{user.email}</span>
          <button type="button" onClick={handleSignOut} className={buttonClass("secondary", "sm")}>
            Sign out
          </button>
        </div>
      </header>

      {/* On wide screens the editor's panels scroll separately; the documents list scrolls as a whole. */}
      <main className={`flex min-h-0 flex-1 flex-col ${route.page === "editor" ? "lg:overflow-hidden" : "lg:overflow-y-auto"}`}>
        {route.page === "editor" ? (
          // Keyed by document, so opening another one starts the editor afresh.
          <EditorPage key={route.id} documents={documents} id={route.id} />
        ) : (
          <Dashboard documents={documents} />
        )}
      </main>
      <Footer />
    </div>
  );
}
