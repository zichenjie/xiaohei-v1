import React from "react";
import { createRoot } from "react-dom/client";
import { SettingsApp } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>
);
