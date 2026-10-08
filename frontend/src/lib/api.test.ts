import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getCurrentUser, sendChat, signIn, signOut, signUp } from "@/lib/api";
import { data } from "@/testing/documents";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(response: Response | Error) {
  const fetch = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("signs up by posting the credentials as JSON", async () => {
    const fetch = mockFetch(json(201, { id: 1, email: "ada@example.com" }));

    await expect(signUp({ email: "ada@example.com", password: "correct horse" })).resolves.toEqual({ id: 1, email: "ada@example.com" });
    expect(fetch).toHaveBeenCalledWith("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", password: "correct horse" }),
    });
  });

  it("signs in", async () => {
    const fetch = mockFetch(json(200, { id: 1, email: "ada@example.com" }));
    await expect(signIn({ email: "ada@example.com", password: "pw" })).resolves.toEqual({ id: 1, email: "ada@example.com" });
    expect(fetch).toHaveBeenCalledWith("/api/auth/signin", expect.objectContaining({ method: "POST" }));
  });

  it("signs out, which has no response body", async () => {
    const fetch = mockFetch(new Response(null, { status: 204 }));
    await expect(signOut()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("/api/auth/signout", { method: "POST", headers: undefined, body: undefined });
  });

  it("turns error responses into an ApiError with the server's message", async () => {
    mockFetch(json(409, { detail: "An account with this email already exists." }));
    const error = await signUp({ email: "ada@example.com", password: "correct horse" }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: "An account with this email already exists." });
  });

  it("uses a generic message when the error response has no usable detail", async () => {
    mockFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(signIn({ email: "a@b.co", password: "x" })).rejects.toMatchObject({
      status: 502,
      message: "Something went wrong. Please try again.",
    });
  });

  it("reports network failures", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    await expect(signIn({ email: "a@b.co", password: "x" })).rejects.toMatchObject({
      status: 0,
      message: "Can’t reach the server. Check your connection and try again.",
    });
  });

  describe("getCurrentUser", () => {
    it("returns the signed-in user", async () => {
      mockFetch(json(200, { id: 1, email: "ada@example.com" }));
      await expect(getCurrentUser()).resolves.toEqual({ id: 1, email: "ada@example.com" });
    });

    it("returns null when nobody is signed in", async () => {
      mockFetch(json(401, { detail: "Not signed in." }));
      await expect(getCurrentUser()).resolves.toBeNull();
    });

    it("throws other errors", async () => {
      mockFetch(json(500, { detail: "Internal Server Error" }));
      await expect(getCurrentUser()).rejects.toMatchObject({ status: 500 });
    });
  });
});

describe("sendChat", () => {
  it("posts the conversation, the draft and today's date", async () => {
    const fields = data("mutual-nda");
    const fetch = mockFetch(json(200, { reply: "Thanks!", document: "mutual-nda", fields }));
    const messages = [{ role: "user" as const, content: "Acme and Globex" }];

    await expect(sendChat(messages, { document: "mutual-nda", fields }, "2026-10-07")).resolves.toEqual({
      reply: "Thanks!",
      document: "mutual-nda",
      fields,
    });
    expect(fetch).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, document: "mutual-nda", fields, today: "2026-10-07" }),
    });
  });

  it("posts no fields before a document is chosen", async () => {
    const fetch = mockFetch(json(200, { reply: "What do you need?", document: null, fields: null }));
    const messages = [{ role: "user" as const, content: "Hi" }];
    await sendChat(messages, { document: null, fields: null }, "2026-10-07");
    expect(fetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({ body: JSON.stringify({ messages, document: null, fields: null, today: "2026-10-07" }) }),
    );
  });
});
