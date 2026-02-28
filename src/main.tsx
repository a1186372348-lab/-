import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TodoPage from "./components/TodoPage";
import SettingsPage from "./components/SettingsPage";

const page = new URLSearchParams(window.location.search).get('page');

function Root() {
  if (page === 'todos') return <TodoPage />;
  if (page === 'settings') return <SettingsPage />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
