import { useState } from "react";
import WarningPopup from "../components/WarningPopup";

/**
 * Custom hook for showing warning popups
 * 
 * Usage:
 *   const { showWarning, WarningPopupComponent } = useWarningPopup();
 *   
 *   // Show warning
 *   showWarning("Your warning message here");
 *   
 *   // In JSX
 *   {WarningPopupComponent}
 */
export function useWarningPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("Warning");

  const showWarning = (msg, warningTitle = "Warning") => {
    setMessage(msg);
    setTitle(warningTitle);
    setIsOpen(true);
  };

  const hideWarning = () => {
    setIsOpen(false);
  };

  const WarningPopupComponent = (
    <WarningPopup
      open={isOpen}
      onClose={hideWarning}
      message={message}
      title={title}
    />
  );

  return {
    showWarning,
    hideWarning,
    WarningPopupComponent,
  };
}
