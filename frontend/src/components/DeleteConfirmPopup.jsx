import { multipleRakeSerialPopupStyles } from "./popupStyles";

export default function DeleteConfirmPopup({ open, onClose, onYes, onNo, message }) {
  if (!open) return null;

  return (
    <div style={multipleRakeSerialPopupStyles.overlay}>
      <div style={multipleRakeSerialPopupStyles.modal}>
        <div style={multipleRakeSerialPopupStyles.header}>
          Confirm Delete
          <button
            style={multipleRakeSerialPopupStyles.closeButton}
            onClick={onClose}
            onMouseOver={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.2)"}
            onMouseOut={(e) => e.target.style.backgroundColor = "transparent"}
            title="Close"
          >
            ×
          </button>
        </div>
        <div style={multipleRakeSerialPopupStyles.body}>
          <p style={multipleRakeSerialPopupStyles.question}>
            {message || "Are you sure you want to delete this item?"}
          </p>
          <div style={multipleRakeSerialPopupStyles.buttonGroup}>
            <button 
              style={{ ...multipleRakeSerialPopupStyles.button, backgroundColor: "#dc2626" }} 
              onClick={onYes}
            >
              Yes
            </button>
            <button 
              style={{ ...multipleRakeSerialPopupStyles.button, backgroundColor: "#6b7280" }} 
              onClick={onNo}
            >
              No
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
