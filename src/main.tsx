import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TodoPage from "./components/TodoPage";

const isTodoPage = new URLSearchParams(window.location.search).get('page') === 'todos';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isTodoPage ? <TodoPage /> : <App />}
  </React.StrictMode>,
);
