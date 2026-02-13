import { useNavigate } from "react-router-dom";
import AppShell from "./AppShell";
import { getButtonStyle } from "./styles";

function Profile() {
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");
  const navigate = useNavigate();

  return (
    <AppShell>
      <div style={styles.mainContent}>
        <div style={styles.header}>
          <button
            style={styles.backButton}
            onClick={() => navigate("/dashboard")}
          >
            Back to Dashboard
          </button>
          <h2 style={styles.title}>My Profile</h2>
        </div>

        <div style={styles.row}>
          <div style={styles.card}>
            <div style={styles.label}>Username</div>
            <div style={styles.value}>{username || "-"}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Role</div>
            <div style={styles.value}>{role || "-"}</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

const styles = {
  mainContent: {
    padding: "24px",
  },

  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "20px",
  },

  backButton: {
    ...getButtonStyle("cancel"),
    margin: 0,
  },

  title: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#0B3A6E",
    margin: 0,
  },

  row: {
    display: "flex",
    gap: "24px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  card: {
    backgroundColor: "#FFFFFF",
    padding: "20px",
    borderRadius: "6px",
    width: "320px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
  },

  label: {
    fontSize: "13px",
    color: "#555",
    marginBottom: "6px",
  },

  value: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#111827",
  },
};

export default Profile;
