"use client";

import { useState, type FormEvent } from "react";
import { ApiError, signIn, signUp, type User } from "@/lib/api";

type Mode = "signin" | "signup";

const COPY: Record<Mode, { heading: string; submit: string; busy: string; switchPrompt: string; switchLabel: string }> = {
  signin: {
    heading: "Sign in to Prelegal",
    submit: "Sign in",
    busy: "Signing in…",
    switchPrompt: "New to Prelegal?",
    switchLabel: "Create an account",
  },
  signup: {
    heading: "Create your Prelegal account",
    submit: "Create account",
    busy: "Creating account…",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
  },
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

export function AuthForm({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await (mode === "signin" ? signIn : signUp)({ email, password });
      onSignedIn(user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    setError(null);
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-brand-navy">{copy.heading}</h1>
      <p className="mt-1 text-sm text-brand-gray">Draft common legal agreements in minutes.</p>

      <form className="mt-6 space-y-4" onSubmit={submit}>
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            className={`mt-1 ${inputClass}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Password</span>
          {mode === "signup" && <span className="ml-2 text-xs text-zinc-500">At least 8 characters</span>}
          <input
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={`mt-1 ${inputClass}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-purple/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? copy.busy : copy.submit}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-brand-gray">
        {copy.switchPrompt}{" "}
        <button type="button" onClick={switchMode} className="font-medium text-brand-blue hover:underline">
          {copy.switchLabel}
        </button>
      </p>
    </div>
  );
}
