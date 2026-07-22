// Must be first: installs the console filter before the Base44 SDK loads and
// fires its anonymous-user probe. See the file for why.
import "@/lib/quiet-console";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App.jsx";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
