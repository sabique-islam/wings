import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { PageTabBar } from "./PageTabBar";

const page = (id: string) => ({ kind: "page" as const, id });

describe("PageTabBar", () => {
  it("selects, closes, and requests a new page", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onNew = vi.fn();
    const { getByTestId, getByLabelText, getByText } = render(
      <PageTabBar
        paneId="main"
        tabs={[
          { tab: page("a"), title: "Alpha" },
          { tab: page("b"), title: "Beta" },
        ]}
        activeKey="page:a"
        onSelect={onSelect}
        onClose={onClose}
        onCloseOthers={vi.fn()}
        onCloseToRight={vi.fn()}
        onMove={vi.fn()}
        onDropTab={vi.fn()}
        onNew={onNew}
      />,
    );

    expect(getByTestId("page-tab-bar")).toBeTruthy();
    fireEvent.click(getByText("Beta"));
    expect(onSelect).toHaveBeenCalledWith(page("b"));
    fireEvent.click(getByLabelText("Close Alpha"));
    expect(onClose).toHaveBeenCalledWith(page("a"));
    fireEvent.click(getByLabelText("New page"));
    expect(onNew).toHaveBeenCalled();
  });

  it("requests a split when a tab is dropped onto another tab", () => {
    const onDropTab = vi.fn();
    const { getAllByTestId } = render(
      <PageTabBar
        paneId="main"
        tabs={[
          { tab: page("a"), title: "Alpha" },
          { tab: page("b"), title: "Beta" },
        ]}
        activeKey="page:a"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseToRight={vi.fn()}
        onMove={vi.fn()}
        onDropTab={onDropTab}
        onNew={vi.fn()}
      />,
    );
    const [, beta] = getAllByTestId("page-tab");
    vi.spyOn(beta, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      top: 0,
      bottom: 30,
      width: 100,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      setData: vi.fn(),
      getData: vi.fn(() =>
        JSON.stringify({ key: "page:a", paneId: "main", index: 0 }),
      ),
      types: ["application/x-wings-page-tab"],
      files: [],
      items: [],
    };
    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(dragOver, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 50 },
    });
    fireEvent(beta, dragOver);
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperties(drop, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 50 },
    });
    fireEvent(beta, drop);
    expect(onDropTab).toHaveBeenCalledWith("page:a", "main", "page:b");
  });
});
