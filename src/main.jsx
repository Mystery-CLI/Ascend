// Must be first: installs the console filter before the Base44 SDK loads and
// fires its anonymous-user probe. See the file for why.
import "@/lib/quiet-console";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App.jsx";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

// Registered only so Chrome recognizes the app as installable (its
// automatic "Install app" prompt requires an active service worker); the
// worker itself does nothing, see public/sw.js.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
