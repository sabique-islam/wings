import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import {
  EDITOR_APPEARANCE_EVENT,
  applyEditorAppearanceCss,
  loadEditorAppearance,
  patchEditorAppearance,
  type EditorAppearance,
} from "@/lib/editorAppearance";

type EditorAppearanceContextValue = {
  appearance: EditorAppearance;
  patch: (next: Partial<EditorAppearance>) => void;
};

const EditorAppearanceContext = createContext<EditorAppearanceContextValue>({
  appearance: loadEditorAppearance(),
  patch: () => {},
});

export function useEditorAppearance(): EditorAppearanceContextValue {
  return useContext(EditorAppearanceContext);
}

export function EditorAppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(loadEditorAppearance);

  useLayoutEffect(() => {
    applyEditorAppearanceCss(appearance);
  }, [appearance]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<EditorAppearance>).detail;
      if (detail) setAppearance(detail);
    };
    window.addEventListener(EDITOR_APPEARANCE_EVENT, onChange);
    return () => window.removeEventListener(EDITOR_APPEARANCE_EVENT, onChange);
  }, []);

  const patch = useCallback((next: Partial<EditorAppearance>) => {
    setAppearance(patchEditorAppearance(next));
  }, []);

  const value = useMemo(() => ({ appearance, patch }), [appearance, patch]);
  return <EditorAppearanceContext.Provider value={value}>{children}</EditorAppearanceContext.Provider>;
}
