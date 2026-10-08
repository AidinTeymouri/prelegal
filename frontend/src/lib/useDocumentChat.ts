import { useState, type Dispatch, type SetStateAction } from "react";
import { ApiError, sendChat, type ChatMessage, type Draft } from "@/lib/api";
import { todayIso, type DocumentData } from "@/lib/documents";

export const GREETING =
  "Hi! I’ll help you draft a legal agreement, such as an NDA, a cloud service agreement, a pilot agreement or a data processing agreement. What would you like to create?";

// Applies the assistant's reply to the current draft. When it moved to another document,
// its draft replaces ours. Otherwise only the fields it changed (returned vs sent) are
// applied, so edits made on the Fields tab while waiting for the reply are kept. If the
// user picked another document while waiting, the reply's changes no longer apply.
export function applyChanges(current: Draft, sent: Draft, returned: Draft): Draft {
  if (current.document !== sent.document) return current;
  if (returned.document !== sent.document || !returned.fields) return returned;
  if (!current.fields || !sent.fields) return current;
  const changed = <T extends object>(base: T, before: T, after: T): T => {
    const result = { ...base };
    for (const key of Object.keys(after) as (keyof T)[]) {
      if (after[key] !== before[key]) result[key] = after[key];
    }
    return result;
  };
  const [before, after] = [sent.fields, returned.fields];
  const fields: DocumentData = {
    values: changed(current.fields.values, before.values, after.values),
    parties: [0, 1].map((i) => changed(current.fields!.parties[i], before.parties[i], after.parties[i])) as DocumentData["parties"],
  };
  return { document: current.document, fields };
}

// The conversation with the assistant. Each reply updates the draft through setDraft.
export function useDocumentChat(draft: Draft, setDraft: Dispatch<SetStateAction<Draft>>) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: GREETING }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(conversation: ChatMessage[]) {
    const sent = draft;
    setPending(true);
    setError(null);
    try {
      const { reply, ...returned } = await sendChat(conversation, sent, todayIso());
      setMessages([...conversation, { role: "assistant", content: reply }]);
      setDraft((current) => applyChanges(current, sent, returned));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const conversation: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(conversation);
    void request(conversation);
  }

  // Asks again after a failure; the user's last message is still at the end of the conversation.
  function retry() {
    if (!pending) void request(messages);
  }

  return { messages, pending, error, send, retry };
}
