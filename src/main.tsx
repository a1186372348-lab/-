import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TodoPage from "./components/TodoPage";
import SettingsPage from "./components/SettingsPage";
import FocusPage from "./components/FocusPage";
import SpeechBubblePage from "./components/SpeechBubblePage";
import SchedulerPage from "./components/SchedulerPage";

const page = new URLSearchParams(window.location.search).get('page');

function Root() {
  if (page === 'todos') return <TodoPage />;
  if (page === 'settings') return <SettingsPage />;
  if (page === 'focus') return <FocusPage />;
  if (page === 'speech-bubble') return <SpeechBubblePage />;
  if (page === 'scheduler') return <SchedulerPage />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
