import { useSyncExternalStore } from "react";

// The screen to show, kept in the URL hash so back, forward and reload work. The app is a
// static export with a single page, so it can't have a path per document.
//   #/documents       the user's documents (also the default)
//   #/documents/<id>  a document in the editor
export type Route = { page: "documents" } | { page: "editor"; id: string };

const EDITOR = /^#\/documents\/([0-9a-f-]{36})$/i;

export function parseHash(hash: string): Route {
  const editor = hash.match(EDITOR);
  return editor ? { page: "editor", id: editor[1].toLowerCase() } : { page: "documents" };
}

export function routeHref(route: Route): string {
  return route.page === "editor" ? `#/documents/${route.id}` : "#/documents";
}

export function navigate(route: Route) {
  window.location.hash = routeHref(route);
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export function useRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, () => window.location.hash, () => ""));
}
