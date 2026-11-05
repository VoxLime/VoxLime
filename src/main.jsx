
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./style.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("VoxLime Error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: "#090812",
          color: "#fff",
          minHeight: "100vh",
          padding: "30px",
          fontFamily: "Arial"
        }}>
          <h2 style={{color:"#ff7777"}}>VoxLime Error</h2>
          <pre style={{whiteSpace:"pre-wrap",color:"#a3e635"}}>
            {this.state.error.toString()}
          </pre>
          <p>এই Error Message আমাকে পাঠাও।</p>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
