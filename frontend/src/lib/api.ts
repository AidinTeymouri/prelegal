import type { NdaFormData } from "@/lib/nda";

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
    throw new ApiError(typeof detail === "string" ? detail : "Something went wrong. Please try again.", response.status);
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
export type ChatReply = { reply: string; fields: NdaFormData };

// One turn of the NDA chat: the whole conversation and the current fields go up,
// the assistant's reply and the fields with its changes applied come back.
export const sendChat = (messages: ChatMessage[], fields: NdaFormData, today: string) =>
  request<ChatReply>("POST", "/chat", { messages, fields, today });
