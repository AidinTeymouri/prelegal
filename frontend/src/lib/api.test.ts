import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getCurrentUser, signIn, signOut, signUp } from "@/lib/api";

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
