import { useEffect, useState } from "react";
import { editOptionsPopupStyles } from "./popupStyles";
import WarningPopup from "./WarningPopup";

export default function EditOptionsPopup({ open, onClose, onProceed }) {
  // Start with no selection so user must choose explicitly
  const [singleIndent, setSingleIndent] = useState(null); // true / false / null
  const [wagonTypeHL, setWagonTypeHL] = useState(null);   // true / false / null
  const [showWarning, setShowWarning] = useState(false);

  // Reset state when popup opens
  useEffect(() => {
    if (open) {
      setSingleIndent(null);
      setWagonTypeHL(null);
      setShowWarning(false);
    }
  }, [open]);
  
  if (!open) return null;

  const handleProceed = () => {
    // Require user to select both options
    if (singleIndent === null || wagonTypeHL === null) {
      setShowWarning(true);
      return;
    }

    onProceed({ singleIndent, wagonTypeHL });
  };

  return (
    <div style={editOptionsPopupStyles.overlay}>
      <div style={editOptionsPopupStyles.modal}>
        <div style={editOptionsPopupStyles.header}>
          Before Creating Entry
          <button
            style={editOptionsPopupStyles.closeButton}
            onClick={onClose}
            onMouseOver={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.2)"}
            onMouseOut={(e) => e.target.style.backgroundColor = "transparent"}
            title="Close"
          >
            ×
          </button>
        </div>
        
        <div style={editOptionsPopupStyles.subHeader}>Please Select Below Options:</div>

        {/* Single Indent Option */}
        <div style={editOptionsPopupStyles.optionRow}>
          <span style={editOptionsPopupStyles.optionLabel}>Single Indent :</span>
          <div style={editOptionsPopupStyles.toggleGroup}>
            <button
              style={{
                ...editOptionsPopupStyles.toggleButton,
                ...(singleIndent === true ? editOptionsPopupStyles.activeYes : editOptionsPopupStyles.inactiveButton)
              }}
              onClick={() => setSingleIndent(true)}
            >
              Yes
            </button>
            <button
              style={{
                ...editOptionsPopupStyles.toggleButton,
                ...(singleIndent === false ? editOptionsPopupStyles.activeNo : editOptionsPopupStyles.inactiveButton)
              }}
              onClick={() => setSingleIndent(false)}
            >
              No
            </button>
          </div>
        </div>

        {/* Wagon Type (HL) Option */}
        <div style={editOptionsPopupStyles.optionRow}>
          <span style={editOptionsPopupStyles.optionLabel}>Wagon Type(HL) :</span>
          <div style={editOptionsPopupStyles.toggleGroup}>
            <button
              style={{
                ...editOptionsPopupStyles.toggleButton,
                ...(wagonTypeHL === true ? editOptionsPopupStyles.activeYes : editOptionsPopupStyles.inactiveButton)
              }}
              onClick={() => setWagonTypeHL(true)}
            >
              Yes
            </button>
            <button
              style={{
                ...editOptionsPopupStyles.toggleButton,
                ...(wagonTypeHL === false ? editOptionsPopupStyles.activeNo : editOptionsPopupStyles.inactiveButton)
              }}
              onClick={() => setWagonTypeHL(false)}
            >
              No
            </button>
          </div>
        </div>

        <button style={editOptionsPopupStyles.proceedButton} onClick={handleProceed}>
          Proceed
        </button>
      </div>
      
      <WarningPopup
        open={showWarning}
        onClose={() => setShowWarning(false)}
        message="Please select options for both 'Single Indent' and 'Wagon Type(HL)' before proceeding."
        title="Warning"
      />
    </div>
  );
}
