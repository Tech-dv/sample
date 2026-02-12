import { useEffect } from "react";

export default function ToastNotification({ message, type, onClose, duration = 5000 }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getTypeColor = () => {
    switch (type) {
      case "alert":
        return { bg: "#FDE2E2", border: "#B3261E", icon: "⚠️" };
      case "notification":
        return { bg: "#E1F5FE", border: "#0277BD", icon: "ℹ️" };
      default:
        return { bg: "#F5F5F5", border: "#666", icon: "📢" };
    }
  };

  const colors = getTypeColor();

  return (
    <div
      style={{
        ...styles.toast,
        backgroundColor: colors.bg,
        borderLeft: `4px solid ${colors.border}`,
        pointerEvents: "auto",
      }}
    >
      <div style={styles.content}>
        <span style={styles.icon}>{colors.icon}</span>
        <div style={styles.message}>{message}</div>
      </div>
      <button
        style={styles.closeBtn}
        onClick={onClose}
        onMouseOver={(e) => (e.target.style.backgroundColor = "rgba(0,0,0,0.1)")}
        onMouseOut={(e) => (e.target.style.backgroundColor = "transparent")}
        title="Close"
      >
        ×
      </button>
    </div>
  );
}

const styles = {
  toast: {
    minWidth: "320px",
    maxWidth: "420px",
    padding: "14px 16px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "12px",
    animation: "slideIn 0.3s ease-out",
  },
  content: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flex: 1,
  },
  icon: {
    fontSize: "20px",
    flexShrink: 0,
  },
  message: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#111827",
    lineHeight: "1.4",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#666",
    fontSize: "20px",
    fontWeight: 700,
    cursor: "pointer",
    padding: "0",
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: "4px",
    transition: "background-color 0.2s",
  },
};

// Add CSS animation
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  if (!document.head.querySelector('style[data-toast-animation]')) {
    style.setAttribute('data-toast-animation', 'true');
    document.head.appendChild(style);
  }
}
