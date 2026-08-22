import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/ThemeProvider";
import { EditorAppearanceProvider } from "./components/EditorAppearanceProvider";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <EditorAppearanceProvider>
      <App />
    </EditorAppearanceProvider>
  </ThemeProvider>
);
