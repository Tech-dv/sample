import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "./AppShell";
import { API_BASE } from "./api";
import { checkSessionOnLoad } from "./utils/sessionUtils";
import DeleteConfirmPopup from "./components/DeleteConfirmPopup";

function DropdownManagement() {
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");
  const navigate = useNavigate();

  // Redirect if not reviewer
  useEffect(() => {
    if (!checkSessionOnLoad()) {
      navigate("/");
      return;
    }
    if (role !== "REVIEWER") {
      navigate("/dashboard");
    }
  }, [role, navigate]);

  // Dropdown options state
  const [commodities, setCommodities] = useState([]);
  const [wagonTypes, setWagonTypes] = useState([]);
  const [rakeTypes, setRakeTypes] = useState([]);
  const [newCommodity, setNewCommodity] = useState("");
  const [newWagonType, setNewWagonType] = useState("");
  const [newRakeType, setNewRakeType] = useState("");
  const [dropdownMessage, setDropdownMessage] = useState(null);
  const [dropdownError, setDropdownError] = useState(null);

  // Delete confirmation popup state
  const [deletePopup, setDeletePopup] = useState({
    open: false,
    id: null,
    type: null,
    name: null,
  });

  // Fetch dropdown options on mount
  useEffect(() => {
    if (role === "REVIEWER") {
      fetchDropdownOptions();
    }
  }, [role]);

  const fetchDropdownOptions = async () => {
    try {
      const [commoditiesRes, wagonTypesRes, rakeTypesRes] = await Promise.all([
        fetch(`${API_BASE}/dropdown-options?type=commodity`, {
          headers: { "x-user-role": role || "" },
        }),
        fetch(`${API_BASE}/dropdown-options?type=wagon_type`, {
          headers: { "x-user-role": role || "" },
        }),
        fetch(`${API_BASE}/dropdown-options?type=rake_type`, {
          headers: { "x-user-role": role || "" },
        }),
      ]);

      if (commoditiesRes.ok) {
        const data = await commoditiesRes.json();
        setCommodities(data);
      } else {
        console.error("Failed to fetch commodities:", commoditiesRes.status, await commoditiesRes.text().catch(() => ""));
      }
      
      if (wagonTypesRes.ok) {
        const data = await wagonTypesRes.json();
        setWagonTypes(data);
      } else {
        console.error("Failed to fetch wagon types:", wagonTypesRes.status, await wagonTypesRes.text().catch(() => ""));
      }
      
      if (rakeTypesRes.ok) {
        const data = await rakeTypesRes.json();
        setRakeTypes(data);
      } else {
        console.error("Failed to fetch rake types:", rakeTypesRes.status, await rakeTypesRes.text().catch(() => ""));
      }
    } catch (err) {
      console.error("Failed to fetch dropdown options:", err);
      setDropdownError("Failed to load dropdown options. Please refresh the page.");
    }
  };

  const handleCreateDropdownOption = async (type, value, setValue) => {
    setDropdownMessage(null);
    setDropdownError(null);

    if (!value || !value.trim()) {
      setDropdownError(`Please enter a ${type.replace('_', ' ')} value.`);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/dropdown-options`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role || "",
          "x-username": username || "",
        },
        body: JSON.stringify({
          option_type: type,
          option_value: value.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDropdownError(data.message || `Failed to create ${type.replace('_', ' ')}.`);
      } else {
        setDropdownMessage(`${type.replace('_', ' ')} "${value.trim()}" created successfully.`);
        setValue("");
        fetchDropdownOptions(); // Refresh the list
      }
    } catch (err) {
      console.error(`Create ${type} error:`, err);
      setDropdownError(`Failed to create ${type.replace('_', ' ')}. Please try again.`);
    }
  };

  const handleDeleteDropdownOption = (id, type, name) => {
    setDeletePopup({
      open: true,
      id,
      type,
      name,
    });
  };

  const confirmDelete = async () => {
    const { id, type } = deletePopup;
    
    try {
      const res = await fetch(`${API_BASE}/dropdown-options/${id}`, {
        method: "DELETE",
        headers: {
          "x-user-role": role || "",
          "x-username": username || "",
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDropdownError(data.message || `Failed to delete ${type.replace('_', ' ')}.`);
      } else {
        setDropdownMessage(`${type.replace('_', ' ')} deleted successfully.`);
        fetchDropdownOptions(); // Refresh the list
      }
    } catch (err) {
      console.error(`Delete ${type} error:`, err);
      setDropdownError(`Failed to delete ${type.replace('_', ' ')}. Please try again.`);
    } finally {
      setDeletePopup({ open: false, id: null, type: null, name: null });
    }
  };

  const cancelDelete = () => {
    setDeletePopup({ open: false, id: null, type: null, name: null });
  };

  // Don't render if not reviewer
  if (role !== "REVIEWER") {
    return null;
  }

  return (
    <AppShell>
      <div style={styles.mainContent}>
        <div style={styles.headerSection}>
          <div style={styles.headerTop}>
            <h2 style={styles.title}>Dropdown Options Management</h2>
            <button
              style={styles.backButton}
              onClick={() => navigate("/dashboard")}
            >
              ← Back to Dashboard
            </button>
          </div>
          <p style={styles.subtitle}>Manage dropdown options for commodities, wagon types, and rake types</p>
        </div>

        {/* Dropdown Options Management Section */}
        <div style={styles.sectionContainer}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Dropdown Options</h3>
          </div>
          
          {dropdownError && <div style={styles.alertError}>{dropdownError}</div>}
          {dropdownMessage && <div style={styles.alertSuccess}>{dropdownMessage}</div>}

          <div style={styles.optionsGrid}>
            {/* Manage Commodities */}
            <div style={styles.optionCard}>
              <div style={styles.optionCardHeader}>
                <span style={styles.optionTitle}>Commodities</span>
              </div>
              
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Add New Commodity</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={newCommodity}
                    onChange={(e) => setNewCommodity(e.target.value)}
                    style={styles.input}
                    placeholder="e.g., Wheat"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateDropdownOption("commodity", newCommodity, setNewCommodity);
                      }
                    }}
                  />
                  <button
                    style={styles.addButton}
                    onClick={() => handleCreateDropdownOption("commodity", newCommodity, setNewCommodity)}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div style={styles.listContainer}>
                <div style={styles.listLabel}>Existing Items:</div>
                {commodities.length === 0 ? (
                  <div style={styles.emptyState}>No commodities added yet</div>
                ) : (
                  <div style={styles.list}>
                    {commodities.map((item) => (
                      <div key={item.id} style={styles.listItem}>
                        <span style={styles.listItemText}>{item.option_value}</span>
                        <button
                          onClick={() => handleDeleteDropdownOption(item.id, "commodity", item.option_value)}
                          style={styles.deleteButton}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Manage Wagon Types */}
            <div style={styles.optionCard}>
              <div style={styles.optionCardHeader}>
                <span style={styles.optionTitle}>Wagon Types</span>
              </div>
              
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Add New Wagon Type</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={newWagonType}
                    onChange={(e) => setNewWagonType(e.target.value)}
                    style={styles.input}
                    placeholder="e.g., HL"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateDropdownOption("wagon_type", newWagonType, setNewWagonType);
                      }
                    }}
                  />
                  <button
                    style={styles.addButton}
                    onClick={() => handleCreateDropdownOption("wagon_type", newWagonType, setNewWagonType)}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div style={styles.listContainer}>
                <div style={styles.listLabel}>Existing Items:</div>
                {wagonTypes.length === 0 ? (
                  <div style={styles.emptyState}>No wagon types added yet</div>
                ) : (
                  <div style={styles.list}>
                    {wagonTypes.map((item) => (
                      <div key={item.id} style={styles.listItem}>
                        <span style={styles.listItemText}>{item.option_value}</span>
                        <button
                          onClick={() => handleDeleteDropdownOption(item.id, "wagon_type", item.option_value)}
                          style={styles.deleteButton}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Manage Rake Types */}
            <div style={styles.optionCard}>
              <div style={styles.optionCardHeader}>
                <span style={styles.optionTitle}>Rake Types</span>
              </div>
              
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Add New Rake Type</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={newRakeType}
                    onChange={(e) => setNewRakeType(e.target.value)}
                    style={styles.input}
                    placeholder="e.g., Full rake"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateDropdownOption("rake_type", newRakeType, setNewRakeType);
                      }
                    }}
                  />
                  <button
                    style={styles.addButton}
                    onClick={() => handleCreateDropdownOption("rake_type", newRakeType, setNewRakeType)}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div style={styles.listContainer}>
                <div style={styles.listLabel}>Existing Items:</div>
                {rakeTypes.length === 0 ? (
                  <div style={styles.emptyState}>No rake types added yet</div>
                ) : (
                  <div style={styles.list}>
                    {rakeTypes.map((item) => (
                      <div key={item.id} style={styles.listItem}>
                        <span style={styles.listItemText}>{item.option_value}</span>
                        <button
                          onClick={() => handleDeleteDropdownOption(item.id, "rake_type", item.option_value)}
                          style={styles.deleteButton}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DeleteConfirmPopup
          open={deletePopup.open}
          onClose={cancelDelete}
          onYes={confirmDelete}
          onNo={cancelDelete}
          message={deletePopup.name ? `Are you sure you want to delete this ${deletePopup.type?.replace('_', ' ')}: "${deletePopup.name}"?` : `Are you sure you want to delete this ${deletePopup.type?.replace('_', ' ')}?`}
        />
      </div>
    </AppShell>
  );
}

const styles = {
  mainContent: {
    padding: "32px",
    maxWidth: "1400px",
    margin: "0 auto",
    backgroundColor: "#FFFFFF",
    minHeight: "100vh",
  },

  headerSection: {
    marginBottom: "32px",
  },

  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },

  title: {
    fontSize: "32px",
    fontWeight: 700,
    color: "#0B3A6E",
    marginBottom: "0",
    letterSpacing: "-0.5px",
  },

  subtitle: {
    fontSize: "16px",
    color: "#6b7280",
    marginBottom: "0",
  },

  sectionContainer: {
    marginBottom: "40px",
    backgroundColor: "#FFFFFF",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    border: "1px solid #e5e7eb",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "24px",
    paddingBottom: "16px",
    borderBottom: "2px solid #e5e7eb",
  },

  sectionTitle: {
    fontSize: "22px",
    fontWeight: 600,
    color: "#0B3A6E",
    margin: "0",
  },

  fieldGroup: {
    marginBottom: "18px",
  },

  fieldLabel: {
    fontSize: "14px",
    fontWeight: 500,
    color: "#374151",
    marginBottom: "8px",
    display: "block",
  },

  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "15px",
    boxSizing: "border-box",
    transition: "all 0.2s",
    backgroundColor: "#FFFFFF",
  },

  alertError: {
    marginTop: "12px",
    padding: "12px 16px",
    fontSize: "14px",
    color: "#dc2626",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
  },

  alertSuccess: {
    marginTop: "12px",
    padding: "12px 16px",
    fontSize: "14px",
    color: "#16a34a",
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "6px",
  },

  optionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "24px",
  },

  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: "8px",
    padding: "20px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    transition: "all 0.2s",
  },

  optionCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "18px",
    paddingBottom: "12px",
    borderBottom: "1px solid #e5e7eb",
  },

  optionTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#0B3A6E",
  },

  addButton: {
    padding: "10px 20px",
    whiteSpace: "nowrap",
    borderRadius: "6px",
    border: "none",
    fontSize: "14px",
    fontWeight: 600,
    backgroundColor: "#0B3A6E",
    color: "#FFFFFF",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 1px 3px rgba(11, 58, 110, 0.2)",
  },

  listContainer: {
    marginTop: "16px",
    maxHeight: "280px",
    overflowY: "auto",
    paddingRight: "4px",
  },

  listLabel: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#6b7280",
    marginBottom: "10px",
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    backgroundColor: "#f9fafb",
    borderRadius: "6px",
    border: "1px solid #e5e7eb",
    transition: "all 0.2s",
  },

  listItemText: {
    fontSize: "14px",
    color: "#374151",
    fontWeight: 500,
  },

  deleteButton: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
    padding: "4px 8px",
    borderRadius: "4px",
    transition: "all 0.2s",
    opacity: 0.7,
  },

  emptyState: {
    fontSize: "13px",
    color: "#9ca3af",
    marginTop: "12px",
    fontStyle: "italic",
    textAlign: "center",
    padding: "16px",
  },

  backButton: {
    padding: "10px 20px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: "#FFFFFF",
    color: "#374151",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
};

export default DropdownManagement;
