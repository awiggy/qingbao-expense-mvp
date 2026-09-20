import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AgentStudio from "./AgentStudio";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/agent") ? <AgentStudio /> : <App />}
  </React.StrictMode>,
);
