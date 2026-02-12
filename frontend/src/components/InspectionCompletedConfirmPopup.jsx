import { multipleRakeSerialPopupStyles } from "./popupStyles";

export default function InspectionCompletedConfirmPopup({ open, onClose, onYes, onNo }) {
  if (!open) return null;

  return (
    <div style={multipleRakeSerialPopupStyles.overlay}>
      <div style={multipleRakeSerialPopupStyles.modal}>
        <div style={multipleRakeSerialPopupStyles.header}>
          Confirm Inspection Completion
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
            Are you sure you want to mark this inspection as completed? Once completed, you cannot undo this action.
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
