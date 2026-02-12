import { useEffect, useState } from "react";
import approvedTick from "../assets/approved_tick.png";
import { successPopupStyles } from "./popupStyles";

export default function SuccessPopup({ 
  open, 
  onClose, 
  title = "Completed", 
  message = "Records Shared For Review.",
  countdown = 5 
}) {
  const [currentCountdown, setCurrentCountdown] = useState(countdown);

  useEffect(() => {
    if (!open) return;

    setCurrentCountdown(countdown);

    const interval = setInterval(() => {
      setCurrentCountdown((prev) => prev - 1);
    }, 1000);

    const timer = setTimeout(() => {
      onClose();
    }, countdown * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [open, onClose, countdown]);

  if (!open) return null;

  return (
    <div style={successPopupStyles.overlay}>
      <div style={successPopupStyles.modal}>
        <img
          src={approvedTick}
          alt={title}
          style={successPopupStyles.image}
        />

        <h2 style={successPopupStyles.title}>{title}</h2>

        <p style={successPopupStyles.message}>
          {message}
        </p>

        {/* ✅ COUNTDOWN TEXT */}
        <p style={{ fontSize: "13px", color: "#777", marginBottom: "18px" }}>
          {countdown > 0 ? (
            <>Redirecting in {currentCountdown} second{currentCountdown !== 1 ? "s" : ""}</>
          ) : (
            <>Auto-closing in {currentCountdown} second{currentCountdown !== 1 ? "s" : ""}</>
          )}
        </p>

        <button style={successPopupStyles.button} onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
