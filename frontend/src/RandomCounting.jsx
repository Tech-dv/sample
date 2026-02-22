import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import AppShell from "./AppShell";
import { getButtonStyle } from "./styles";
import { API_BASE } from "./api";
import SuccessPopup from "./components/SuccessPopup";
import DraftSavePopup from "./components/DraftSavePopup";
import InspectionCompletedConfirmPopup from "./components/InspectionCompletedConfirmPopup";
import WarningPopup from "./components/WarningPopup";
import { idToUrlParam } from "./utils/trainIdUtils";


const POLL_INTERVAL = 2000;

const formatDateTime24 = (value) => {
  if (!value) return "-";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds}`;
  } catch {
    return "-";
  }
};

function RandomCounting() {
  const navigate = useNavigate();
  const { id } = useParams(); // Get record ID from URL if editing/viewing
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode"); // "edit" for editing, null for viewing
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDraftPopup, setShowDraftPopup] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [warning, setWarning] = useState({ open: false, message: "", title: "Warning" });
  const pollRef = useRef(null);

  // Get current user role from localStorage
  const role = localStorage.getItem("role") || "ADMIN";

  /* ================= MASTER DATA ================= */
  const [trains, setTrains] = useState([]);
  const [wagons, setWagons] = useState([]);
  const [existingRecord, setExistingRecord] = useState(null);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);

  /* ================= SELECTION ================= */
  const [trainId, setTrainId] = useState("");
  const [wagon, setWagon] = useState(null);

  /* ================= COUNTS ================= */
  const [currentLoaded, setCurrentLoaded] = useState(0);
  const [currentUnloaded, setCurrentUnloaded] = useState(0);
  const [inspectedLoaded, setInspectedLoaded] = useState(0);
  const [inspectedUnloaded, setInspectedUnloaded] = useState(0);

  /* ================= INSPECTION ================= */
  const [inspectionStarted, setInspectionStarted] = useState(false);
  const [inspectionCompleted, setInspectionCompleted] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  /* ================= FORM ================= */
  const [form, setForm] = useState({
    client_surveyor_name: "",
    bothra_surveyor_name: "",
    client_representative_name: "",
    remarks: "",
  });

  /* ================= DETAILS ================= */
  const [selected, setSelected] = useState(null);

  /* ================= LOAD TRAINS ================= */
  useEffect(() => {
    fetch(`${API_BASE}/random-counting/trains`, {
      headers: { "x-user-role": role },
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error("Failed to load trains");
        }
        return r.json();
      })
      .then(setTrains)
      .catch((err) => {
        console.error("Failed to load trains:", err);
        setWarning({ open: true, message: "Failed to load trains. Please try again.", title: "Error" });
      });
  }, [role]);

  /* ================= LOAD EXISTING RECORD ================= */
  useEffect(() => {
    if (!id) return; // New inspection, no existing record

    setIsLoadingRecord(true);
    fetch(`${API_BASE}/random-counting/${id}`, {
      headers: { "x-user-role": role },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load record");
        return r.json();
      })
      .then((record) => {
        setExistingRecord(record);
        setTrainId(record.train_id || record.rake_serial_number || "");

        // Load form data
        setForm({
          client_surveyor_name: record.client_surveyor_name || "",
          bothra_surveyor_name: record.bothra_surveyor_name || "",
          client_representative_name: record.client_representative_name || "",
          remarks: record.remarks || "",
        });

        // Load inspection status and times
        if (record.random_count_start_time) {
          setInspectionStarted(true);
          setStartTime(formatDateTime24(record.random_count_start_time));
        }

        if (record.random_count_end_time) {
          setInspectionCompleted(true);
          setEndTime(formatDateTime24(record.random_count_end_time));
        }

        // Load inspected counts
        if (record.inspected_loading_count !== undefined) {
          setInspectedLoaded(record.inspected_loading_count || 0);
        }
        if (record.inspected_unloading_count !== undefined) {
          setInspectedUnloaded(record.inspected_unloading_count || 0);
        }
      })
      .catch((err) => {
        console.error("Failed to load record:", err);
        setWarning({ open: true, message: "Failed to load inspection record", title: "Error" });
      })
      .finally(() => {
        setIsLoadingRecord(false);
      });
  }, [id, mode, role]);

  /* ================= LOAD WAGONS ================= */
  useEffect(() => {
    if (!trainId) {
      setWagons([]);
      setWagon(null);
      return;
    }
    // ✅ FIX: Use underscore encoding for rake_serial_number in URL path
    fetch(`${API_BASE}/random-counting/wagons/${idToUrlParam(trainId)}`, {
      headers: { "x-user-role": role },
    })
      .then((r) => r.json())
      .then((data) => {
        // Filter wagons to only show those with loading_completed = true (for new inspections)
        // For existing records, show all wagons but still filter for new selections
        if (!existingRecord) {
          // New inspection: only show wagons with loading_completed = true
          const completedWagons = data.filter(w => w.loading_completed === true);
          setWagons(completedWagons);
        } else {
          // Existing record: show all wagons, but if editing, allow selecting only completed ones
          setWagons(data);
        }

        // If loading existing record, find and set the wagon
        if (existingRecord && existingRecord.wagon_number) {
          const foundWagon = data.find(w => w.wagon_number === existingRecord.wagon_number);
          if (foundWagon) {
            setWagon(foundWagon);
          }
        } else {
          setWagon(null);
          resetCounts();
        }
      })
      .catch((err) => {
        console.error("Failed to load wagons:", err);
      });
  }, [trainId, existingRecord, role]);

  /* ================= LOAD CURRENT COUNTS ================= */
  useEffect(() => {
    if (!wagon || !trainId) return;

    // If loading existing record, use its data
    if (existingRecord && existingRecord.wagon_number === wagon.wagon_number) {
      setCurrentLoaded(existingRecord.start_loaded_count || 0);
      setCurrentUnloaded(existingRecord.start_unloaded_count || 0);
      setInspectedLoaded(existingRecord.inspected_loading_count || 0);
      setInspectedUnloaded(existingRecord.inspected_unloading_count || 0);
      setWagon((prev) => ({
        ...prev,
        start_loaded_count: existingRecord.start_loaded_count || 0,
        start_unloaded_count: existingRecord.start_unloaded_count || 0,
      }));
      return;
    }

    // For new inspections, fetch live counts
    // ✅ FIX: Use underscore encoding for path, encodeURIComponent for query params
    fetch(
      `${API_BASE}/random-counting/live-count?train_id=${idToUrlParam(trainId)}&wagon_number=${encodeURIComponent(wagon.wagon_number)}`,
      { headers: { "x-user-role": role } }
    )
      .then((r) => r.json())
      .then((data) => {
        setCurrentLoaded(data.loaded_bag_count);
        setCurrentUnloaded(data.unloaded_bag_count);
        setInspectedLoaded(0);
        setInspectedUnloaded(0);
        setWagon((prev) => ({
          ...prev,
          start_loaded_count: data.loaded_bag_count,
          start_unloaded_count: data.unloaded_bag_count,
        }));
      })
      .catch((err) => {
        console.error("Failed to load live counts:", err);
      });
  }, [wagon?.wagon_number, trainId, existingRecord, role]);

  /* ================= POLLING ================= */
  useEffect(() => {
    // Only poll if inspection is started but not completed
    if (!inspectionStarted || inspectionCompleted || !wagon) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(async () => {
      // ✅ FIX: Use underscore encoding for path, encodeURIComponent for query params
      const res = await fetch(
        `${API_BASE}/random-counting/live-count?train_id=${idToUrlParam(trainId)}&wagon_number=${encodeURIComponent(wagon.wagon_number)}`,
        { headers: { "x-user-role": role } }
      );
      if (!res.ok) return;
      const data = await res.json();
      setCurrentLoaded(data.loaded_bag_count);
      setCurrentUnloaded(data.unloaded_bag_count);
      // Calculate inspected counts based on difference from start
      if (wagon.start_loaded_count !== undefined) {
        setInspectedLoaded(data.loaded_bag_count - (wagon.start_loaded_count || 0));
      }
      if (wagon.start_unloaded_count !== undefined) {
        setInspectedUnloaded(data.unloaded_bag_count - (wagon.start_unloaded_count || 0));
      }
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [inspectionStarted, inspectionCompleted, wagon, trainId, role]);

  /* ================= START ================= */
  const startInspection = async () => {
    if (!wagon) {
      setWarning({ open: true, message: "Please select a wagon first", title: "Warning" });
      return;
    }

    // If editing existing record that's already started, just update UI
    if (existingRecord && existingRecord.status === "IN_PROGRESS") {
      setInspectionStarted(true);
      setStartTime(
        existingRecord.random_count_start_time
          ? formatDateTime24(existingRecord.random_count_start_time)
          : formatDateTime24(new Date())
      );
      return;
    }

    // For new inspections, create the record and set start time
    const res = await fetch(`${API_BASE}/random-counting/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-role": role,
      },
      body: JSON.stringify({
        train_id: trainId,
        wagon_number: wagon.wagon_number,
        tower_number: wagon.tower_number,
        start_loaded_count: wagon.start_loaded_count || currentLoaded,
        start_unloaded_count: wagon.start_unloaded_count || currentUnloaded,
      }),
    });
    if (!res.ok) {
      setWarning({ open: true, message: "Failed to start inspection", title: "Error" });
      return;
    }
    setInspectionStarted(true);
    const now = new Date();
    setStartTime(formatDateTime24(now));

    // If this is a new record, we need to reload it to get the ID
    // For now, we'll handle it in the save function
  };

  /* ================= HANDLE INSPECTION COMPLETED TOGGLE ================= */
  const handleInspectionCompletedToggle = (checked) => {
    if (checked && !inspectionCompleted) {
      // Show confirmation popup before turning ON
      setShowConfirmPopup(true);
    } else if (!checked && inspectionCompleted) {
      // Cannot turn OFF once it's ON
      setWarning({ open: true, message: "Once inspection is completed, it cannot be undone.", title: "Warning" });
    }
  };

  const confirmInspectionCompleted = () => {
    setShowConfirmPopup(false);
    setInspectionCompleted(true);
    setEndTime(formatDateTime24(new Date()));
    clearInterval(pollRef.current);
  };

  const cancelInspectionCompleted = () => {
    setShowConfirmPopup(false);
  };

  /* ================= CHECK IF FORM IS COMPLETE ================= */
  const isFormComplete = () => {
    // If inspection completed is ON, all fields including remarks are mandatory
    if (inspectionCompleted) {
      return (
        form.client_surveyor_name && form.client_surveyor_name.trim() !== "" &&
        form.bothra_surveyor_name && form.bothra_surveyor_name.trim() !== "" &&
        form.client_representative_name && form.client_representative_name.trim() !== "" &&
        form.remarks && form.remarks.trim() !== ""
      );
    }
    // If inspection completed is OFF but in edit mode, remarks is mandatory
    if (existingRecord && mode === "edit") {
      return form.remarks && form.remarks.trim() !== "";
    }
    // If inspection completed is OFF and not in edit mode, no fields are mandatory
    return true;
  };

  const getMissingFields = () => {
    const missing = [];
    if (inspectionCompleted) {
      // All fields mandatory when inspection completed
      if (!form.client_surveyor_name || form.client_surveyor_name.trim() === "") {
        missing.push("Client Surveyor Name");
      }
      if (!form.bothra_surveyor_name || form.bothra_surveyor_name.trim() === "") {
        missing.push("Bothra Surveyor Name");
      }
      if (!form.client_representative_name || form.client_representative_name.trim() === "") {
        missing.push("Client Representative Name");
      }
      if (!form.remarks || form.remarks.trim() === "") {
        missing.push("Remarks");
      }
    } else if (existingRecord && mode === "edit") {
      // Remarks mandatory in edit mode even if not completed
      if (!form.remarks || form.remarks.trim() === "") {
        missing.push("Remarks");
      }
    }
    return missing;
  };

  /* ================= SAVE ================= */
  const save = async () => {
    if (!wagon) {
      setWarning({ open: true, message: "Please select a wagon", title: "Warning" });
      return;
    }

    if (!inspectionStarted) {
      setWarning({ open: true, message: "Please start the inspection first", title: "Warning" });
      return;
    }

    // Validate required fields based on completion status and edit mode
    if (!isFormComplete()) {
      const missing = getMissingFields();
      setWarning({ open: true, message: `Please fill all required fields: ${missing.join(", ")}`, title: "Warning" });
      return;
    }

    // Prepare payload
    const payload = {
      train_id: trainId,
      wagon_number: wagon.wagon_number,
      inspected_loading_count: inspectedLoaded,
      inspected_unloading_count: inspectedUnloaded,
      inspection_completed: inspectionCompleted,
      ...form,
    };

    // If updating existing record, include the ID
    if (existingRecord && existingRecord.id) {
      payload.id = existingRecord.id;
    }

    // Use save endpoint for both IN_PROGRESS and COMPLETED
    const response = await fetch(`${API_BASE}/random-counting/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-role": role,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setWarning({ open: true, message: "Save failed", title: "Error" });
      return;
    }

    // Show appropriate popup based on completion status
    if (inspectionCompleted) {
      setShowSuccess(true);
    } else {
      setShowDraftPopup(true);
    }
  };

  /* ================= CHECK IF VIEW MODE ================= */
  // View mode: when viewing (not editing) any existing record, regardless of status
  const isViewMode = existingRecord && mode !== "edit";

  const resetCounts = () => {
    setCurrentLoaded(0);
    setCurrentUnloaded(0);
    setInspectedLoaded(0);
    setInspectedUnloaded(0);
    setInspectionStarted(false);
    setInspectionCompleted(false);
    setStartTime("");
    setEndTime("");
  };

  if (isLoadingRecord) {
    return (
      <AppShell>
        <div style={styles.page}>
          <div style={styles.loading}>Loading inspection record...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <style>{`
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
      <div style={styles.page}>
        <div style={styles.content}>
          <div style={styles.header}>
            <h1 style={styles.pageTitle}>
              {isViewMode ? "View Random Counting Inspection" : existingRecord ? "Edit Random Counting Inspection" : "New Random Counting Inspection"}
            </h1>
          </div>

          {/* ================= INSPECTION FORM ================= */}
          <div style={styles.formWrapper}>
            <div style={styles.formContainer}>
              {/* Row 1: Rake Serial Number, Wagon Number, Current Loaded Count */}
              <div style={styles.formRow}>
                <fieldset style={{
                  ...fieldStyles.fieldset,
                  background: (isViewMode || !!existingRecord) ? "#f4f4f4" : "white",
                }}>
                  <legend style={fieldStyles.legend}>Rake Serial Number</legend>
                  <select
                    value={trainId}
                    onChange={(e) => setTrainId(e.target.value)}
                    disabled={isViewMode || !!existingRecord}
                    style={{
                      ...fieldStyles.input,
                      background: (isViewMode || !!existingRecord) ? "#f4f4f4" : "white",
                      cursor: (isViewMode || !!existingRecord) ? "not-allowed" : "pointer",
                    }}
                  >
                    <option value="">Select Rake Serial Number</option>
                    {trains.map((t) => (
                      <option key={t.train_id} value={t.train_id}>
                        {t.train_id}
                      </option>
                    ))}
                  </select>
                </fieldset>

                <fieldset style={{
                  ...fieldStyles.fieldset,
                  background: (!trainId || isViewMode || !!existingRecord) ? "#f4f4f4" : "white",
                }}>
                  <legend style={fieldStyles.legend}>Wagon Number</legend>
                  <select
                    value={wagon?.wagon_number || ""}
                    onChange={(e) => {
                      const foundWagon = wagons.find(
                        (w) => w.wagon_number === e.target.value
                      );
                      if (foundWagon) {
                        setWagon(foundWagon);
                        // Reset counts when wagon changes (for new inspections)
                        if (!existingRecord) {
                          setInspectedLoaded(0);
                          setInspectedUnloaded(0);
                        }
                      }
                    }}
                    disabled={!trainId || isViewMode || !!existingRecord || inspectionStarted}
                    style={{
                      ...fieldStyles.input,
                      background: (!trainId || isViewMode || !!existingRecord || inspectionStarted) ? "#f4f4f4" : "white",
                      cursor: (!trainId || isViewMode || !!existingRecord || inspectionStarted) ? "not-allowed" : "pointer",
                    }}
                  >
                    <option value="">Select Wagon</option>
                    {wagons.map((w) => (
                      <option key={w.wagon_number} value={w.wagon_number}>
                        {w.wagon_number}
                      </option>
                    ))}
                  </select>
                </fieldset>

                <Field
                  label="Current Loaded Count"
                  value={currentLoaded}
                  readOnly
                />
              </div>

              {/* Row 2: Inspected Unloading Count, Random Counting Start Date & Time */}
              <div style={styles.formRow}>
                <Field
                  label="Inspected Unloading Count"
                  type="number"
                  value={inspectedUnloaded || ""}
                  readOnly
                />

                <Field
                  label="Random Counting Start Date & Time"
                  value={startTime || "-"}
                  readOnly
                  placeholder="-"
                />
              </div>

              {/* Row 3: Client Surveyor Name, Bothra Surveyor Name, Client Representative Name */}
              <div style={styles.formRow}>
                <Field
                  label="Client Surveyor Name"
                  value={form.client_surveyor_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      client_surveyor_name: e,
                    })
                  }
                  readOnly={isViewMode || !inspectionStarted}
                  required={inspectionCompleted}
                />

                <Field
                  label="Bothra Surveyor Name"
                  value={form.bothra_surveyor_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      bothra_surveyor_name: e,
                    })
                  }
                  readOnly={isViewMode || !inspectionStarted}
                  required={inspectionCompleted}
                />

                <Field
                  label="Client Representative Name"
                  value={form.client_representative_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      client_representative_name: e,
                    })
                  }
                  readOnly={isViewMode || !inspectionStarted}
                  required={inspectionCompleted}
                />
              </div>

              {/* Row 4: Random Counting End Date & Time, Inspected Loading Count, Remarks */}
              <div style={styles.formRow}>
                <Field
                  label="Random Counting End Date & Time"
                  value={endTime || "-"}
                  readOnly
                  placeholder="-"
                />

                <Field
                  label="Inspected Loading Count"
                  type="number"
                  value={inspectedLoaded || ""}
                  readOnly
                />

                <Field
                  label="Remarks"
                  value={form.remarks}
                  onChange={(e) =>
                    setForm({ ...form, remarks: e })
                  }
                  readOnly={isViewMode || !inspectionStarted}
                  required={inspectionCompleted || (existingRecord && mode === "edit")}
                />
              </div>
            </div>

            {/* Toggle Switches on the Right */}
            <div style={styles.toggleSection}>
              <div style={styles.toggleItem}>
                <label style={styles.toggleLabel}>Inspection Started</label>
                <ToggleSwitch
                  checked={inspectionStarted}
                  onChange={(checked) => {
                    if (checked && !inspectionStarted) {
                      startInspection();
                    } else if (!checked && inspectionStarted) {
                      // Cannot turn off once started
                      setWarning({ open: true, message: "Once inspection is started, it cannot be undone.", title: "Warning" });
                    }
                  }}
                  disabled={isViewMode || inspectionStarted}
                />
              </div>
              <div style={styles.toggleItem}>
                <label style={styles.toggleLabel}>Inspection Completed</label>
                <ToggleSwitch
                  checked={inspectionCompleted}
                  onChange={handleInspectionCompletedToggle}
                  disabled={isViewMode || inspectionCompleted || !inspectionStarted}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons at Bottom */}
          <div style={styles.footer}>
            <button
              style={getButtonStyle("back")}
              onClick={() => navigate(-1)}
            >
              Back
            </button>
            {!isViewMode && (
              <button
                style={{
                  ...styles.saveButton,
                  ...(isFormComplete() ? {} : styles.saveButtonDisabled)
                }}
                onClick={save}
                disabled={!isFormComplete() || !inspectionStarted}
              >
                Save
              </button>
            )}
          </div>

          <DraftSavePopup
            open={showDraftPopup}
            onClose={() => {
              setShowDraftPopup(false);
              navigate("/random-counting");
            }}
          />

          <SuccessPopup
            open={showSuccess}
            onClose={() => {
              setShowSuccess(false);
              navigate("/random-counting");
            }}
            title="Inspection Completed"
            message="Random Counting Records Saved Successfully"
          />

          <InspectionCompletedConfirmPopup
            open={showConfirmPopup}
            onClose={cancelInspectionCompleted}
            onYes={confirmInspectionCompleted}
            onNo={cancelInspectionCompleted}
          />
          <WarningPopup
            open={warning.open}
            onClose={() => setWarning({ open: false, message: "", title: "Warning" })}
            message={warning.message}
            title={warning.title}
          />
        </div>
      </div>
    </AppShell>
  );
}

/* ================= HELPERS ================= */
const Field = ({ label, value, onChange, readOnly, type = "text", required = false, error, placeholder, list }) => {
  const isSelect = type === "select" && !readOnly;

  return (
    <fieldset style={{
      ...fieldStyles.fieldset,
      background: readOnly ? "#f4f4f4" : "white",
    }}>
      <legend style={fieldStyles.legend}>
        {label}
        {required && <span style={{ color: "#d32f2f", marginLeft: "2px" }}>*</span>}
      </legend>
      {isSelect ? (
        <select
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={{
            ...fieldStyles.input,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {onChange && onChange.options ? onChange.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )) : null}
        </select>
      ) : (
        <div style={{ position: "relative" }}>
          <input
            type={type}
            value={value !== undefined && value !== null ? value : ""}
            readOnly={readOnly}
            onChange={(e) => onChange && onChange(e.target.value)}
            placeholder={placeholder}
            list={list}
            style={{
              ...fieldStyles.input,
              background: readOnly ? "#f4f4f4" : "white",
              padding: "0",
              ...(type === "number" ? fieldStyles.numberInput : {}),
              cursor: readOnly ? "not-allowed" : "text",
            }}
          />
        </div>
      )}
      {error && (
        <div style={{ marginTop: "4px", fontSize: "12px", color: "#d32f2f" }}>
          {error}
        </div>
      )}
    </fieldset>
  );
};

const ToggleSwitch = ({ checked, onChange, disabled }) => (
  <div
    style={{
      ...styles.toggleSwitch,
      backgroundColor: checked ? "#0B3A6E" : "#ccc",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
    }}
    onClick={() => !disabled && onChange(!checked)}
  >
    <div
      style={{
        ...styles.toggleSlider,
        transform: checked ? "translateX(24px)" : "translateX(2px)",
      }}
    />
  </div>
);

/* ================= STYLES ================= */
const styles = {
  page: {
    padding: "45px 40px 30px",
    background: "#ffffffff",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  content: {
    width: "100%",
    maxWidth: "1400px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "30px",
  },
  pageTitle: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#1a3a5f",
    margin: 0,
  },
  backButton: {
    padding: "10px 20px",
    backgroundColor: "#6c757d",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  loading: {
    textAlign: "center",
    padding: "50px",
    fontSize: "18px",
    color: "#666",
  },
  formWrapper: {
    display: "flex",
    gap: "30px",
    marginBottom: "20px",
    width: "100%",
  },
  formContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "60px",
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    columnGap: "20px",
    rowGap: "60px",
  },
  toggleSection: {
    display: "flex",
    flexDirection: "column",
    gap: "30px",
    paddingLeft: "30px",
    borderLeft: "2px solid #e0e0e0",
    minWidth: "250px",
  },
  toggleItem: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  toggleLabel: {
    fontWeight: "600",
    color: "#333",
    fontSize: "14px",
  },
  toggleSwitch: {
    width: "50px",
    height: "26px",
    borderRadius: "13px",
    position: "relative",
    transition: "background-color 0.3s",
  },
  toggleSlider: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    backgroundColor: "#fff",
    position: "absolute",
    top: "2px",
    left: "2px",
    transition: "transform 0.3s",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "15px",
    marginTop: "80px",
    width: "100%",
    maxWidth: "1230px",
  },
  cancelButton: {
    padding: "12px 35px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
    background: "#b0b0b0",
    color: "#fff",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
    transition: "all 0.2s",
  },
  saveButton: {
    padding: "12px 35px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
    background: "#0B3A6E",
    color: "#fff",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
    transition: "all 0.2s",
  },
  saveButtonDisabled: {
    background: "#9bb5d1",
    color: "#e0e0e0",
    cursor: "not-allowed",
    opacity: 0.6,
  },
};

const fieldStyles = {
  fieldset: {
    border: "1px solid #333",
    borderRadius: "4px",
    padding: "15px 12px 20px",
    margin: 0,
    position: "relative",
    background: "white",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  legend: {
    fontSize: "12px",
    fontWeight: "500",
    padding: "0 6px",
    color: "#333",
  },
  input: {
    border: "none",
    padding: "0",
    fontSize: "14px",
    outline: "none",
    width: "100%",
    fontWeight: "400",
    color: "#333",
  },
  numberInput: {
    MozAppearance: "textfield", // Firefox
  },
};


export default RandomCounting;