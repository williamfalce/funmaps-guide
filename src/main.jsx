import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { Analytics } from "@vercel/analytics/react";
import App from "./App.jsx";
import AdminPanel from "./AdminPanel.jsx";
import Website from "./site/Website.jsx";

const path = window.location.pathname.replace(/\/+$/, "");
const isAdmin = path === "/admin";
// The FunMaps.com website: served on funmaps.com once the domain is switched,
// and at /site on compass.funmaps.com as a preview until then.
const WEBSITE_HOSTS = ["funmaps.com", "www.funmaps.com"];
const isWebsite = !isAdmin && (WEBSITE_HOSTS.includes(window.location.hostname) || path === "/site" || path.startsWith("/site/"));

ReactDOM.createRoot(document.getElementById("root")).render(
  isAdmin ? (
    <AdminPanel />
  ) : isWebsite ? (
    <>
      <Website />
      <Analytics />
    </>
  ) : (
    <>
      <App />
      <Analytics />
    </>
  )
);

// Register the PWA service worker for the traveler-facing app only — not on
// /admin, since offline caching of admin data isn't something we want.
if (!isAdmin && !isWebsite && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
