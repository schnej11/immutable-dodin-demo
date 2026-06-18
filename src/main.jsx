import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../immutable-dodin-demo.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <div style={{ padding: 32 }}>
      <App />
    </div>
  </StrictMode>
);
