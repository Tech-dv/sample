import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "./api";
import { storeLoginTimestamp } from "./utils/sessionUtils";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleLogin = async () => {
    setError("");

    if (!username || !password) {
      setError("Username and password required");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });


      if (!response.ok) {
        throw new Error("Invalid credentials");
      }

      const data = await response.json();

      localStorage.setItem("userId", data.id);
      localStorage.setItem("username", data.username);
      localStorage.setItem("role", data.role);

      if (data.customer_id) {
        localStorage.setItem("customerId", data.customer_id);
        localStorage.setItem("customerName", data.customer_name);
      }

      // Store login timestamp for session management
      storeLoginTimestamp();

      navigate("/dashboard");
    } catch (err) {
      setError("Invalid username or password");
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Sack Counting System</h2>
        <p style={subtitleStyle}>Login to continue</p>

        <div style={fieldGroup}>
          <label style={labelStyle}>Username</label>
          <input
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </div>

        <button onClick={handleLogin} style={buttonStyle}>
          Login
        </button>

        {error && <p style={errorStyle}>{error}</p>}
      </div>
    </div>
  );
}

/* ================= STYLES ================= */

const pageStyle = {
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#f5f7fa",
};

const cardStyle = {
  width: "320px",
  padding: "25px",
  backgroundColor: "white",
  borderRadius: "8px",
  boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
  textAlign: "center",
};

const titleStyle = {
  marginBottom: "5px",
};

const subtitleStyle = {
  marginBottom: "20px",
  color: "#666",
  fontSize: "14px",
};

/* 🔽 Reduced width container */
const fieldGroup = {
  textAlign: "left",
  marginBottom: "15px",
  width: "75%",              // ✅ reduced width
  marginLeft: "auto",
  marginRight: "auto",
};

const labelStyle = {
  display: "block",
  marginBottom: "5px",
  fontSize: "13px",
  fontWeight: "bold",
};

const inputStyle = {
  width: "100%",
  padding: "7px",            // slightly smaller
  borderRadius: "4px",
  border: "1px solid #ccc",
  outline: "none",
};

const buttonStyle = {
  width: "85%",              // match input width
  padding: "10px",
  marginTop: "15px",
  backgroundColor: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: "bold",
};

const errorStyle = {
  marginTop: "10px",
  color: "red",
  fontSize: "13px",
};

export default Login;
