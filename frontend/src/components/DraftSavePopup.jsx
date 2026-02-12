import { useEffect, useState } from "react";
import approvedTick from "../assets/approved_tick.png";
import { draftSavePopupStyles } from "./popupStyles";

export default function DraftSavePopup({ open, onClose }) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!open) return;

    setCountdown(5);

    const interval = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    const timer = setTimeout(() => {
      onClose();
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={draftSavePopupStyles.overlay}>
      <div style={draftSavePopupStyles.modal}>
        <img
          src={approvedTick}
          alt="Draft Saved"
          style={draftSavePopupStyles.image}
        />

        <h2 style={draftSavePopupStyles.title}>Draft Saved</h2>

        <p style={draftSavePopupStyles.message}>
          Your changes have been saved successfully.
        </p>

        {/* ✅ COUNTDOWN TEXT */}
        <p style={{ fontSize: "13px", color: "#777", marginBottom: "18px" }}>
          Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}
        </p>

        <button style={draftSavePopupStyles.button} onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
