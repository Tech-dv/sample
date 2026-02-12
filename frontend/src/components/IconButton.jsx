import viewIcon from "../assets/eye_button.png";
import editIcon from "../assets/edit_button.png";

const iconButtonStyles = {
  background: "none",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  margin: "0",
};

export default function IconButton({ label, onClick, style = {} }) {
  const icon = label === "View" ? viewIcon : editIcon;

  return (
    <button
      onClick={onClick}
      title={label}
      style={{ ...iconButtonStyles, ...style }}
    >
      <img
        src={icon}
        alt={label}
        style={{
          width: "18px",
          height: "18px",
          objectFit: "contain",
          cursor: "pointer",
        }}
      />
    </button>
  );
}
