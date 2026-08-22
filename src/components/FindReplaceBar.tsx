import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, Search, X } from "@/lib/icons";
import {
  findReplaceKey,
  readFindReplaceRevision,
  subscribeFindReplace,
} from "./BlockEditor/FindReplaceExtension";
import { wouldEmptyReplaceAll, type FindReplaceState } from "./BlockEditor/findReplace";

interface Props {
  editor: Editor;
  editable: boolean;
}

export function FindReplaceBar({ editor, editable }: Props) {
  const queryRef = useRef<HTMLInputElement>(null);
  const [replacement, setReplacement] = useState("");
  const [blocked, setBlocked] = useState(false);
  useSyncExternalStore(subscribeFindReplace, readFindReplaceRevision, readFindReplaceRevision);

  const state = (findReplaceKey.getState(editor.state) as FindReplaceState | undefined) ?? null;

  useEffect(() => {
    if (!state?.open) return;
    queryRef.current?.focus();
    queryRef.current?.select();
  }, [state?.open, state?.focusNonce]);

  if (!state?.open) return null;

  const count = state.matches.length;
  const label = count === 0 ? "No matches" : `${state.active + 1} of ${count}`;

  const onFindKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      editor.commands.findClose();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) editor.commands.findPrev();
      else editor.commands.findNext();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g") {
      event.preventDefault();
      if (event.shiftKey) editor.commands.findPrev();
      else editor.commands.findNext();
    }
  };

  const replaceOne = () => {
    setBlocked(false);
    editor.commands.findReplaceCurrent(replacement);
  };

  const replaceAll = () => {
    if (
      wouldEmptyReplaceAll(editor.state.doc, state.query, replacement, state.caseSensitive)
    ) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    editor.commands.findReplaceAll(replacement);
  };

  return (
    <div className="find-replace-bar" data-testid="find-replace-bar" role="search">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={queryRef}
        data-testid="find-query"
        className="find-replace-input"
        value={state.query}
        placeholder="Find"
        aria-label="Find in page"
        onChange={(event) => {
          setBlocked(false);
          editor.commands.findSetQuery(event.target.value);
        }}
        onKeyDown={onFindKeyDown}
      />
      <span className="find-replace-count" data-testid="find-count">
        {state.query ? label : ""}
      </span>
      <button
        type="button"
        className="find-replace-btn"
        data-testid="find-prev"
        title="Previous"
        aria-label="Previous match"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.commands.findPrev()}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="find-replace-btn"
        data-testid="find-next"
        title="Next"
        aria-label="Next match"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.commands.findNext()}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`find-replace-btn${state.caseSensitive ? " is-on" : ""}`}
        data-testid="find-case"
        title="Match case"
        aria-label="Match case"
        aria-pressed={state.caseSensitive}
        onClick={() => editor.commands.findToggleCase()}
      >
        Aa
      </button>
      {editable && (
        <>
          <input
            data-testid="find-replace-input"
            className="find-replace-input"
            value={replacement}
            placeholder="Replace"
            aria-label="Replace with"
            onChange={(event) => {
              setBlocked(false);
              setReplacement(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                replaceOne();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                editor.commands.findClose();
              }
            }}
          />
          <button
            type="button"
            className="find-replace-text-btn"
            data-testid="find-replace-one"
            onClick={replaceOne}
          >
            Replace
          </button>
          <button
            type="button"
            className="find-replace-text-btn"
            data-testid="find-replace-all"
            onClick={replaceAll}
          >
            All
          </button>
        </>
      )}
      <button
        type="button"
        className="find-replace-btn"
        data-testid="find-close"
        title="Close"
        aria-label="Close find"
        onClick={() => editor.commands.findClose()}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {blocked && (
        <p className="find-replace-blocked" data-testid="find-replace-blocked" role="alert">
          Replace all would clear this page
        </p>
      )}
    </div>
  );
}
