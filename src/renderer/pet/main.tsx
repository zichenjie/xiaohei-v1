import React from "react";
import { createRoot } from "react-dom/client";
import { PetApp } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PetApp />
  </React.StrictMode>
);
