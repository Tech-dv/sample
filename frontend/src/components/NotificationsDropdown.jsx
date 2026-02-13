import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../api";

const ALERT_TYPES = {
  INACTIVE: "inactive",
  SHAKING: "shaking",
  BLUR: "blur",
};

const NOTIFICATION_TYPES = {
  TRAIN_ARRIVED: "train_arrived",
  TRAIN_DEPARTED: "train_departed",
  LOADING_STARTED: "loading_started",
  LOADING_COMPLETED: "loading_completed",
};

function getAlertTypeDisplay(type) {
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
}

function getAlertTypeColor(type) {
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
}

function getNotificationTypeDisplay(type) {
  switch (type) {
    case NOTIFICATION_TYPES.TRAIN_ARRIVED:
      return "Train Arrived";
    case NOTIFICATION_TYPES.TRAIN_DEPARTED:
      return "Train Departed";
    case NOTIFICATION_TYPES.LOADING_STARTED:
      return "Loading Started";
    case NOTIFICATION_TYPES.LOADING_COMPLETED:
      return "Loading Completed";
    default:
      return type;
  }
}

function getNotificationTypeColor(type) {
  switch (type) {
    case NOTIFICATION_TYPES.TRAIN_ARRIVED:
      return { bg: "#E8F5E9", text: "#2E7D32" };
    case NOTIFICATION_TYPES.TRAIN_DEPARTED:
      return { bg: "#F3E5F5", text: "#7B1FA2" };
    case NOTIFICATION_TYPES.LOADING_STARTED:
      return { bg: "#FFF3E0", text: "#E65100" };
    case NOTIFICATION_TYPES.LOADING_COMPLETED:
      return { bg: "#E1F5FE", text: "#0277BD" };
    default:
      return { bg: "#F5F5F5", text: "#666" };
  }
}

function buildInactiveAlerts({ spur, cameras }) {
  const inactive = cameras.filter((cam) => !cam.status);

  const alerts = inactive.map((cam) => {
    const storageKey = `alert_detected_${cam.id}_${spur}`;
    let detectedAt = localStorage.getItem(storageKey);
    if (!detectedAt) {
      detectedAt = new Date().toISOString();
      localStorage.setItem(storageKey, detectedAt);
    }

    // Use consistent ID format with AppShell
    const alertId = `alert-${cam.id}-${spur}`;

    return {
      id: alertId,
      spur,
      camera_id: cam.id,
      camera_name: cam.camera_name,
      alert_type: ALERT_TYPES.INACTIVE,
      detected_at: detectedAt,
      severity: "high",
    };
  });

  // cleanup: if camera is active now, remove stored timestamp and viewed status
  const activeIds = cameras.filter((cam) => cam.status).map((cam) => cam.id);
  activeIds.forEach((camId) => {
    localStorage.removeItem(`alert_detected_${camId}_${spur}`);
    localStorage.removeItem(`viewed_alert_${camId}_${spur}`);
  });

  return alerts;
}

export default function NotificationsDropdown({
  open,
  anchorRect,
  onClose,
  onGoToAlertsPage,
}) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const isOpen = open; // Capture current open state
      const role = localStorage.getItem("role") || "ADMIN";

      // Currently, backend supports cameras endpoint only.
      // For future: replace with dedicated alerts endpoint returning shaking/blur/inactive.
      const [spur8Res, spur9Res] = await Promise.all([
        fetch(`${API_BASE}/cameras?siding=SPUR-8`, { headers: { "x-user-role": role } }),
        fetch(`${API_BASE}/cameras?siding=SPUR-9`, { headers: { "x-user-role": role } }),
      ]);

      const spur8 = spur8Res.ok ? await spur8Res.json() : [];
      const spur9 = spur9Res.ok ? await spur9Res.json() : [];

      const merged = [
        ...buildInactiveAlerts({ spur: "SPUR-8", cameras: Array.isArray(spur8) ? spur8 : [] }),
        ...buildInactiveAlerts({ spur: "SPUR-9", cameras: Array.isArray(spur9) ? spur9 : [] }),
      ];

      // newest first (detected_at stable per camera while inactive)
      merged.sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));

      // Show only latest 3 alerts
      const latestAlerts = merged.slice(0, 3);
      setAlerts(latestAlerts);
      
      // Mark alerts as viewed when dropdown is open
      if (isOpen) {
        const viewedAlerts = new Set(JSON.parse(localStorage.getItem("viewed_alerts") || "[]"));
        latestAlerts.forEach((alert) => {
          viewedAlerts.add(alert.id);
        });
        localStorage.setItem("viewed_alerts", JSON.stringify(Array.from(viewedAlerts)));
        // Trigger event to refresh count in AppShell
        window.dispatchEvent(new CustomEvent("notificationsViewed"));
      }

      // Fetch train notifications from dashboard data
      try {
        const role = localStorage.getItem("role") || "ADMIN";
        const customerId = localStorage.getItem("customerId");
        const username = localStorage.getItem("username");

        const headers = {
          "x-user-role": role,
          ...(role === "CUSTOMER" && { "x-customer-id": customerId }),
          ...(role === "SUPER_ADMIN" && username && { "x-username": username }),
        };

        const dashboardRes = await fetch(`${API_BASE}/dashboard-data`, { headers });

        if (dashboardRes.ok) {
          const dashboardData = await dashboardRes.json();
          const records = dashboardData.records || [];

          const trainNotifications = [];

          records.forEach((record) => {
            // Train arrived notification
            if (record.rake_placement_datetime) {
              // Use consistent ID format with AppShell
              const notifId = `train-arrived-${record.train_id}-${record.indent_number || ""}`;
              trainNotifications.push({
                id: notifId,
                train_id: record.train_id,
                indent_number: record.indent_number || null,
                notification_type: NOTIFICATION_TYPES.TRAIN_ARRIVED,
                message: `Rake ${record.train_id}${record.indent_number ? ` (Indent: ${record.indent_number})` : ""} arrived`,
                timestamp: record.rake_placement_datetime,
                siding: record.siding,
              });
            }

            // Loading started notification
            if (record.rake_loading_start_datetime) {
              // Use consistent ID format with AppShell
              const notifId = `loading-started-${record.train_id}-${record.indent_number || ""}`;
              trainNotifications.push({
                id: notifId,
                train_id: record.train_id,
                indent_number: record.indent_number || null,
                notification_type: NOTIFICATION_TYPES.LOADING_STARTED,
                message: `Loading started for Rake ${record.train_id}${record.indent_number ? ` (Indent: ${record.indent_number})` : ""}`,
                timestamp: record.rake_loading_start_datetime,
                siding: record.siding,
              });
            }

            // Loading completed notification
            if (record.status === "APPROVED" && record.rake_loading_end_actual) {
              // Use consistent ID format with AppShell
              const notifId = `loading-completed-${record.train_id}-${record.indent_number || ""}`;
              trainNotifications.push({
                id: notifId,
                train_id: record.train_id,
                indent_number: record.indent_number || null,
                notification_type: NOTIFICATION_TYPES.LOADING_COMPLETED,
                message: `Loading completed for Rake ${record.train_id}${record.indent_number ? ` (Indent: ${record.indent_number})` : ""}`,
                timestamp: record.rake_loading_end_actual,
                siding: record.siding,
              });
            }
          });

          // Sort by timestamp (newest first)
          trainNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

          // Show only latest 3 notifications
          const latestNotifications = trainNotifications.slice(0, 3);
          setNotifications(latestNotifications);
          
          // Mark notifications as viewed when dropdown is open
          if (isOpen) {
            const viewedNotifications = new Set(JSON.parse(localStorage.getItem("viewed_notifications") || "[]"));
            latestNotifications.forEach((notif) => {
              viewedNotifications.add(notif.id);
            });
            localStorage.setItem("viewed_notifications", JSON.stringify(Array.from(viewedNotifications)));
            
            // Trigger event to refresh count in AppShell
            window.dispatchEvent(new CustomEvent("notificationsViewed"));
          }
        }
      } catch (e) {
        console.error("[NOTIFICATIONS] Failed to fetch train notifications:", e);
        setNotifications([]);
      }
    } catch (e) {
      console.error("[NOTIFICATIONS] Failed to fetch alerts:", e);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, [open, fetchAlerts]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) onClose();
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open, onClose]);


  if (!open || !anchorRect) return null;

  const top = Math.round(anchorRect.bottom + 8);
  const right = Math.max(12, Math.round(window.innerWidth - anchorRect.right));

  return (
    <div
      ref={containerRef}
      style={{
        ...styles.container,
        top,
        right,
      }}
      role="dialog"
      aria-label="Notifications"
    >
      <div style={styles.header}>
        <div style={styles.title}>Notifications</div>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          ×
        </button>
      </div>

      {/* Combined Notifications Section */}
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitle}>Notifications</div>
        <div style={styles.sectionMeta}>
          {loading ? "Loading..." : `${alerts.length + notifications.length} notification(s)`}
        </div>
      </div>

      <div style={styles.list}>
        {!loading && alerts.length === 0 && notifications.length === 0 ? (
          <div style={styles.empty}>No notifications</div>
        ) : (
          (() => {
            // Combine alerts and notifications, normalize for sorting
            const allItems = [
              ...alerts.map((a) => ({
                ...a,
                type: "alert",
                sortTime: a.detected_at ? new Date(a.detected_at).getTime() : 0,
              })),
              ...notifications.map((n) => ({
                ...n,
                type: "notification",
                sortTime: n.timestamp ? new Date(n.timestamp).getTime() : 0,
              })),
            ].sort((a, b) => b.sortTime - a.sortTime); // Newest first

            return allItems.map((item) => {
              if (item.type === "alert") {
                const c = getAlertTypeColor(item.alert_type);
                return (
                  <div key={item.id} style={styles.item}>
                    <div style={styles.itemTop}>
                      <div style={styles.itemName}>
                        {item.camera_name || "-"}{" "}
                        <span style={styles.itemSpur}>({item.spur})</span>
                      </div>
                      <span
                        style={{
                          ...styles.badge,
                          backgroundColor: c.bg,
                          color: c.text,
                        }}
                      >
                        {getAlertTypeDisplay(item.alert_type)}
                      </span>
                    </div>
                    <div style={styles.itemSub}>
                      Detected:{" "}
                      {item.detected_at ? new Date(item.detected_at).toLocaleString() : "-"}
                    </div>
                  </div>
                );
              } else {
                const c = getNotificationTypeColor(item.notification_type);
                return (
                  <div key={item.id} style={styles.item}>
                    <div style={styles.itemTop}>
                      <div style={styles.itemName}>
                        {item.train_id || "-"}
                        {item.indent_number && (
                          <span style={styles.itemSpur}> (Indent: {item.indent_number})</span>
                        )}
                        {item.siding && <span style={styles.itemSpur}> - {item.siding}</span>}
                      </div>
                      <span
                        style={{
                          ...styles.badge,
                          backgroundColor: c.bg,
                          color: c.text,
                        }}
                      >
                        {getNotificationTypeDisplay(item.notification_type)}
                      </span>
                    </div>
                    <div style={styles.itemSub}>
                      {item.message || "-"} • {item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}
                    </div>
                  </div>
                );
              }
            });
          })()
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    width: "420px",
    maxWidth: "calc(100vw - 24px)",
    maxHeight: "calc(100vh - 120px)",
    backgroundColor: "#FFFFFF",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
    border: "1px solid rgba(0,0,0,0.12)",
    zIndex: 2000,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    backgroundColor: "#0B3A6E",
    color: "#FFFFFF",
    padding: "14px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: "16px",
    fontWeight: 700,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#FFFFFF",
    fontSize: "22px",
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: "20px",
    padding: "0 6px",
  },
  sectionHeader: {
    padding: "8px 12px 10px",
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#111827",
  },
  sectionMeta: {
    fontSize: "12px",
    color: "#6B7280",
    fontWeight: 600,
  },
  list: {
    padding: "0 12px 12px",
    overflowY: "auto",
  },
  empty: {
    padding: "18px 8px",
    textAlign: "center",
    color: "#6B7280",
    fontSize: "13px",
  },
  item: {
    backgroundColor: "#F3F3F3",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: "10px",
    padding: "10px 10px",
    marginBottom: "10px",
  },
  itemTop: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemName: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#111827",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "250px",
  },
  itemSpur: {
    fontWeight: 700,
    color: "#374151",
  },
  badge: {
    padding: "4px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
    border: "1px solid rgba(0,0,0,0.06)",
  },
  itemSub: {
    marginTop: "6px",
    fontSize: "12px",
    color: "#374151",
    fontWeight: 600,
  },
};

