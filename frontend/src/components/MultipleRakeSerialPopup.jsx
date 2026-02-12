import { multipleRakeSerialPopupStyles } from "./popupStyles";

export default function MultipleRakeSerialPopup({ open, onClose, onYes, onNo }) {
  if (!open) return null;

  return (
    <div style={multipleRakeSerialPopupStyles.overlay}>
      <div style={multipleRakeSerialPopupStyles.modal}>
        <div style={multipleRakeSerialPopupStyles.header}>
          Confirm Rake Serial No.
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
            Multiple Rake Serial Number Required?
          </p>
          <div style={multipleRakeSerialPopupStyles.buttonGroup}>
            <button style={multipleRakeSerialPopupStyles.button} onClick={onYes}>
              Yes
            </button>
            <button style={multipleRakeSerialPopupStyles.button} onClick={onNo}>
              No
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
