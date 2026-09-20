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
});
