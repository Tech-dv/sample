// Shared Design System - Based on Dispatch Details Page Design

export const colors = {
  primaryBlue: "#0b3c78",      // Dark blue for headers
  secondaryBlue: "#2563eb",    // Blue for buttons
  darkBlue: "#082f5b",         // Darker blue
  grey: "#9e9e9e",             // Grey for cancel buttons
  lightGrey: "#e5e7eb",        // Light grey for table rows
  white: "#ffffff",
  success: "#16a34a",         // Green for approve
  danger: "#dc2626",           // Red for reject
  cardBg: "#ffffff",
  border: "#d1d5db",
};

// ================= TABLE STYLES =================
export const tableStyles = {
  container: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "20px",
  },
  header: {
    backgroundColor: colors.primaryBlue,
    color: colors.white,
    padding: "12px",
    textAlign: "left",
    fontWeight: "bold",
    border: "none",
  },
  row: (index) => ({
    backgroundColor: index % 2 === 0 ? colors.white : colors.lightGrey,
    borderBottom: "1px solid #d1d5db",
  }),
  cell: {
    padding: "10px",
    border: "none",
  },
};

// ================= BUTTON STYLES =================
export const buttonStyles = {
  base: {
    padding: "10px 20px",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    fontWeight: "500",
    fontSize: "14px",
    transition: "all 0.2s",
  },
  cancel: {
    backgroundColor: colors.grey,
    color: colors.white,
  },
  save: {
    backgroundColor: "#5b9bd5", // Match DispatchPage.jsx save button color
    color: colors.white,
  },
  proceed: {
    backgroundColor: colors.primaryBlue, // Dark blue
    color: colors.white,
  },
  submit: {
    backgroundColor: colors.primaryBlue, // Dark blue
    color: colors.white,
  },
  approve: {
    backgroundColor: colors.success,
    color: colors.white,
  },
  reject: {
    backgroundColor: colors.danger,
    color: colors.white,
  },
  upload: {
    backgroundColor: colors.secondaryBlue,
    color: colors.white,
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  add: {
    backgroundColor: colors.secondaryBlue,
    color: colors.white,
    padding: "8px 16px",
    fontSize: "13px",
  },
  action: {
    backgroundColor: "transparent",
    border: "1px solid #d1d5db",
    padding: "6px 12px",
    fontSize: "12px",
  },
};

// ================= INPUT STYLES =================
export const inputStyles = {
  base: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "4px",
    border: `1px solid ${colors.border}`,
    fontSize: "14px",
    outline: "none",
    backgroundColor: colors.white,
    boxSizing: "border-box",
  },
  readOnly: {
    backgroundColor: "#f3f4f6",
    cursor: "not-allowed",
  },
  select: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "4px",
    border: `1px solid ${colors.border}`,
    fontSize: "14px",
    backgroundColor: colors.white,
    cursor: "pointer",
  },
};

// ================= CARD STYLES =================
export const cardStyles = {
  container: {
    backgroundColor: colors.cardBg,
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  header: {
    marginBottom: "15px",
    fontSize: "18px",
    fontWeight: "600",
    color: "#111827",
  },
};

// ================= FIELD STYLES =================
export const fieldStyles = {
  container: {
    marginBottom: "15px",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "14px",
    fontWeight: "500",
    color: "#374151",
  },
};

// ================= SUMMARY CARD STYLES =================
export const summaryCardStyles = {
  container: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "15px",
    marginBottom: "20px",
  },
  card: {
    backgroundColor: "#f3f4f6",
    padding: "20px",
    borderRadius: "6px",
    border: `1px solid ${colors.border}`,
  },
  title: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: "8px",
  },
  value: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#111827",
  },
};

// ================= BUTTON GROUP STYLES =================
export const buttonGroupStyles = {
  container: {
    marginTop: "30px",
    display: "flex",
    gap: "10px",
    justifyContent: "flex-start",
  },
};

// Helper function to combine button styles
export const getButtonStyle = (type) => ({
  ...buttonStyles.base,
  ...buttonStyles[type],
});

// Helper function to combine input styles
export const getInputStyle = (readOnly = false) => ({
  ...inputStyles.base,
  ...(readOnly ? inputStyles.readOnly : {}),
});

