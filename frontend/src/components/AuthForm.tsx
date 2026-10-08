"use client";

import { useState, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { errorMessage, signIn, signUp, type User } from "@/lib/api";
import { DISCLAIMER } from "@/lib/disclaimer";
import { buttonClass, inputClass } from "@/lib/ui";

type Mode = "signin" | "signup";

const COPY: Record<Mode, { heading: string; intro: string; submit: string; busy: string; switchPrompt: string; switchLabel: string }> = {
  signin: {
    heading: "Sign in to Prelegal",
    intro: "Welcome back. Your documents are waiting.",
    submit: "Sign in",
    busy: "Signing in…",
    switchPrompt: "New to Prelegal?",
    switchLabel: "Create an account",
  },
  signup: {
    heading: "Create your Prelegal account",
    intro: "Draft your first agreement in minutes.",
    submit: "Create account",
    busy: "Creating account…",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
  },
};

const MIN_PASSWORD_LENGTH = 8; // as the backend requires
const MISMATCH = "The passwords don’t match.";

const FEATURES = [
  ["Chat or fill in a form", "Tell the AI assistant what you need, or fill in the fields yourself."],
  ["See it as you go", "A live preview shows the agreement as it takes shape."],
  ["Pick up where you left off", "Every draft is saved automatically to My documents."],
];

// The branded half of the screen: what Prelegal does and what it can draft.
function BrandPanel({ documentNames }: { documentNames: string[] }) {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-navy px-12 py-12 text-white lg:flex lg:flex-col">
      <Logo inverted />
      <div className="mt-16 max-w-md">
        <p className="text-3xl font-semibold leading-tight tracking-tight">Draft legal agreements by chatting with AI.</p>
        <p className="mt-4 text-white/75">Prelegal fills in Common Paper’s standard agreements for you, ready to download as a PDF.</p>
        <ul className="mt-10 space-y-5">
          {FEATURES.map(([title, text]) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-yellow" />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-white/70">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {documentNames.length > 0 && (
        <div className="mt-auto pt-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">{documentNames.length} agreements to choose from</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {documentNames.map((name) => (
              <li key={name} className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/85">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

type Props = { onSignedIn: (user: User) => void; documentNames?: string[] };

export function AuthForm({ onSignedIn, documentNames = [] }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "signup" && password !== confirm) {
      setError(MISMATCH);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const user = await (mode === "signin" ? signIn : signUp)({ email, password });
      onSignedIn(user);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    setConfirm("");
    setError(null);
  }

  const passwordType = showPassword ? "text" : "password";

  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <BrandPanel documentNames={documentNames} />

      <section className="flex items-center justify-center bg-white px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo />
          </div>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-brand-navy lg:mt-0">{copy.heading}</h1>
          <p className="mt-2 text-sm text-zinc-600">{copy.intro}</p>

          <form className="mt-8 space-y-5" onSubmit={submit}>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                className={`mt-1.5 ${inputClass}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className="text-sm font-medium text-zinc-800">
                  Password
                </label>
                <button
                  type="button"
                  aria-controls={mode === "signup" ? "password confirm-password" : "password"}
                  onClick={() => setShowPassword(!showPassword)}
                  className={`text-xs ${buttonClass("link")}`}
                >
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>
              <input
                id="password"
                type={passwordType}
                required
                minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                aria-describedby={mode === "signup" ? "password-hint" : undefined}
                className={`mt-1.5 ${inputClass}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "signup" && (
                <p id="password-hint" className="mt-1.5 text-xs text-zinc-500">
                  At least {MIN_PASSWORD_LENGTH} characters
                </p>
              )}
            </div>

            {mode === "signup" && (
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Confirm password</span>
                <input
                  id="confirm-password"
                  type={passwordType}
                  required
                  autoComplete="new-password"
                  aria-invalid={error === MISMATCH || undefined}
                  className={`mt-1.5 ${inputClass}`}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}

            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button type="submit" disabled={submitting} className={`w-full ${buttonClass("primary")}`}>
              {submitting ? copy.busy : copy.submit}
            </button>
          </form>

          {mode === "signup" && <p className="mt-4 text-xs leading-relaxed text-zinc-500">By creating an account you acknowledge: {DISCLAIMER}</p>}

          <p className="mt-8 text-center text-sm text-zinc-600">
            {copy.switchPrompt}{" "}
            <button type="button" onClick={switchMode} className={`font-medium ${buttonClass("link")}`}>
              {copy.switchLabel}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
