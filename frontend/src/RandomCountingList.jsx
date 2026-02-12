import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "./AppShell";
import { API_BASE } from "./api";
import IconButton from "./components/IconButton";
import WarningPopup from "./components/WarningPopup";

function RandomCountingList() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [warning, setWarning] = useState({ open: false, message: "", title: "Warning" });
  const isFirstLoadRef = useRef(true);
  
  // Get current user role from localStorage
  const role = localStorage.getItem("role") || "ADMIN";
  
  /* ================= FILTER STATE ================= */
  const [filters, setFilters] = useState({
    rake_serial_number: "",
    wagon_number: "",
    status: "",
    start_date: "",
  });

  /* ================= LOAD ALL RECORDS ================= */
  const loadRecords = async () => {
    const showLoading = isFirstLoadRef.current;
    try {
      if (showLoading) setLoading(true);
      // Fetch all random counting records (both in progress and completed)
      const res = await fetch(`${API_BASE}/random-counting/all`, {
        headers: { "x-user-role": role },
      });
      
      if (!res.ok) {
        throw new Error("Failed to load records");
      }
      
      const data = await res.json();
      setRecords(data);
    } catch (err) {
      console.error("Failed to load random counting records:", err);
      setWarning({ open: true, message: "Failed to load random counting records", title: "Error" });
    } finally {
      if (showLoading) setLoading(false);
      isFirstLoadRef.current = false;
    }
  };

  const hasInProgress = useMemo(
    () => records.some((r) => r.status === "IN_PROGRESS"),
    [records]
  );

  // Initial load
  useEffect(() => {
    loadRecords();
  }, []);

  // Only poll while there is at least one IN_PROGRESS inspection
  useEffect(() => {
    if (!hasInProgress) return;
    const interval = setInterval(loadRecords, 5000);
    return () => clearInterval(interval);
  }, [hasInProgress]);

  // Refresh when user returns to the tab/window (event-based, no constant polling)
  useEffect(() => {
    const onFocus = () => loadRecords();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  /* ================= HANDLERS ================= */
  const handleView = (record) => {
    // Navigate to RandomCounting page with record ID for viewing
    navigate(`/random-counting/inspect/${record.id}`);
  };

  const handleEdit = (record) => {
    // Navigate to RandomCounting page with record ID for editing
    navigate(`/random-counting/inspect/${record.id}?mode=edit`);
  };

  const handleCreate = () => {
    // Navigate to RandomCounting page for creating new inspection
    navigate("/random-counting/inspect");
  };

  /* ================= FORMAT HELPERS ================= */
  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return "-";
    try {
      const date = new Date(dateTimeString);
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

  const getStatusDisplay = (status) => {
    if (status === "COMPLETED") {
      return "Inspection Completed";
    } else if (status === "IN_PROGRESS") {
      return "Inspection In Progress";
    }
    return status || "-";
  };

  /* ================= FILTER LOGIC ================= */
  const filteredRecords = records.filter((row) => {
    const statusDisplay = getStatusDisplay(row.status);
    const startTime = row.random_count_start_time
      ? new Date(row.random_count_start_time)
      : null;

    let startDateMatches = true;
    if (filters.start_date) {
      if (!startTime || Number.isNaN(startTime.getTime())) {
        startDateMatches = false;
      } else {
        const filterDate = new Date(`${filters.start_date}T00:00:00`);
        const filterDateEnd = new Date(`${filters.start_date}T23:59:59.999`);
        if (!Number.isNaN(filterDate.getTime())) {
          if (startTime < filterDate || startTime > filterDateEnd) {
            startDateMatches = false;
          }
        }
      }
    }
    
    return (
      startDateMatches &&
      (!filters.rake_serial_number ||
        (row.train_id || row.rake_serial_number || "").toLowerCase().includes(filters.rake_serial_number)) &&
      (!filters.wagon_number ||
        (row.wagon_number || "").toLowerCase().includes(filters.wagon_number)) &&
      (!filters.status ||
        statusDisplay === filters.status)
    );
  });

  /* ================= PAGINATION ================= */
  const ROWS_PER_PAGE = 5;
  const totalPages = Math.ceil(filteredRecords.length / ROWS_PER_PAGE);
  const startIndex = (page - 1) * ROWS_PER_PAGE;
  const endIndex = Math.min(startIndex + ROWS_PER_PAGE, filteredRecords.length);
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  /* ================= RESET FILTERS ================= */
  const resetFilters = () => {
    setFilters({
      rake_serial_number: "",
      wagon_number: "",
      status: "",
      start_date: "",
    });
    setPage(1);
  };


  if (loading) {
    return (
      <AppShell>
        <div style={styles.container}>
          <div style={styles.loading}>Loading random counting records...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Random Counting Inspections</h1>
          <button style={styles.createButton} onClick={handleCreate}>
            Create Random Counting
          </button>
        </div>

        {/* ================= FILTER ACTION BAR ================= */}
        <div style={styles.filterBar}>
          <button style={styles.resetBtn} onClick={resetFilters}>
            Reset Filters
          </button>
        </div>

        {/* ================= TABLE ================= */}
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              {/* ================= COLUMN HEADERS ================= */}
              <tr>
                <th style={styles.th}>Rake Serial Number</th>
                <th style={styles.th}>Wagon Number</th>
                <th style={styles.th}>Random Counting Start Date & Time</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Action</th>
              </tr>

              {/* ================= FILTER ROW ================= */}
              <tr>
                <th style={styles.filterTh}>
                  <input
                    placeholder="Search"
                    value={filters.rake_serial_number}
                    onChange={(e) =>
                      setFilters({ ...filters, rake_serial_number: e.target.value.toLowerCase() })
                    }
                    style={styles.filterInput}
                  />
                </th>

                <th style={styles.filterTh}>
                  <input
                    placeholder="Search"
                    value={filters.wagon_number}
                    onChange={(e) =>
                      setFilters({ ...filters, wagon_number: e.target.value.toLowerCase() })
                    }
                    style={styles.filterInput}
                  />
                </th>

                {/* Date filter for Random Counting Start Date & Time */}
                <th style={styles.filterTh}>
                  <input
                    type="date"
                    value={filters.start_date}
                    onChange={(e) => {
                      setFilters({ ...filters, start_date: e.target.value });
                      setPage(1);
                    }}
                    style={styles.filterInput}
                    placeholder="Filter by date"
                  />
                </th>

                <th style={styles.filterTh}>
                  <select
                    value={filters.status}
                    onChange={(e) =>
                      setFilters({ ...filters, status: e.target.value })
                    }
                    style={styles.filterInput}
                  >
                    <option value="">All</option>
                    <option value="Inspection Completed">Inspection Completed</option>
                    <option value="Inspection In Progress">Inspection In Progress</option>
                  </select>
                </th>

                <th style={styles.filterTh}></th>
              </tr>
            </thead>

            {/* ================= TABLE BODY ================= */}
            <tbody>
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan="5" style={styles.emptyCell}>
                    No random counting records found. Click "Create Random Counting" to start a new inspection.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record) => {
                  const statusDisplay = getStatusDisplay(record.status);
                  return (
                    <tr
                      key={record.id}
                      style={{
                        backgroundColor: "#dbdbdbff"
                      }}
                    >
                      <td style={styles.td}>{record.train_id || record.rake_serial_number || "-"}</td>
                      <td style={styles.td}>{record.wagon_number || "-"}</td>
                      <td style={styles.td}>{formatDateTime(record.random_count_start_time)}</td>
                      <td style={{ ...styles.td, fontWeight: "700" }}>
                        {statusDisplay}
                      </td>
                      <td style={styles.actionTd}>
                        <IconButton label="View" onClick={() => handleView(record)} />
                        {record.status !== "COMPLETED" && (
                          <IconButton label="Edit" onClick={() => handleEdit(record)} />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ================= PAGINATION ================= */}
        {filteredRecords.length > 0 && totalPages > 1 && (
          <div style={styles.paginationWrapper}>
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              style={{
                ...styles.paginationArrow,
                opacity: page === 1 ? 0.3 : 1,
              }}
            >
              ◀
            </button>

            <div style={styles.pageInfo}>Page {page}</div>

            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{
                ...styles.paginationArrow,
                opacity: page === totalPages ? 0.3 : 1,
              }}
            >
              ▶
            </button>
          </div>
        )}
      </div>
      <WarningPopup
        open={warning.open}
        onClose={() => setWarning({ open: false, message: "", title: "Warning" })}
        message={warning.message}
        title={warning.title}
      />
    </AppShell>
  );
}

/* ================= STYLES ================= */
const styles = {
  container: {
    padding: "24px",
    backgroundColor: "#ffffffff",
    minHeight: "100vh"
  },
  loading: {
    textAlign: "center",
    padding: "50px",
    fontSize: "18px",
    color: "#666",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  title: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#000000",
    margin: 0,
  },
  createButton: {
    padding: "10px 16px",
    backgroundColor: "#0B3A6E",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  filterBar: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: "10px",
    gap: "16px",
  },
  dateFilterContainer: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  dateFilterLabel: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#000000",
    whiteSpace: "nowrap",
  },
  dateInput: {
    padding: "8px 12px",
    fontSize: "14px",
    border: "1px solid #808080",
    borderRadius: "4px",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  dateSeparator: {
    fontSize: "14px",
    fontWeight: "500",
    color: "#000000",
  },
  resetBtn: {
    padding: "10px 16px",
    border: "1px solid #808080",
    background: "#dbdbdbff",
    cursor: "pointer",
    fontSize: "14px",
    borderRadius: "4px",
    fontWeight: "600",
  },
  tableContainer: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  table: {
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "separate",
    borderSpacing: "8px 16px",
  },
  th: {
    backgroundColor: "#0B3A6E",
    color: "white",
    padding: "12px 8px",
    fontSize: "11px",
    textAlign: "center",
    fontWeight: "600",
  },
  filterTh: {
    backgroundColor: "#FFFFFF",
  },
  td: {
    padding: "16px 8px",
    fontSize: "11px",
    textAlign: "center",
    color: "#000000",
  },
  filterInput: {
    width: "100%",
    height: "100%",
    padding: "9px 6px",
    fontSize: "11px",
    outline: "none",
    backgroundColor: "#FFFFFF",
    textAlign: "center",
    boxSizing: "border-box",
    border: "0.48px solid #000000",
  },
  emptyCell: {
    padding: "40px",
    textAlign: "center",
    color: "#999",
    fontSize: "15px",
  },
  actionTd: {
    padding: "25px",
    display: "flex",
    justifyContent: "center",
    gap: "20px",
    alignItems: "center",
  },
  iconButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: "0px",
    padding: "0px",
  },
  paginationWrapper: {
    marginTop: "24px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "150px",
    fontSize: "16px",
  },
  paginationArrow: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "24px",
    padding: "8px",
    color: "#000",
  },
  pageInfo: {
    fontSize: "16px",
    fontWeight: 500,
    color: "#000",
  },
};

export default RandomCountingList;
