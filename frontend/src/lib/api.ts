import type { DocumentData } from "@/lib/documents";

// Client for the FastAPI backend. In production it serves this app, so the API
// is on the same origin; in development `next dev` forwards /api to it.

export type User = { id: number; email: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const SOMETHING_WENT_WRONG = "Something went wrong. Please try again.";

// What to tell the user about a failed request: the server's message, or a generic one.
export const errorMessage = (e: unknown, fallback = SOMETHING_WENT_WRONG) => (e instanceof ApiError ? e.message : fallback);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can’t reach the server. Check your connection and try again.", 0);
  }
  if (!response.ok) {
    const detail = await response
      .json()
      .then((json: { detail?: unknown }) => json.detail)
      .catch(() => undefined);
    throw new ApiError(typeof detail === "string" ? detail : SOMETHING_WENT_WRONG, response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export type Credentials = { email: string; password: string };

export const signUp = (credentials: Credentials) => request<User>("POST", "/auth/signup", credentials);
export const signIn = (credentials: Credentials) => request<User>("POST", "/auth/signin", credentials);
export const signOut = () => request<void>("POST", "/auth/signout");

// The signed-in user, or null if nobody is signed in.
export async function getCurrentUser(): Promise<User | null> {
  try {
    return await request<User>("GET", "/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export type ChatMessage = { role: "user" | "assistant"; content: string };
// The document being drafted (null until one is chosen) and its field data.
export type Draft = { document: string | null; fields: DocumentData | null };
export type ChatReply = { reply: string } & Draft;

// One turn of the chat: the whole conversation and the current draft go up; the
// assistant's reply and the draft with its changes (possibly a new document) come back.
export const sendChat = (messages: ChatMessage[], draft: Draft, today: string) =>
  request<ChatReply>("POST", "/chat", { messages, ...draft, today });

// The user's saved documents (autosaved drafts). A new document gets an id from the
// browser; saving creates it or replaces it.
export type DraftContent = Draft & { messages: ChatMessage[] };
export type DraftSummary = { id: string; document: string | null; title: string; ready: boolean; updatedAt: string };
export type SavedDraft = DraftSummary & DraftContent & { createdAt: string };

export const listDrafts = () => request<DraftSummary[]>("GET", "/documents");
export const getDraft = (id: string) => request<SavedDraft>("GET", `/documents/${id}`);
export const saveDraft = (id: string, content: DraftContent) => request<SavedDraft>("PUT", `/documents/${id}`, content);
export const deleteDraft = (id: string) => request<void>("DELETE", `/documents/${id}`);
