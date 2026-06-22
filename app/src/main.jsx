import React, { Component } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Prism render failed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="fatal-error">
          <h1>页面加载失败</h1>
          <p>请刷新页面。如果问题仍然存在，请退出登录后重试。</p>
          <button onClick={() => window.location.reload()}>重新加载</button>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>,
);
