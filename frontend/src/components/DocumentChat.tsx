"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatMessage } from "@/lib/api";
import { buttonClass, inputClass } from "@/lib/ui";

type Props = {
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRetry: () => void;
};

export function DocumentChat({ messages, pending, error, onSend, onRetry }: Props) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message in view (scrolling the list only, not the page).
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, pending, error]);

  // Ready for the next message as soon as a reply arrives.
  useEffect(() => {
    if (!pending) inputRef.current?.focus({ preventScroll: true });
  }, [pending]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (pending || !draft.trim()) return;
    onSend(draft);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a line. Ignore Enter while an IME is composing text.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        className="h-[50vh] space-y-3 overflow-y-auto px-6 py-4 lg:h-auto lg:flex-1"
      >
        {messages.map((message, i) => (
          <div key={i} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                message.role === "user" ? "rounded-br-sm bg-brand-blue text-white" : "rounded-bl-sm bg-zinc-100 text-zinc-800"
              }`}
            >
              <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>
              {message.content}
            </p>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <p className="rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2 text-sm text-zinc-500">Assistant is typing…</p>
          </div>
        )}
        {error && (
          <div role="alert" className="text-sm text-red-600">
            {error}{" "}
            <button type="button" onClick={onRetry} className="font-medium text-brand-blue hover:underline">
              Retry
            </button>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-zinc-200 px-6 py-3">
        <textarea
          ref={inputRef}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Message"
          placeholder="Type your message…"
          className={`min-w-0 flex-1 resize-none ${inputClass}`}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className={buttonClass("primary")}
        >
          Send
        </button>
      </form>
    </div>
  );
}
