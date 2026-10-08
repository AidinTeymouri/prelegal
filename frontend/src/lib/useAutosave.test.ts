import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveDraft, type DraftContent, type SavedDraft } from "@/lib/api";
import { saveNow, useAutosave, whenSaved } from "@/lib/useAutosave";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), saveDraft: vi.fn() }));

const ID = "2f1c8a2e-1b7d-4c3e-9a51-6d0e2b4f7a90";
const content = (text: string): DraftContent => ({ document: null, fields: null, messages: [{ role: "user", content: text }] });

function setup(initial: DraftContent, skip = false, saved?: DraftContent) {
  return renderHook(({ content, skip }) => useAutosave(ID, content, skip, saved), { initialProps: { content: initial, skip } });
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(saveDraft).mockResolvedValue({} as SavedDraft);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(saveDraft).mockReset();
  });

  it("saves once the content stops changing", async () => {
    const { result, rerender } = setup(content("a"));
    rerender({ content: content("ab"), skip: false });
    rerender({ content: content("abc"), skip: false });
    expect(saveDraft).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(800));

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith(ID, content("abc"));
    expect(result.current.status).toBe("saved");
  });

  it("does not save while skipped, or what the server already has", async () => {
    setup(content("a"), true);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    setup(content("b"), false, content("b"));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("saves changes made during a save right after it, one save at a time", async () => {
    let finish!: () => void;
    vi.mocked(saveDraft).mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({} as SavedDraft))));
    const { result, rerender } = setup(content("a"));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.status).toBe("saving");

    rerender({ content: content("ab"), skip: false });
    await act(() => vi.advanceTimersByTimeAsync(800)); // a second save doesn't start while the first runs
    expect(saveDraft).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft).toHaveBeenLastCalledWith(ID, content("ab"));
    expect(result.current.status).toBe("saved");
  });

  it("reports a failed save and saves again on retry", async () => {
    vi.mocked(saveDraft).mockRejectedValueOnce(new Error("offline"));
    const { result } = setup(content("a"));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.status).toBe("error");

    await act(() => result.current.retry());
    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("saves the open editor's changes on request, e.g. before signing out", async () => {
    const { unmount } = setup(content("a"));
    await expect(act(() => saveNow())).resolves.toBe(true);
    expect(saveDraft).toHaveBeenCalledWith(ID, content("a"));

    vi.mocked(saveDraft).mockRejectedValueOnce(new Error("offline"));
    const { rerender } = setup(content("b"));
    rerender({ content: content("bc"), skip: false });
    await expect(act(() => saveNow())).resolves.toBe(false);
    unmount();
  });

  it("saves straight away when closed, and the documents list can wait for it", async () => {
    const { unmount } = setup(content("a"));
    unmount();
    expect(saveDraft).toHaveBeenCalledWith(ID, content("a"));
    await whenSaved();
  });
});
