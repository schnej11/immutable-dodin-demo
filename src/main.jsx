import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./vx.css";
import App from "../immutable-dodin-demo.jsx";

document.documentElement.setAttribute("data-theme", "dark");
document.body.style.margin = "0";
document.body.style.background = "#1E1E1E";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
