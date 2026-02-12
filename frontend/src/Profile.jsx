import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "./AppShell";
import { getButtonStyle } from "./styles";
import { API_BASE } from "./api";

function Profile() {
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");
  const navigate = useNavigate();

  const [customerName, setCustomerName] = useState("");
  const [customerPassword, setCustomerPassword] = useState("");
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);
  const [customerMessage, setCustomerMessage] = useState(null);
  const [customerError, setCustomerError] = useState(null);

  const [newReviewerName, setNewReviewerName] = useState("");
  const [newReviewerPassword, setNewReviewerPassword] = useState("");
  const [isSubmittingReviewer, setIsSubmittingReviewer] = useState(false);
  const [reviewerMessage, setReviewerMessage] = useState(null);
  const [reviewerError, setReviewerError] = useState(null);

  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);
  const [adminMessage, setAdminMessage] = useState(null);
  const [adminError, setAdminError] = useState(null);

  const handleCreateCustomer = async () => {
    setCustomerMessage(null);
    setCustomerError(null);

    if (!customerName.trim() || !customerPassword.trim()) {
      setCustomerError("Please enter both customer name and password.");
      return;
    }

    setIsSubmittingCustomer(true);
    try {
      const res = await fetch(`${API_BASE}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role || "",
          "x-username": username || "",
        },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          password: customerPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setCustomerError(data.message || "Failed to create customer.");
      } else {
        setCustomerMessage(
          `Customer "${data.customer?.customer_name}" created with code ${data.customer?.customer_code}.`
        );
        setCustomerName("");
        setCustomerPassword("");
      }
    } catch (err) {
      console.error("Create customer error:", err);
      setCustomerError("Failed to create customer. Please try again.");
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleCreateReviewer = async () => {
    setReviewerMessage(null);
    setReviewerError(null);

    if (!newReviewerName.trim() || !newReviewerPassword.trim()) {
      setReviewerError("Please enter both username and password.");
      return;
    }

    setIsSubmittingReviewer(true);
    try {
      const res = await fetch(`${API_BASE}/users/reviewer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role || "",
          "x-username": username || "",
        },
        body: JSON.stringify({
          username: newReviewerName.trim(),
          password: newReviewerPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setReviewerError(data.message || "Failed to create reviewer.");
      } else {
        setReviewerMessage(`Reviewer "${newReviewerName.trim()}" created successfully.`);
        setNewReviewerName("");
        setNewReviewerPassword("");
      }
    } catch (err) {
      console.error("Create reviewer error:", err);
      setReviewerError("Failed to create reviewer. Please try again.");
    } finally {
      setIsSubmittingReviewer(false);
    }
  };

  const handleCreateAdmin = async () => {
    setAdminMessage(null);
    setAdminError(null);

    if (!newAdminName.trim() || !newAdminPassword.trim()) {
      setAdminError("Please enter both username and password.");
      return;
    }

    setIsSubmittingAdmin(true);
    try {
      const res = await fetch(`${API_BASE}/users/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role || "",
          "x-username": username || "",
        },
        body: JSON.stringify({
          username: newAdminName.trim(),
          password: newAdminPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAdminError(data.message || "Failed to create admin.");
      } else {
        setAdminMessage(`Admin "${newAdminName.trim()}" created successfully.`);
        setNewAdminName("");
        setNewAdminPassword("");
      }
    } catch (err) {
      console.error("Create admin error:", err);
      setAdminError("Failed to create admin. Please try again.");
    } finally {
      setIsSubmittingAdmin(false);
    }
  };

  return (
    <AppShell>
      <div style={styles.mainContent}>
        <h2 style={styles.title}>My Profile</h2>

        <div style={styles.row}>
          <div style={styles.card}>
            <div style={styles.label}>Username</div>
            <div style={styles.value}>{username || "-"}</div>
          </div>

          {(role === "SUPER_ADMIN" || role === "ADMIN" || role === "REVIEWER") && (
            <div style={styles.card}>
              <div style={styles.subTitle}>Create New Customer</div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={styles.input}
                  placeholder="e.g., Arun"
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Password</label>
                <input
                  type="password"
                  value={customerPassword}
                  onChange={(e) => setCustomerPassword(e.target.value)}
                  style={styles.input}
                  placeholder="Enter password"
                />
              </div>

              {customerError && <div style={styles.error}>{customerError}</div>}
              {customerMessage && <div style={styles.success}>{customerMessage}</div>}

              <button
                style={{
                  ...getButtonStyle("save"),
                  marginTop: "10px",
                  opacity: isSubmittingCustomer ? 0.7 : 1,
                  cursor: isSubmittingCustomer ? "not-allowed" : "pointer",
                }}
                onClick={handleCreateCustomer}
                disabled={isSubmittingCustomer}
              >
                {isSubmittingCustomer ? "Creating..." : "Create Customer"}
              </button>
            </div>
          )}

          {role === "SUPER_ADMIN" && (
            <div style={styles.card}>
              <div style={styles.subTitle}>Create New Reviewer</div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Reviewer Username</label>
                <input
                  type="text"
                  value={newReviewerName}
                  onChange={(e) => setNewReviewerName(e.target.value)}
                  style={styles.input}
                  placeholder="e.g., reviewer2"
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Password</label>
                <input
                  type="password"
                  value={newReviewerPassword}
                  onChange={(e) => setNewReviewerPassword(e.target.value)}
                  style={styles.input}
                  placeholder="Enter password"
                />
              </div>

              {reviewerError && <div style={styles.error}>{reviewerError}</div>}
              {reviewerMessage && <div style={styles.success}>{reviewerMessage}</div>}

              <button
                style={{
                  ...getButtonStyle("save"),
                  marginTop: "10px",
                  opacity: isSubmittingReviewer ? 0.7 : 1,
                  cursor: isSubmittingReviewer ? "not-allowed" : "pointer",
                }}
                onClick={handleCreateReviewer}
                disabled={isSubmittingReviewer}
              >
                {isSubmittingReviewer ? "Creating..." : "Create Reviewer"}
              </button>
            </div>
          )}

          {(role === "SUPER_ADMIN" || role === "REVIEWER") && (
            <div style={styles.card}>
              <div style={styles.subTitle}>Create New Admin</div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Admin Username</label>
                <input
                  type="text"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  style={styles.input}
                  placeholder="e.g., admin2"
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Password</label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  style={styles.input}
                  placeholder="Enter password"
                />
              </div>

              {adminError && <div style={styles.error}>{adminError}</div>}
              {adminMessage && <div style={styles.success}>{adminMessage}</div>}

              <button
                style={{
                  ...getButtonStyle("save"),
                  marginTop: "10px",
                  opacity: isSubmittingAdmin ? 0.7 : 1,
                  cursor: isSubmittingAdmin ? "not-allowed" : "pointer",
                }}
                onClick={handleCreateAdmin}
                disabled={isSubmittingAdmin}
              >
                {isSubmittingAdmin ? "Creating..." : "Create Admin"}
              </button>
            </div>
          )}

          {role === "SUPER_ADMIN" && (
            <div style={styles.card}>
              <div style={styles.subTitle}>Create New Super Admin</div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Super Admin Username</label>
                <input
                  type="text"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  style={styles.input}
                  placeholder="e.g., superadmin2"
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Password</label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  style={styles.input}
                  placeholder="Enter password"
                />
              </div>

              {adminError && <div style={styles.error}>{adminError}</div>}
              {adminMessage && <div style={styles.success}>{adminMessage}</div>}

              <button
                style={{
                  ...getButtonStyle("save"),
                  marginTop: "10px",
                  opacity: isSubmittingAdmin ? 0.7 : 1,
                  cursor: isSubmittingAdmin ? "not-allowed" : "pointer",
                }}
                onClick={async () => {
                  // Reuse handleCreateAdmin logic but hit /users/superadmin
                  setAdminMessage(null);
                  setAdminError(null);

                  if (!newAdminName.trim() || !newAdminPassword.trim()) {
                    setAdminError("Please enter both username and password.");
                    return;
                  }

                  setIsSubmittingAdmin(true);
                  try {
                    const res = await fetch(`${API_BASE}/users/superadmin`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "x-user-role": role || "",
                        "x-username": username || "",
                      },
                      body: JSON.stringify({
                        username: newAdminName.trim(),
                        password: newAdminPassword.trim(),
                      }),
                    });

                    const data = await res.json().catch(() => ({}));

                    if (!res.ok) {
                      setAdminError(data.message || "Failed to create superadmin.");
                    } else {
                      setAdminMessage(`Super Admin "${newAdminName.trim()}" created successfully.`);
                      setNewAdminName("");
                      setNewAdminPassword("");
                    }
                  } catch (err) {
                    console.error("Create superadmin error:", err);
                    setAdminError("Failed to create superadmin. Please try again.");
                  } finally {
                    setIsSubmittingAdmin(false);
                  }
                }}
                disabled={isSubmittingAdmin}
              >
                {isSubmittingAdmin ? "Creating..." : "Create Super Admin"}
              </button>
            </div>
          )}
        </div>

        <button
          style={{ ...getButtonStyle("cancel"), marginTop: "20px" }}
          onClick={() => navigate(-1)}
        >
          Back
        </button>
      </div>
    </AppShell>
  );
}

const styles = {
  mainContent: {
    padding: "24px",
  },

  title: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#0B3A6E",
    marginBottom: "20px",
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

  subTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#0B3A6E",
    marginBottom: "12px",
  },

  fieldGroup: {
    marginBottom: "10px",
  },

  fieldLabel: {
    fontSize: "13px",
    color: "#555",
    marginBottom: "4px",
    display: "block",
  },

  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    fontSize: "14px",
    boxSizing: "border-box",
  },

  error: {
    marginTop: "6px",
    fontSize: "12px",
    color: "#d32f2f",
  },

  success: {
    marginTop: "6px",
    fontSize: "12px",
    color: "#2e7d32",
  },
};

export default Profile;
