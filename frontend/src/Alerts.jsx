import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppShell from "./AppShell";
import { API_BASE } from "./api";

// Alert types
const ALERT_TYPES = {
  INACTIVE: "inactive",
  SHAKING: "shaking",
  BLUR: "blur",
};

function Alerts() {
  const { spur } = useParams();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState(""); // "" = all, "inactive", "shaking", "blur"

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual alerts API endpoint when available
      // For now, we'll fetch cameras and simulate alerts
      // In the future, this should be: GET /alerts?spur=SPUR-8&type=shaking&search=...
      
      // Fetch cameras for this spur
      const cameraQuery = new URLSearchParams({
        siding: spur,
        search,
      }).toString();

      const res = await fetch(`${API_BASE}/cameras?${cameraQuery}`);
      if (!res.ok) {
        throw new Error("Failed to load alerts");
      }
      const cameras = await res.json();
      
      // TODO: Replace this mock data with actual API call to /alerts endpoint
      // For now, simulate alerts from camera data
      // In production, this should come from a dedicated alerts API
      const mockAlerts = cameras
        .filter(cam => !cam.status) // Inactive cameras
        .map(cam => {
          // Get or set the first detection time for this camera
          // This ensures the timestamp doesn't change on every refresh
          const storageKey = `alert_detected_${cam.id}_${spur}`;
          let detectedAt = localStorage.getItem(storageKey);
          
          // If no stored time exists, this is the first time we detected it as inactive
          if (!detectedAt) {
            detectedAt = new Date().toISOString();
            localStorage.setItem(storageKey, detectedAt);
          }
          
          return {
            id: `inactive-${cam.id}`,
            camera_id: cam.id,
            camera_name: cam.camera_name,
            siding: cam.siding,
            alert_type: ALERT_TYPES.INACTIVE,
            detected_at: detectedAt,
            severity: "high",
          };
        });
      
      // Clean up detection times for cameras that are now active (no longer inactive)
      // This ensures we only keep timestamps for currently inactive cameras
      const activeCameraIds = cameras
        .filter(cam => cam.status)
        .map(cam => cam.id);
      
      // Remove stored timestamps for cameras that are now active
      activeCameraIds.forEach(camId => {
        const storageKey = `alert_detected_${camId}_${spur}`;
        localStorage.removeItem(storageKey);
      });
      
      // TODO: Add real shaking and blur alerts from API
      // For now, this is a placeholder structure
      // When backend is ready, replace with:
      // const res = await fetch(`${API_BASE}/alerts?spur=${spur}&type=${filterType}&search=${search}`);
      // const alerts = await res.json();
      
      setAlerts(mockAlerts);
    } catch (err) {
      console.error("Failed to load alerts:", err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [spur, search, filterType]);

  useEffect(() => {
    fetchAlerts();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const getAlertTypeDisplay = (type) => {
    switch (type) {
      case ALERT_TYPES.INACTIVE:
        return "Inactive Camera";
      case ALERT_TYPES.SHAKING:
        return "Camera Shaking";
      case ALERT_TYPES.BLUR:
        return "Camera Blur";
      default:
        return type;
    }
  };

  const getAlertTypeColor = (type) => {
    switch (type) {
      case ALERT_TYPES.INACTIVE:
        return { bg: "#FDE2E2", text: "#B3261E" };
      case ALERT_TYPES.SHAKING:
        return { bg: "#FFF4E6", text: "#E65100" };
      case ALERT_TYPES.BLUR:
        return { bg: "#E3F2FD", text: "#1565C0" };
      default:
        return { bg: "#F5F5F5", text: "#666" };
    }
  };

  const filteredAlerts = filterType
    ? alerts.filter(alert => alert.alert_type === filterType)
    : alerts;

  if (loading) {
    return (
      <AppShell>
        <div style={styles.container}>
          <div style={styles.loading}>Loading alerts...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={styles.container}>
        {/* ================= HEADER ================= */}
        <div style={styles.header}>
          <h1 style={styles.title}>Active Alerts - {spur}</h1>
          <button style={styles.backButton} onClick={() => navigate("/dashboard")}>
            ← Back to Dashboard
          </button>
        </div>

        {/* ================= SUMMARY CARDS ================= */}
        <div style={styles.summaryRow}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryTitle}>Total Alerts</div>
            <div style={styles.summaryValue}>{alerts.length}</div>
          </div>
          <div style={{...styles.summaryCard, ...styles.summaryCardInactive}}>
            <div style={styles.summaryTitle}>Inactive Cameras</div>
            <div style={styles.summaryValue}>
              {alerts.filter(a => a.alert_type === ALERT_TYPES.INACTIVE).length}
            </div>
          </div>
          <div style={{...styles.summaryCard, ...styles.summaryCardShaking}}>
            <div style={styles.summaryTitle}>Camera Shaking</div>
            <div style={styles.summaryValue}>
              {alerts.filter(a => a.alert_type === ALERT_TYPES.SHAKING).length}
            </div>
          </div>
          <div style={{...styles.summaryCard, ...styles.summaryCardBlur}}>
            <div style={styles.summaryTitle}>Camera Blur</div>
            <div style={styles.summaryValue}>
              {alerts.filter(a => a.alert_type === ALERT_TYPES.BLUR).length}
            </div>
          </div>
        </div>

        {/* ================= FILTER BAR ================= */}
        <div style={styles.filterBar}>
          <input
            placeholder="Search by Camera Name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Alert Types</option>
            <option value={ALERT_TYPES.INACTIVE}>Inactive Camera</option>
            <option value={ALERT_TYPES.SHAKING}>Camera Shaking</option>
            <option value={ALERT_TYPES.BLUR}>Camera Blur</option>
          </select>
        </div>

        {/* ================= ALERTS TABLE ================= */}
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Camera Name</th>
                <th style={styles.th}>Alert Type</th>
                <th style={styles.th}>Detected At</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan="3" style={styles.emptyCell}>
                    {filterType 
                      ? `No ${getAlertTypeDisplay(filterType)} alerts found for ${spur}.`
                      : `No alerts found for ${spur}. All systems are operating normally.`
                    }
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert) => {
                  const typeColor = getAlertTypeColor(alert.alert_type);
                  return (
                    <tr
                      key={alert.id}
                      style={{
                        backgroundColor: "#dbdbdbff",
                      }}
                    >
                      <td style={styles.td}>{alert.camera_name || "-"}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor: typeColor.bg,
                            color: typeColor.text,
                          }}
                        >
                          {getAlertTypeDisplay(alert.alert_type)}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {alert.detected_at
                          ? new Date(alert.detected_at).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

/* ================= STYLES ================= */
const styles = {
  container: {
    padding: "24px",
    backgroundColor: "#ffffffff",
    minHeight: "100vh",
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
  backButton: {
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
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "20px",
    marginBottom: "24px",
  },
  summaryCard: {
    backgroundColor: "#dbdbdbff",
    padding: "20px",
    borderRadius: "2px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "8px",
  },
  summaryCardInactive: {
    borderLeft: "4px solid #B3261E",
  },
  summaryCardShaking: {
    borderLeft: "4px solid #E65100",
  },
  summaryCardBlur: {
    borderLeft: "4px solid #1565C0",
  },
  summaryTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#000000",
    textAlign: "center",
  },
  summaryValue: {
    fontSize: "28px",
    fontWeight: 700,
    color: "#000000",
  },
  filterBar: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: "10px",
    gap: "16px",
  },
  searchInput: {
    width: "260px",
    padding: "9px 6px",
    fontSize: "11px",
    border: "0.48px solid #000000",
    borderRadius: "4px",
    outline: "none",
    backgroundColor: "#FFFFFF",
  },
  filterSelect: {
    width: "180px",
    padding: "9px 6px",
    fontSize: "11px",
    border: "0.48px solid #000000",
    borderRadius: "4px",
    outline: "none",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
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
  td: {
    padding: "16px 8px",
    fontSize: "11px",
    textAlign: "center",
    color: "#000000",
  },
  statusBadge: {
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: 700,
    display: "inline-block",
    minWidth: "80px",
    textAlign: "center",
  },
  emptyCell: {
    padding: "40px",
    textAlign: "center",
    color: "#999",
    fontSize: "15px",
  },
  actionTd: {
    padding: "20px 8px",
    display: "flex",
    justifyContent: "center",
    gap: "20px",
    alignItems: "center",
  },
};

export default Alerts;
