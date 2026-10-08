import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentChat } from "@/components/DocumentChat";
import type { ChatMessage } from "@/lib/api";

const messages: ChatMessage[] = [
  { role: "assistant", content: "Which companies?" },
  { role: "user", content: "Acme and Globex" },
];

function renderChat(props: Partial<Parameters<typeof DocumentChat>[0]> = {}) {
  const onSend = vi.fn();
  const onRetry = vi.fn();
  const view = render(<DocumentChat messages={messages} pending={false} error={null} onSend={onSend} onRetry={onRetry} {...props} />);
  return { onSend, onRetry, ...view };
}

const input = () => screen.getByRole("textbox", { name: "Message" });

describe("DocumentChat", () => {
  it("shows the conversation, labelled by speaker for screen readers", () => {
    renderChat();
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log).toHaveTextContent("Assistant: Which companies?");
    expect(log).toHaveTextContent("You: Acme and Globex");
  });

  it("focuses the message box", () => {
    renderChat();
    expect(input()).toHaveFocus();
  });

  it("sends with Enter and clears the box", async () => {
    const user = userEvent.setup();
    const { onSend } = renderChat();

    await user.type(input(), "Delaware law{Enter}");

    expect(onSend).toHaveBeenCalledWith("Delaware law");
    expect(input()).toHaveValue("");
  });

  it("adds a new line with Shift+Enter", async () => {
    const user = userEvent.setup();
    const { onSend } = renderChat();

    await user.type(input(), "Line 1{Shift>}{Enter}{/Shift}Line 2");

    expect(onSend).not.toHaveBeenCalled();
    expect(input()).toHaveValue("Line 1\nLine 2");
  });

  it("sends with the Send button, but not an empty message", async () => {
    const user = userEvent.setup();
    const { onSend } = renderChat();

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(input(), "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();

    await user.type(input(), "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("   Hello");
  });

  it("shows that the assistant is typing, and doesn't send meanwhile", async () => {
    const user = userEvent.setup();
    const { onSend } = renderChat({ pending: true });

    expect(screen.getByText("Assistant is typing…")).toBeInTheDocument();
    await user.type(input(), "More{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(input()).toHaveValue("More");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("focuses the message box again when the reply arrives", () => {
    const { rerender, onSend, onRetry } = renderChat({ pending: true });
    input().blur();
    rerender(<DocumentChat messages={messages} pending={false} error={null} onSend={onSend} onRetry={onRetry} />);
    expect(input()).toHaveFocus();
  });

  it("shows errors with a Retry button", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderChat({ error: "The AI assistant is unavailable right now. Please try again." });

    expect(screen.getByRole("alert")).toHaveTextContent("The AI assistant is unavailable right now.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("scrolls to the newest message", () => {
    const { rerender, onSend, onRetry } = renderChat();
    const log = screen.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { value: 900, configurable: true });

    rerender(<DocumentChat messages={[...messages, { role: "assistant", content: "Thanks!" }]} pending={false} error={null} onSend={onSend} onRetry={onRetry} />);

    expect(log.scrollTop).toBe(900);
  });
});
