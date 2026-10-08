import { useState, type Dispatch, type SetStateAction } from "react";
import { ApiError, sendChat, type ChatMessage } from "@/lib/api";
import { todayIso, type NdaFormData, type Party } from "@/lib/nda";

export const GREETING =
  "Hi! I’ll help you put together a Mutual Non-Disclosure Agreement. To start, which two companies is it between, and why will you be sharing confidential information?";

// The fields the assistant changed (returned vs sent), applied on top of the current
// fields, so edits made on the Fields tab while waiting for a reply are kept.
export function applyChanges(current: NdaFormData, sent: NdaFormData, returned: NdaFormData): NdaFormData {
  const changed = <T extends object>(base: T, before: T, after: T): T => {
    const result = { ...base };
    for (const key of Object.keys(after) as (keyof T)[]) {
      if (after[key] !== before[key]) result[key] = after[key];
    }
    return result;
  };
  const party = (key: "party1" | "party2"): Party => changed(current[key], sent[key], returned[key]);
  return { ...changed(current, sent, returned), party1: party("party1"), party2: party("party2") };
}

// The conversation with the assistant. Each reply updates the NDA fields through setData.
export function useNdaChat(data: NdaFormData, setData: Dispatch<SetStateAction<NdaFormData>>) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: GREETING }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(conversation: ChatMessage[]) {
    const sent = data;
    setPending(true);
    setError(null);
    try {
      const { reply, fields } = await sendChat(conversation, sent, todayIso());
      setMessages([...conversation, { role: "assistant", content: reply }]);
      setData((current) => applyChanges(current, sent, fields));
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
