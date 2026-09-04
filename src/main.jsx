import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AdminPanel from "./AdminPanel.jsx";

const isAdmin = window.location.pathname.replace(/\/+$/, "") === "/admin";

ReactDOM.createRoot(document.getElementById("root")).render(isAdmin ? <AdminPanel /> : <App />);
