import { useState } from "react";
import { cancelPopupStyles } from "./popupStyles";
import WarningPopup from "./WarningPopup";

export default function CancelPopup({ open, onClose, onConfirm }) {
  const [remarks, setRemarks] = useState("");
  const [showWarning, setShowWarning] = useState(false);

  if (!open) return null;

  const handleConfirm = () => {
    if (!remarks.trim()) {
      setShowWarning(true);
      return;
    }
    onConfirm(remarks);
    setRemarks("");
  };

  return (
    <div style={cancelPopupStyles.overlay}>
      <div style={cancelPopupStyles.modal}>
        <div style={cancelPopupStyles.header}>Cancel Indent</div>
        <div style={cancelPopupStyles.body}>
          <p style={cancelPopupStyles.question}>
            Please provide remarks for cancellation:
          </p>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Enter cancellation remarks..."
            style={cancelPopupStyles.textarea}
            rows={4}
          />
          <div style={cancelPopupStyles.buttonGroup}>
            <button style={cancelPopupStyles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            <button style={cancelPopupStyles.confirmButton} onClick={handleConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
      
      <WarningPopup
        open={showWarning}
        onClose={() => setShowWarning(false)}
        message="Please enter remarks for cancellation"
        title="Warning"
      />
    </div>
  );
}
