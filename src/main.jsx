import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../immutable-dodin-demo.jsx";

document.body.style.margin = "0";
document.body.style.background = "#080c14";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
