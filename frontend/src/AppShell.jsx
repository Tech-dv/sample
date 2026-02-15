import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import notificationIcon from "./assets/notifications.png";
import profileIcon from "./assets/profile.png";
import logoutIcon from "./assets/logout.png";
import logo from "./assets/logo.png";
import { API_BASE } from "./api";
import { useSessionTimeout } from "./hooks/useSessionTimeout";
import { checkSessionOnLoad } from "./utils/sessionUtils";
import NotificationsDropdown from "./components/NotificationsDropdown";
import ToastNotification from "./components/ToastNotification";


function AppShell({ children }) {
  /* ================= STATE ================= */
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifAnchorRect, setNotifAnchorRect] = useState(null);
  const [notifCount, setNotifCount] = useState(0);
  const notifBtnRef = useRef(null);
  const [toasts, setToasts] = useState([]);
  const previousAlertsRef = useRef(new Set());
  const previousNotificationsRef = useRef(new Set());

  /* ================= CONTEXT ================= */
  const role = localStorage.getItem("role");
  const navigate = useNavigate();
  const location = useLocation();

  /* ================= SESSION MANAGEMENT ================= */
  // This hook will track activity and handle session timeout
  useSessionTimeout();

  /* ================= SESSION VALIDATION ON MOUNT ================= */
  useEffect(() => {
    if (!checkSessionOnLoad()) {
      navigate("/");
    }
  }, [navigate]);

  /* ================= HANDLERS ================= */
  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  const goToProfile = () => {
    navigate("/profile");
  };

  const goToDashboard = () => {
    navigate("/dashboard");
  };

  const onToggleNotifications = () => {
    if (!notifOpen) {
      const rect = notifBtnRef.current?.getBoundingClientRect?.();
      if (rect) setNotifAnchorRect(rect);
    }
    setNotifOpen((v) => !v);
  };

  const onCloseNotifications = () => setNotifOpen(false);

  const goToAlertsPage = (spur) => {
    navigate(`/alerts/${encodeURIComponent(spur)}`);
  };

  // Polling for badge count and new alerts/notifications detection
  useEffect(() => {
    let mounted = true;
    const fetchCount = async () => {
      try {
        const role = localStorage.getItem("role") || "ADMIN";
        const customerId = localStorage.getItem("customerId");
        const username = localStorage.getItem("username");

        const headers = {
          "x-user-role": role,
          ...(role === "CUSTOMER" && { "x-customer-id": customerId }),
          ...(role === "SUPER_ADMIN" && username && { "x-username": username }),
        };

        // Fetch camera alerts
        const [spur8Res, spur9Res] = await Promise.all([
          fetch(`${API_BASE}/cameras?siding=SPUR-8`, { headers: { "x-user-role": role } }).catch(() => null),
          fetch(`${API_BASE}/cameras?siding=SPUR-9`, { headers: { "x-user-role": role } }).catch(() => null),
        ]);
        const parse = async (res) => (res && res.ok ? res.json() : []);
        const spur8 = await parse(spur8Res);
        const spur9 = await parse(spur9Res);
        
        // Get viewed alerts from localStorage
        const viewedAlerts = new Set(JSON.parse(localStorage.getItem("viewed_alerts") || "[]"));
        
        // Build alert IDs for comparison
        const currentAlerts = new Set();
        const inactive8 = Array.isArray(spur8) ? spur8.filter((c) => !c.status) : [];
        const inactive9 = Array.isArray(spur9) ? spur9.filter((c) => !c.status) : [];
        
        [...inactive8, ...inactive9].forEach((cam) => {
          const alertId = `alert-${cam.id}-${cam.siding}`;
          currentAlerts.add(alertId);
          
          // Check if this is a new alert
          if (!previousAlertsRef.current.has(alertId)) {
            if (mounted && previousAlertsRef.current.size > 0) {
              // Only show toast if we've already initialized (not first load)
              setToasts((prev) => [
                ...prev,
                {
                  id: `toast-${Date.now()}-${Math.random()}`,
                  message: `New Alert: ${cam.camera_name || "Camera"} (${cam.siding}) is inactive`,
                  type: "alert",
                },
              ]);
            }
          }
        });
        
        previousAlertsRef.current = currentAlerts;
        
        // Count only unviewed alerts
        const cameraAlertCount = [...inactive8, ...inactive9].filter((cam) => {
          const alertId = `alert-${cam.id}-${cam.siding}`;
          return !viewedAlerts.has(alertId);
        }).length;

        // Fetch train notifications
        const viewedNotifications = new Set(JSON.parse(localStorage.getItem("viewed_notifications") || "[]"));
        let trainNotificationCount = 0;
        const currentNotifications = new Set();
        
        try {
          const dashboardRes = await fetch(`${API_BASE}/dashboard-data`, { headers });
          if (dashboardRes.ok) {
            const dashboardData = await dashboardRes.json();
            const records = dashboardData.records || [];
            
            // Track train notifications
            records.forEach((record) => {
              if (record.rake_placement_datetime) {
                const notifId = `train-arrived-${record.train_id}-${record.indent_number || ""}`;
                currentNotifications.add(notifId);
                
                // Count only if not viewed
                if (!viewedNotifications.has(notifId)) {
                  trainNotificationCount++;
                }
                
                if (!previousNotificationsRef.current.has(notifId)) {
                  if (mounted && previousNotificationsRef.current.size > 0) {
                    setToasts((prev) => [
                      ...prev,
                      {
                        id: `toast-${Date.now()}-${Math.random()}`,
                        message: `Rake ${record.train_id}${record.indent_number ? ` (Indent: ${record.indent_number})` : ""} arrived`,
                        type: "notification",
                      },
                    ]);
                  }
                }
              }
              
              if (record.rake_loading_start_datetime) {
                const notifId = `loading-started-${record.train_id}-${record.indent_number || ""}`;
                currentNotifications.add(notifId);
                
                // Count only if not viewed
                if (!viewedNotifications.has(notifId)) {
                  trainNotificationCount++;
                }
                
                if (!previousNotificationsRef.current.has(notifId)) {
                  if (mounted && previousNotificationsRef.current.size > 0) {
                    setToasts((prev) => [
                      ...prev,
                      {
                        id: `toast-${Date.now()}-${Math.random()}`,
                        message: `Loading started for Rake ${record.train_id}${record.indent_number ? ` (Indent: ${record.indent_number})` : ""}`,
                        type: "notification",
                      },
                    ]);
                  }
                }
              }
              
              if (record.status === "APPROVED" && record.rake_loading_end_actual) {
                const notifId = `loading-completed-${record.train_id}-${record.indent_number || ""}`;
                currentNotifications.add(notifId);
                
                // Count only if not viewed
                if (!viewedNotifications.has(notifId)) {
                  trainNotificationCount++;
                }
                
                if (!previousNotificationsRef.current.has(notifId)) {
                  if (mounted && previousNotificationsRef.current.size > 0) {
                    setToasts((prev) => [
                      ...prev,
                      {
                        id: `toast-${Date.now()}-${Math.random()}`,
                        message: `Loading completed for Rake ${record.train_id}${record.indent_number ? ` (Indent: ${record.indent_number})` : ""}`,
                        type: "notification",
                      },
                    ]);
                  }
                }
              }
            });
          }
        } catch (e) {
          // Non-critical, continue with camera alerts count
        }
        
        previousNotificationsRef.current = currentNotifications;

        const totalCount = cameraAlertCount + trainNotificationCount;
        if (mounted) setNotifCount(totalCount);
      } catch {
        // non-critical
      }
    };

    // Only poll when user is logged in
    if (role) {
      fetchCount();
      const interval = setInterval(fetchCount, 10000);
      
      // Listen for notifications viewed event to refresh count immediately
      const handleNotificationsViewed = () => {
        if (mounted) {
          fetchCount();
        }
      };
      window.addEventListener("notificationsViewed", handleNotificationsViewed);
      
      return () => {
        mounted = false;
        clearInterval(interval);
        window.removeEventListener("notificationsViewed", handleNotificationsViewed);
      };
    }
    return () => {
      mounted = false;
    };
  }, [role]);

  const notifBadgeText = useMemo(() => {
    if (!notifCount) return "";
    return notifCount > 99 ? "99+" : String(notifCount);
  }, [notifCount]);

  /* ================= RENDER ================= */
  return (
    <div style={styles.app}>
      {/* ================= HEADER ================= */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoWrapper}>
            <button style={styles.menuBtn} onClick={() => setOpen(!open)}>
              <div style={styles.hamburger}>
                <span style={{
                  ...styles.hamburgerLine,
                  ...(open ? styles.hamburgerLine1Active : {})
                }}></span>
                <span style={{
                  ...styles.hamburgerLine,
                  ...(open ? styles.hamburgerLine2Active : {})
                }}></span>
                <span style={{
                  ...styles.hamburgerLine,
                  ...(open ? styles.hamburgerLine3Active : {})
                }}></span>
              </div>
            </button>
            <button
              onClick={goToDashboard}
              style={styles.logoButton}
              title="Go to Dashboard"
            >
            <img
              src={logo}
              alt="Railway Wagon Monitoring Dashboard"
              style={styles.logo}
            />
            </button>
          </div>
        </div>

        <div style={styles.headerRight}>
          {/* Super Admin Badge */}
          {role === "SUPER_ADMIN" && (
            <div style={styles.superAdminBadge}>
              <span style={styles.superAdminText}>⭐ SUPER ADMIN</span>
            </div>
          )}
          
          {/* Notifications */}
          <button
            ref={notifBtnRef}
            style={styles.iconBtn}
            title="Notifications"
            onClick={onToggleNotifications}
          >
            <div style={styles.iconBox}>
              {!!notifBadgeText && (
                <div style={styles.notifBadge} aria-label={`${notifBadgeText} alerts`}>
                  {notifBadgeText}
                </div>
              )}
              <img
                src={notificationIcon}
                alt="Notifications"
                style={styles.notificationImg}
              />
            </div>
            <span style={styles.iconLabel}>Notifications</span>
          </button>


          {/* My Profile */}
          <button
            style={styles.iconBtn}
            title="My Profile"
            onClick={goToProfile}
          >
            <div style={styles.iconBox}>
              <img src={profileIcon} alt="My Profile" style={styles.headerImg} />
            </div>

            <span style={styles.iconLabel}>My Profile</span>
          </button>

          {/* Logout */}
          <button
            style={styles.iconBtn}
            title="Logout"
            onClick={handleLogout}
          >
            <div style={styles.iconBox}>
              <img src={logoutIcon} alt="Logout" style={styles.logoutImg} />
            </div>

            <span style={styles.iconLabel}>Logout</span>
          </button>
        </div>


      </header>

      <NotificationsDropdown
        open={notifOpen}
        anchorRect={notifAnchorRect}
        onClose={onCloseNotifications}
        onGoToAlertsPage={goToAlertsPage}
      />

      {/* ================= TOAST NOTIFICATIONS ================= */}
      <div style={styles.toastContainer}>
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => {
              setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            }}
            duration={5000}
          />
        ))}
      </div>

      {/* ================= BODY ================= */}
      <div style={styles.body}>
        {/* ================= SIDEBAR ================= */}
        <aside
          style={{
            ...styles.sidebar,
            transform: open ? "translateX(0)" : "translateX(-100%)",
          }}
        >
          <nav style={styles.menu}>
            <NavItem
              to="/dashboard"
              label="Dashboard"
              location={location}
              onClick={() => setOpen(false)}
            />

            {role === "REVIEWER" && (
              <>
              <NavItem
                to="/task-view"
                label="Task View"
                location={location}
                onClick={() => setOpen(false)}
              />
                <NavItem
                  to="/settings"
                  label="Settings"
                  location={location}
                  onClick={() => setOpen(false)}
                />
              </>
            )}

            {(role === "ADMIN" || role === "SUPER_ADMIN") && (
                <NavItem
                  to="/random-counting"
                  label="Random Counting"
                  location={location}
                  onClick={() => setOpen(false)}
                />
            )}

            <NavItem
              to="/reports"
              label="Reports"
              location={location}
              onClick={() => setOpen(false)}
            />
          </nav>
        </aside>

        {/* ================= OVERLAY ================= */}
        {open && (
          <div
            style={styles.overlay}
            onClick={() => setOpen(false)}
          />
        )}

        {/* ================= CONTENT ================= */}
        <main style={styles.content}>{children}</main>
      </div>
    </div>
  );
}

/* ================= NAV ITEM ================= */

function NavItem({ to, label, location, onClick }) {
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        ...styles.navItem,
        ...(isActive ? styles.navItemActive : {}),
      }}
    >
      {label}
    </Link>
  );
}

/* ================= STYLES ================= */

const styles = {
  app: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
  },

  /* ===== HEADER ===== */
  header: {
    height: "80px",
    backgroundColor: "#0B3A6E",
    color: "white",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    padding: "8px 20px 8px 20px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
    zIndex: 101,
  },

  headerLeft: {
    display: "flex",
    alignItems: "flex-end",
    gap: "16px",
    paddingBottom: "4px",
  },

  logoWrapper: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "16px",
  },

  logoButton: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  logo: {
    height: "75px",
    width: "auto",
    objectFit: "contain",
  },


  title: {
    fontSize: "16px",
    fontWeight: "600",
    letterSpacing: "0.3px",
  },

  menuBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  hamburger: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    width: "24px",
  },

  hamburgerLine: {
    width: "100%",
    height: "3px",
    backgroundColor: "#FFFFFF",
    borderRadius: "2px",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    transformOrigin: "center",
  },

  hamburgerLine1Active: {
    transform: "rotate(45deg) translate(6px, 6px)",
  },

  hamburgerLine2Active: {
    opacity: 0,
  },

  hamburgerLine3Active: {
    transform: "rotate(-45deg) translate(6px, -6px)",
  },

  headerRight: {
    display: "flex",
    alignItems: "flex-end",
    gap: "18px",
    fontSize: "18px",
    paddingBottom: "4px",
    marginLeft: "auto",
  },

  superAdminBadge: {
    backgroundColor: "#FFD700",
    color: "#0B3A6E",
    padding: "6px 12px",
    borderRadius: "20px",
    fontWeight: "bold",
    fontSize: "11px",
    letterSpacing: "0.5px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
    animation: "pulse 2s infinite",
  },

  superAdminText: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },

  headerIcon: {
    cursor: "pointer",
    opacity: 0.9,
  },

  logoutHeaderBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.6)",
    color: "white",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },

  /* ===== BODY ===== */
  body: {
    display: "flex",
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },

  /* ===== SIDEBAR ===== */
  sidebar: {
    width: "260px",
    height: "100%",
    backgroundColor: "#0B3A6E",
    display: "flex",
    flexDirection: "column",
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 100,
    transition: "transform 0.3s ease-in-out",
    boxShadow: "2px 0 10px rgba(0,0,0,0.2)",
  },

  menu: {
    flex: 1,
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  navItem: {
    padding: "12px 16px",
    borderRadius: "6px",
    textDecoration: "none",
    color: "#e5e7eb",
    fontSize: "14px",
    fontWeight: "500",
  },

  navItemActive: {
    backgroundColor: "#1e40af",
    color: "white",
    fontWeight: "600",
  },

  /* ===== CONTENT ===== */
  content: {
    flex: 1,
    padding: "24px",
    overflowY: "auto",
    backgroundColor: "#FFFFFF",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 99,
  },

  iconBtn: {
    background: "transparent",
    border: "none",
    padding: "4px 6px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
  },

  iconLabel: {
    fontSize: "11px",
    color: "#FFFFFF",
    fontWeight: 500,
    lineHeight: "12px",
    whiteSpace: "nowrap",
  },

  headerImg: {
    width: "38px", 
    height: "38px",
    marginTop: "12px",
  },

  logoutImg: {
    width: "38px", 
    height: "38px",
    marginTop: "16px",
  },

  notificationImg: {
    width: "50px",   
    height: "50px",
    marginTop: "20px",
  },

  iconBox: {
    height: "44px",              // SAME for all buttons
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  notifBadge: {
    position: "absolute",
    top: "-2px",
    right: "-2px",
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    borderRadius: "999px",
    padding: "2px 6px",
    fontSize: "10px",
    fontWeight: 800,
    border: "2px solid #0B3A6E",
    lineHeight: "12px",
    minWidth: "22px",
    textAlign: "center",
  },

  toastContainer: {
    position: "fixed",
    top: "100px",
    right: "20px",
    zIndex: 10000,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    pointerEvents: "none",
  },


};

export default AppShell;
