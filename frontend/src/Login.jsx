import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "./api";
import { storeLoginTimestamp } from "./utils/sessionUtils";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState(""); // "INVALID_CREDENTIALS" or "INACTIVE_ACCOUNT"

  const navigate = useNavigate();

  const handleLogin = async () => {
    setError("");
    setErrorType("");

    if (!username || !password) {
      setError("Username and password required");
      setErrorType("INVALID_CREDENTIALS");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || "Invalid username or password");
        setErrorType(errorData.errorType || "INVALID_CREDENTIALS");
        return;
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
      setErrorType("INVALID_CREDENTIALS");
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
          <div style={passwordInputContainer}>
          <input
              id="password-input"
              type={showPassword ? "text" : "password"}
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
              style={passwordInputStyle}
          />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={eyeButtonStyle}
            >
              <svg
                style={eyeIconStyle}
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {!showPassword ? (
                  <>
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" x2="22" y1="2" y2="22" />
                  </>
                ) : (
                  <>
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        <button onClick={handleLogin} style={buttonStyle}>
          Login
        </button>

        {error && (
          <p style={errorType === "INACTIVE_ACCOUNT" ? warningStyle : errorStyle}>
            {error}
          </p>
        )}
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
  padding: "7px",
  borderRadius: "4px",
  border: "1px solid #ccc",
  outline: "none",
  boxSizing: "border-box",
};

const passwordInputContainer = {
  position: "relative",
  width: "100%",
};

const passwordInputStyle = {
  width: "100%",
  padding: "7px 32px 7px 7px",
  borderRadius: "4px",
  border: "1px solid #ccc",
  outline: "none",
  boxSizing: "border-box",
};

const eyeButtonStyle = {
  position: "absolute",
  top: "50%",
  right: "8px",
  transform: "translateY(-50%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 20,
  padding: "4px",
  cursor: "pointer",
  color: "#666",
  background: "transparent",
  border: "none",
  outline: "none",
};

const eyeIconStyle = {
  width: "18px",
  height: "18px",
  flexShrink: 0,
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
  color: "#dc2626",
  fontSize: "13px",
  fontWeight: "500",
};

const warningStyle = {
  marginTop: "10px",
  color: "#d97706",
  fontSize: "13px",
  fontWeight: "500",
  backgroundColor: "#fef3c7",
  padding: "10px",
  borderRadius: "6px",
  border: "1px solid #fbbf24",
};

export default Login;
