import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "./AppShell";
import { API_BASE } from "./api";
import { checkSessionOnLoad } from "./utils/sessionUtils";
import SuccessPopup from "./components/SuccessPopup";
import CancelPopup from "./components/CancelPopup";
import IconButton from "./components/IconButton";
import WarningPopup from "./components/WarningPopup";
import { idToUrlParam } from "./utils/trainIdUtils";

/* ================= MAIN COMPONENT ================= */
export default function TaskView() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const reviewerUsername = localStorage.getItem("username");

  const [activeTab, setActiveTab] = useState("open"); // open, assigned, completed
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [warning, setWarning] = useState({ open: false, message: "", title: "Warning" });
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);

  /* ================= FETCH TASKS ================= */
  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reviewer/tasks?tab=${activeTab}`, {
        headers: {
          "x-user-role": role,
          "x-reviewer-username": reviewerUsername,
        },
      });
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check session validity on mount
    if (!checkSessionOnLoad()) {
      navigate("/");
      return;
    }

    fetchTasks();
    // Refresh every 30 seconds
    const interval = setInterval(fetchTasks, 30000);
    return () => clearInterval(interval);
  }, [activeTab, role, reviewerUsername, navigate]);

  /* ================= ACTIONS ================= */
  const handleAssign = async (trainId, indentNumber) => {
    try {
      const res = await fetch(`${API_BASE}/reviewer/tasks/${idToUrlParam(trainId)}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
          "x-reviewer-username": reviewerUsername,
        },
        body: JSON.stringify({ indent_number: indentNumber }),
      });

      if (res.ok) {
        fetchTasks(); // Refresh the list
        setSuccessMessage("Task assigned successfully");
        setShowSuccessPopup(true);
      } else {
        setWarning({ open: true, message: "Failed to assign task", title: "Error" });
      }
    } catch (err) {
      console.error("Assign error:", err);
      setWarning({ open: true, message: "Failed to assign task", title: "Error" });
    }
  };

  const handleEdit = (trainId, indentNumber) => {
    // Navigate to reviewer edit page (same workflow as dashboard edit)
    const url = indentNumber
      ? `/reviewer/train/${idToUrlParam(trainId)}/edit?indent_number=${encodeURIComponent(indentNumber)}`
      : `/reviewer/train/${idToUrlParam(trainId)}/edit`;
    navigate(url);
  };

  const handleView = (trainId, indentNumber) => {
    const url = indentNumber
      ? `/view/${idToUrlParam(trainId)}?indent_number=${encodeURIComponent(indentNumber)}`
      : `/view/${idToUrlParam(trainId)}`;
    navigate(url);
  };

  const handleCancelClick = (task) => {
    setSelectedTask(task);
    setShowCancelPopup(true);
  };

  const handleCancelConfirm = async (remarks) => {
    if (!selectedTask) return;

    try {
      const res = await fetch(
        `${API_BASE}/reviewer/tasks/${idToUrlParam(selectedTask.rake_serial_number)}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": role,
            "x-reviewer-username": reviewerUsername,
          },
          body: JSON.stringify({
            indent_number: selectedTask.indent_number,
            remarks: remarks,
          }),
        }
      );

      if (res.ok) {
        setShowCancelPopup(false);
        setSelectedTask(null);
        fetchTasks();
        setSuccessMessage("Task cancelled successfully");
        setShowSuccessPopup(true);
      } else {
        setWarning({ open: true, message: "Failed to cancel task", title: "Error" });
      }
    } catch (err) {
      console.error("Cancel error:", err);
      setWarning({ open: true, message: "Failed to cancel task", title: "Error" });
    }
  };

  /* ================= FORMAT DATETIME ================= */
  const formatDateTime = (value) => {
    if (!value) return "-";
    try {
      const date = new Date(value);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      return "-";
    }
  };

  /* ================= RENDER ================= */
  return (
    <AppShell>
      <div style={styles.container}>
        {/* ================= TABS ================= */}
        <div style={styles.tabsContainer}>
          <button
            style={{
              ...styles.tab,
              ...(activeTab === "open" ? styles.activeTab : {}),
            }}
            onClick={() => setActiveTab("open")}
          >
            Open Tasks
          </button>
          <button
            style={{
              ...styles.tab,
              ...(activeTab === "assigned" ? styles.activeTab : {}),
            }}
            onClick={() => setActiveTab("assigned")}
          >
            Assigned Tasks
          </button>
          <button
            style={{
              ...styles.tab,
              ...(activeTab === "completed" ? styles.activeTab : {}),
            }}
            onClick={() => setActiveTab("completed")}
          >
            Completed Tasks
          </button>
        </div>

        {/* ================= TABLE ================= */}
        <div style={styles.tableContainer}>
          {loading ? (
            <div style={styles.loadingContainer}>
              <p>Loading tasks...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div style={styles.emptyContainer}>
              <p>No tasks available</p>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Rake Serial Number</th>
                  <th style={styles.th}>Indent Number</th>
                  <th style={styles.th}>Siding</th>
                  <th style={styles.th}>Rake Loading Start Date & Time</th>
                  <th style={styles.th}>
                    Rake Loading Completion Date & Time
                  </th>
                  <th style={styles.th}>Number of Bags Loaded</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, index) => (
                  <tr key={`${task.rake_serial_number}-${task.indent_number || index}`}>
                    <td style={styles.td}>{task.rake_serial_number}</td>
                    <td style={styles.td}>{task.indent_number || "-"}</td>
                    <td style={styles.td}>{task.siding || "-"}</td>
                    <td style={styles.td}>
                      {formatDateTime(task.rake_loading_start_datetime)}
                    </td>
                    <td style={styles.td}>
                      {formatDateTime(task.rake_loading_end_actual)}
                    </td>
                    <td style={styles.td}>{task.total_bags_loaded || 0}</td>
                    <td style={styles.td}>
                      <span style={styles.statusBadge}>
                        {task.status === "PENDING_APPROVAL"
                          ? "Loading In Progress"
                          : task.status === "APPROVED"
                            ? "Loading Completed"
                            : task.status === "LOADING_IN_PROGRESS"
                              ? "Loading In Progress"
                              : task.status === "CANCELLED"
                                ? "Cancelled Indent"
                                : task.status}
                      </span>
                    </td>
                    <td style={styles.actionTd}>
                      {activeTab === "open" && (
                        <button
                          style={styles.assignButton}
                          onClick={() =>
                            handleAssign(task.rake_serial_number, task.indent_number)
                          }
                        >
                          Assign
                        </button>
                      )}

                      {activeTab === "assigned" && (
                        <>
                          <IconButton
                            label="Edit"
                            onClick={() =>
                              handleEdit(task.rake_serial_number, task.indent_number)
                            }
                          />
                          <button
                            style={styles.cancelButtonSmall}
                            onClick={() => handleCancelClick(task)}
                            title="Cancel Indent"
                          >
                            Cancel Indent
                          </button>
                        </>
                      )}

                      {activeTab === "completed" && (
                        <IconButton
                          label="View"
                          onClick={() =>
                            handleView(task.rake_serial_number, task.indent_number)
                          }
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ================= SUCCESS POPUP ================= */}
      <SuccessPopup
        open={showSuccessPopup}
        onClose={() => setShowSuccessPopup(false)}
        message={successMessage}
      />

      {/* ================= CANCEL POPUP ================= */}
      <WarningPopup
        open={warning.open}
        onClose={() => setWarning({ open: false, message: "", title: "Warning" })}
        message={warning.message}
        title={warning.title}
      />
      <CancelPopup
        open={showCancelPopup}
        onClose={() => {
          setShowCancelPopup(false);
          setSelectedTask(null);
        }}
        onConfirm={handleCancelConfirm}
      />
    </AppShell>
  );
}


/* ================= STYLES ================= */
const successPopupStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },

  modal: {
    backgroundColor: "#fff",
    padding: "24px 30px 32px",
    borderRadius: "10px",
    width: "420px",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  image: {
    width: "320px",
    height: "320px",
    marginTop: "-70px",
    marginBottom: "-140px",
    marginLeft: "23px",
    objectFit: "contain",
  },

  title: {
    fontSize: "22px",
    fontWeight: "700",
    marginBottom: "6px",
  },

  message: {
    fontSize: "14px",
    color: "#555",
    marginBottom: "24px",
  },

  button: {
    padding: "10px 30px",
    backgroundColor: "#0B3A6E",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
  },
};

const styles = {
  container: {
    padding: "20px",
    backgroundColor: "#fff",
    minHeight: "100vh",
  },
  tabsContainer: {
    display: "flex",
    gap: "10px",
    marginBottom: "30px",
  },
  tab: {
    padding: "12px 40px",
    fontSize: "16px",
    fontWeight: "600",
    border: "none",
    backgroundColor: "#d3d3d3",
    color: "#000",
    cursor: "pointer",
    borderRadius: "0",
    transition: "all 0.2s",
  },
  activeTab: {
    backgroundColor: "#87CEEB",
    color: "#000",
  },
  tableContainer: {
    backgroundColor: "#fff",
    borderRadius: "4px",
    overflow: "hidden",
  },
  loadingContainer: {
    textAlign: "center",
    padding: "50px",
    color: "#666",
  },
  emptyContainer: {
    textAlign: "center",
    padding: "50px",
    color: "#666",
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "0",
  },
  th: {
    backgroundColor: "#003366",
    color: "white",
    padding: "14px 8px",
    fontSize: "12px",
    textAlign: "center",
    fontWeight: "600",
    border: "1px solid #fff",
  },
  td: {
    padding: "14px 8px",
    fontSize: "12px",
    textAlign: "center",
    backgroundColor: "#a9a9a9",
    color: "#000",
    border: "1px solid #fff",
  },
  statusBadge: {
    fontWeight: "600",
  },
  actionTd: {
    padding: "14px 8px",
    fontSize: "12px",
    textAlign: "center",
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    alignItems: "center",
    backgroundColor: "#a9a9a9",
    color: "#000",
    border: "1px solid #fff",
    verticalAlign: "middle",
  },
  assignButton: {
    padding: "8px 20px",
    backgroundColor: "#fff",
    color: "#000",
    border: "1px solid #ccc",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
  },
  iconButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    margin: "0",
  },
  cancelButtonSmall: {
    padding: "6px 12px",
    backgroundColor: "#dc3545",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: "500",
  },
};

