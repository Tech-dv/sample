import warningIcon from "../assets/warning.png";
import { warningPopupStyles } from "./popupStyles";

export default function WarningPopup({ open, onClose, message, title = "Warning" }) {
  if (!open) return null;

  return (
    <div style={warningPopupStyles.overlay}>
      <div style={warningPopupStyles.modal}>
        <div style={warningPopupStyles.header}>
          {title}
          <button
            style={warningPopupStyles.closeButton}
            onClick={onClose}
            onMouseOver={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.2)"}
            onMouseOut={(e) => e.target.style.backgroundColor = "transparent"}
            title="Close"
          >
            ×
          </button>
        </div>
        
        <div style={warningPopupStyles.body}>
          <img
            src={warningIcon}
            alt="Warning"
            style={warningPopupStyles.icon}
          />
          <p style={warningPopupStyles.message}>{message}</p>
          <button style={warningPopupStyles.button} onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
