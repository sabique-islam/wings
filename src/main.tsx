import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/ThemeProvider";
import { EditorAppearanceProvider } from "./components/EditorAppearanceProvider";
import { ImageLightboxHost } from "./components/ImageLightboxHost";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <EditorAppearanceProvider>
      <App />
      <ImageLightboxHost />
    </EditorAppearanceProvider>
  </ThemeProvider>
);
