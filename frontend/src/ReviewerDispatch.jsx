import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "./AppShell";
import approvedTick from "./assets/approved_tick.png";
import { getButtonStyle } from "./styles";
import { API_BASE } from "./api";
import { useAutoSave, loadSavedData, clearSavedData } from "./hooks/useAutoSave";
import { formatActivityText } from "./utils/formatActivityText";
import SuccessPopup from "./components/SuccessPopup";
import CancelPopup from "./components/CancelPopup";


/* ================= MAIN PAGE ================= */
export default function ReviewerDispatch() {
  const { trainId: encodedTrainId } = useParams();
  const trainId = encodedTrainId ? decodeURIComponent(encodedTrainId) : null;
  const [searchParams] = useSearchParams();
  const indentNumber = searchParams.get('indent_number');
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const reviewerUsername = localStorage.getItem("username");

  const [siding, setSiding] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [cancelRemarks, setCancelRemarks] = useState("");

  const [form, setForm] = useState({
    indent_wagon_count: "",
    vessel_name: "",
    rake_type: "",
    rake_placement_datetime: "",
    rake_clearance_datetime: "",
    rake_idle_time: "",
    loading_start_officer: "",
    loading_completion_officer: "",
    remarks: "",
    rr_number: "",
    rake_loading_end_railway: "",
  });

  const [originalForm, setOriginalForm] = useState(null);

  // Auto-save form data to localStorage
  const autoSaveKey = `reviewer-dispatch-form-${trainId}${indentNumber ? `-${indentNumber}` : ''}`;
  useAutoSave(autoSaveKey, form, 1500); // Save after 1.5 seconds of inactivity

  const [autoData, setAutoData] = useState({
    rake_loading_start_datetime: "",
    rake_loading_end_actual: "",
  });

  const [activities, setActivities] = useState([]);


  /* ================= HELPER: Convert datetime to datetime-local format ================= */
  const formatDateTimeLocal = (dateTimeString) => {
    if (!dateTimeString) return "";
    try {
      const date = new Date(dateTimeString);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn("Invalid date:", dateTimeString);
        return "";
      }

      // ✅ Standard Format: YYYY-MM-DDTHH:mm:ss
      // The value is ALWAYS in 24-hour format (hours: 00-23, e.g., 13:30 for 1:30 PM)
      // HTML5 datetime-local input type stores values in ISO 8601 format with 24-hour time
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0'); // Always 00-23 (24-hour format)
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    } catch (e) {
      console.error("Error formatting date:", dateTimeString, e);
      return "";
    }
  };

  /* ================= FETCH ACTIVITY TIMELINE ================= */
  const fetchActivityTimeline = async () => {
    try {
      const timelineUrl = indentNumber
        ? `${API_BASE}/train/${encodeURIComponent(trainId)}/activity-timeline?indent_number=${encodeURIComponent(indentNumber)}`
        : `${API_BASE}/train/${encodeURIComponent(trainId)}/activity-timeline`;

      const response = await fetch(timelineUrl, {
        headers: {
          "x-user-role": role,
          "x-reviewer-username": reviewerUsername || "",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (err) {
      console.error("Failed to load activity timeline:", err);
    }
  };

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);

    // Load saved form data first
    const savedData = loadSavedData(autoSaveKey);

    // Build URL with indent_number if present (Case 2: multiple indents with same train_id)
    const fetchUrl = indentNumber
      ? `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch?indent_number=${encodeURIComponent(indentNumber)}`
      : `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch`;

    fetch(fetchUrl, {
      headers: {
        "x-user-role": role,
        "x-reviewer-username": reviewerUsername || "",
      },
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to load dispatch data: ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        console.log("=== Dispatch data received ===", d);

        try {
          console.log("Step 1: Setting siding");
          setSiding(d.siding || "");

          if (d.dispatch) {
            console.log("Step 2: Dispatch object exists", d.dispatch);

            console.log("Step 3: Formatting dates");
            const placementDate = formatDateTimeLocal(d.dispatch.rake_placement_datetime);
            console.log("Placement date formatted:", placementDate);
            const clearanceDate = formatDateTimeLocal(d.dispatch.rake_clearance_datetime);
            console.log("Clearance date formatted:", clearanceDate);
            const rakeLoadingEndRailwayDate = formatDateTimeLocal(d.dispatch.rake_loading_end_railway);
            console.log("Rake Loading End Railway date formatted:", rakeLoadingEndRailwayDate);

            console.log("Step 4: Creating form object");
            const f = {
              indent_wagon_count: String(d.dispatch.indent_wagon_count ?? ""),
              vessel_name: String(d.dispatch.vessel_name ?? ""),
              rake_type: String(d.dispatch.rake_type ?? ""),
              rake_placement_datetime: placementDate,
              rake_clearance_datetime: clearanceDate,
              rake_idle_time: String(d.dispatch.rake_idle_time ?? ""),
              loading_start_officer: String(d.dispatch.loading_start_officer ?? ""),
              loading_completion_officer: String(d.dispatch.loading_completion_officer ?? ""),
              remarks: String(d.dispatch.remarks ?? ""),
              rr_number: String(d.dispatch.rr_number ?? ""),
              rake_loading_end_railway: rakeLoadingEndRailwayDate,
            };

            console.log("Step 5: Form data created:", f);

            // Merge saved data with API data (saved data takes priority for user input)
            // But only if the saved data has actual meaningful content (not just empty fields)
            const hasMeaningfulSavedData = savedData &&
              Object.keys(savedData).length > 0 &&
              Object.values(savedData).some(val => val && val.trim && val.trim() !== "");

            if (hasMeaningfulSavedData) {
              console.log("Found saved data from previous session, merging with API data");
              const mergedForm = { ...f, ...savedData };
              setForm(mergedForm);
              // ✅ FIX: Normalize originalForm to match form format for accurate change detection
              const normalizedOriginal = {};
              Object.keys(f).forEach(k => {
                const val = f[k];
                normalizedOriginal[k] = val != null ? String(val).trim() : "";
              });
              setOriginalForm(normalizedOriginal);
            } else {
              // No meaningful saved data - use fresh API data from database
              console.log("Using fresh data from database");
              setForm(f);
              // ✅ FIX: Normalize originalForm to match form format for accurate change detection
              const normalizedOriginal = {};
              Object.keys(f).forEach(k => {
                const val = f[k];
                normalizedOriginal[k] = val != null ? String(val).trim() : "";
              });
              setOriginalForm(normalizedOriginal);

              // Clear any stale autosave data
              if (savedData) {
                console.log("Clearing stale autosave data");
                clearSavedData(autoSaveKey);
              }
            }
            console.log("Step 6: Set form state");
            console.log("Step 7: Set original form state");

            const autoDataObj = {
              rake_loading_start_datetime: String(d.dispatch.rake_loading_start_datetime ?? ""),
              rake_loading_end_actual: String(d.dispatch.rake_loading_end_actual ?? ""),
              door_closing_datetime: String(d.dispatch.door_closing_datetime ?? ""),
              rake_haul_out_datetime: String(d.dispatch.rake_haul_out_datetime ?? ""),
            };
            console.log("Step 8: Auto data created:", autoDataObj);
            setAutoData(autoDataObj);
            console.log("Step 9: Set auto data");
          } else {
            console.log("No dispatch data found, showing empty form");
          }

          console.log("Step 10: Setting loading to false");
          setIsLoading(false);
          console.log("=== Loading complete ===");
        } catch (parseError) {
          console.error("!!! Error parsing dispatch data !!!", parseError);
          console.error("Error stack:", parseError.stack);
          setLoadError(parseError.message);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load dispatch data:", err);
        setLoadError(err.message);
        setIsLoading(false);
      });

    // Fetch activity timeline on mount
    fetchActivityTimeline();
  }, [trainId, indentNumber, role, reviewerUsername]);

  /* ================= REFRESH ACTIVITY TIMELINE ON VISIBILITY CHANGE ================= */
  useEffect(() => {
    // Refresh activity timeline when page becomes visible (e.g., when navigating back from ReviewerVerify)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("[ReviewerDispatch] Page became visible, refreshing activity timeline");
        fetchActivityTimeline();
      }
    };

    // Refresh activity timeline when window receives focus
    const handleFocus = () => {
      console.log("[ReviewerDispatch] Window received focus, refreshing activity timeline");
    fetchActivityTimeline();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Also set up periodic refresh every 10 seconds
    const interval = setInterval(() => {
      fetchActivityTimeline();
    }, 10000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [trainId, indentNumber, role, reviewerUsername]); // ✅ Dependencies ensure fetchActivityTimeline has latest values

  /* ================= UTILS ================= */
  const getChangedFields = () => {
    // Currently unused for saving, but kept for potential diagnostics.
    if (!originalForm) return form;
    const changes = {};
    Object.keys(form).forEach((k) => {
      const formValue = form[k] != null ? String(form[k]).trim() : "";
      const originalValue = originalForm[k] != null ? String(originalForm[k]).trim() : "";
      if (formValue !== originalValue) {
        changes[k] = form[k];
      }
    });
    return changes;
  };

  /* ================= VALIDATION ================= */
  const isFormComplete = () => {
    // Check all required fields (vessel_name and rr_number are now required)
    return (
      form.indent_wagon_count &&
      form.indent_wagon_count.trim() !== "" &&
      form.vessel_name &&
      form.vessel_name.trim() !== "" &&
      form.rake_type &&
      form.rake_type.trim() !== "" &&
      form.rake_placement_datetime &&
      form.rake_placement_datetime.trim() !== "" &&
      form.rake_clearance_datetime &&
      form.rake_clearance_datetime.trim() !== "" &&
      form.rake_idle_time &&
      form.rake_idle_time.trim() !== "" &&
      form.loading_start_officer &&
      form.loading_start_officer.trim() !== "" &&
      form.loading_completion_officer &&
      form.loading_completion_officer.trim() !== "" &&
      form.remarks &&
      form.remarks.trim() !== "" &&
      form.rake_loading_end_railway &&
      form.rake_loading_end_railway.trim() !== "" &&
      form.rr_number &&
      form.rr_number.trim() !== ""
    );
  };

  const saveDraft = async () => {
    // ✅ Only send fields that actually changed compared to originalForm.
    // This avoids treating format-only differences (like date string formats)
    // as reviewer edits and also keeps untouched admin fields out of the payload.
    const data = getChangedFields();
    if (!Object.keys(data).length) return true; // nothing to save

    // Build URL with indent_number if present (Case 2: multiple indents with same train_id)
    const draftUrl = indentNumber
      ? `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch/draft?indent_number=${encodeURIComponent(indentNumber)}`
      : `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch/draft`;

    const res = await fetch(
      draftUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
          "x-reviewer-username": reviewerUsername,
        },
        body: JSON.stringify(data),
      }
    );

    if (!res.ok) {
      alert("Save failed");
      return false;
    }

    // ✅ FIX: Update originalForm for just the changed fields we saved
    // so subsequent edits compare against the latest saved state.
    const updatedOriginal = { ...originalForm };
    Object.keys(data).forEach((k) => {
      const val = form[k];
      updatedOriginal[k] = val != null ? String(val).trim() : "";
    });
    setOriginalForm(updatedOriginal);

    // ✅ FIX: Refresh activity timeline after saving draft (in case reviewer made changes in ReviewerVerify)
    fetchActivityTimeline();

    return true;
  };

  const submit = async () => {
    if (!isFormComplete()) {
      alert("Please fill all required fields before submitting.");
      return;
    }

    // First save dispatch draft
    await saveDraft();

    // Then mark as approved (Loading completed)
    const r = await fetch(
      `${API_BASE}/reviewer/tasks/${encodeURIComponent(trainId)}/approve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
          "x-reviewer-username": reviewerUsername,
        },
        body: JSON.stringify({ indent_number: indentNumber }),
      }
    );

    if (r.ok) {
      // Clear auto-saved data on successful submit
      clearSavedData(autoSaveKey);

      // ✅ FIX: Refresh activity timeline after submission
      fetchActivityTimeline();

      setShowSuccess(true);
    } else {
      // ✅ FIX: Show actual error message from backend
      const errorData = await r.json().catch(() => ({ message: "Submit failed" }));
      console.error("Submit failed:", errorData);
      alert(errorData.message || "Submit failed. Please check if the task is assigned to you.");
    }
  };

  /* ================= CANCEL INDENT HANDLER ================= */
  const handleCancelIndent = async (remarks) => {
    if (!remarks || !remarks.trim()) {
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/reviewer/tasks/${encodeURIComponent(trainId)}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": role,
            "x-reviewer-username": reviewerUsername || "",
          },
          body: JSON.stringify({
            indent_number: indentNumber,
            remarks: cancelRemarks,
          }),
        }
      );

      if (res.ok) {
        // ✅ FIX: Refresh activity timeline after cancellation
        fetchActivityTimeline();

        setShowCancelPopup(false);
        setCancelRemarks("");
        navigate("/task-view");
      } else {
        alert("Failed to cancel indent");
      }
    } catch (err) {
      console.error("Cancel indent error:", err);
      alert("Failed to cancel indent");
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div style={pdf.page}>
          <div style={{ textAlign: "center", padding: "50px" }}>
            <p style={{ fontSize: "18px", color: "#555" }}>Loading dispatch data...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <div style={pdf.page}>
          <div style={{ textAlign: "center", padding: "50px" }}>
            <p style={{ fontSize: "18px", color: "#d32f2f", marginBottom: "20px" }}>
              Error loading dispatch data: {loadError}
            </p>
            <button
              style={pdf.saveButton}
              onClick={() => navigate("/task-view")}
            >
              Back to Task View
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  console.log("=== Rendering DispatchPage ===", { isLoading, loadError, form, autoData });

  return (
    <AppShell>
      <div style={pdf.page}>
        <div style={pdf.topSection}>
          {/* Left: Main Form Area */}
          <div style={pdf.formContainer}>
            <div style={pdf.grid}>
              <Field label="Source" value="KSLK" readOnly />
              <Field label="Rake Serial Number" value={trainId} readOnly />
              <Field label="Siding" value={siding} readOnly />

              <Field label="Number of Indent Wagons" value={form.indent_wagon_count}
                onChange={(v) => setForm({ ...form, indent_wagon_count: v })}
                required />

              <Field label="Vessel Name" value={form.vessel_name}
                onChange={(v) => setForm({ ...form, vessel_name: v })}
                required />

              <Field
                label="Type Of Rake"
                value={form.rake_type}
                onChange={(v) => setForm({ ...form, rake_type: v })}
                required
                selectOptions={[
                  { value: "", label: "Select" },
                  { value: "Full rake", label: "Full rake" },
                  { value: "Part rake", label: "Part rake" },
                  { value: "Combo rake", label: "Combo rake" },
                ]}
              />

              <Field type="datetime-local" label="Rake Placement Date & Time"
                value={form.rake_placement_datetime}
                onChange={(v) => setForm({ ...form, rake_placement_datetime: v })}
                required />

              <Field type="datetime-local" label="Rake Clearance Time"
                value={form.rake_clearance_datetime}
                onChange={(v) => setForm({ ...form, rake_clearance_datetime: v })}
                required />

              <Field label="Rake Idle time" value={form.rake_idle_time}
                onChange={(v) => setForm({ ...form, rake_idle_time: v })}
                required />

              <Field label="Rake Loading Start Date & Time" value={autoData.rake_loading_start_datetime} readOnly />
              <Field label="Rake Loading End Date & Time Actual" value={autoData.rake_loading_end_actual} readOnly />
              <Field
                type="datetime-local"
                label="Rake Loading End Date & Time Railway"
                value={form.rake_loading_end_railway}
                onChange={(v) => setForm({ ...form, rake_loading_end_railway: v })}
                required
              />

              <Field label="Door Closing Date & Time" value={autoData.door_closing_datetime} readOnly />
              <Field label="Rake Haul Out Date & Time" value={autoData.rake_haul_out_datetime} readOnly />
            </div>
          </div>

          {/* Right: Activity Timeline */}
          <div style={activityTimeline.container}>
            <div style={activityTimeline.header}>Activity Timeline</div>
            <div style={activityTimeline.content}>
              {activities.length > 0 ? (
                activities.map((dateGroup, index) => (
                  <div key={index} style={activityTimeline.dateGroup}>
                    <div style={activityTimeline.date}>{dateGroup.date}</div>
                    <div style={activityTimeline.activitiesList}>
                      {dateGroup.activities.map((activity, actIndex) => {
                        // Special handling for REVIEWER_TRAIN_EDITED with change details
                        if (activity.activity_type === 'REVIEWER_TRAIN_EDITED' && activity.changeDetails) {
                          const formatTime = (timestamp) => {
                            if (!timestamp) return '';
                            const date = new Date(timestamp);
                            return date.toLocaleString('en-US', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: false
                            });
                          };
                          
                          const handleDownload = async () => {
                            try {
                              const role = localStorage.getItem("role");
                              const url = `${API_BASE}/train/${encodeURIComponent(trainId)}/activity-timeline/${activity.id}/export-changes`;
                              
                              const response = await fetch(url, {
                                headers: {
                                  "x-user-role": role || "REVIEWER",
                                },
                              });

                              if (!response.ok) {
                                const errorData = await response.json().catch(() => ({ message: "Download failed" }));
                                alert(errorData.message || "Failed to download Excel file");
                                return;
                              }

                              // Get the blob from response
                              const blob = await response.blob();
                              
                              // Extract filename from Content-Disposition header, or use default
                              const contentDisposition = response.headers.get('Content-Disposition');
                              let filename = `${trainId}_changes.xlsx`;
                              if (contentDisposition) {
                                const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                                if (filenameMatch) {
                                  filename = filenameMatch[1];
                                }
                              }
                              
                              // Create a temporary URL for the blob
                              const blobUrl = window.URL.createObjectURL(blob);
                              
                              // Create a temporary anchor element and trigger download
                              const link = document.createElement('a');
                              link.href = blobUrl;
                              link.download = filename;
                              document.body.appendChild(link);
                              link.click();
                              
                              // Clean up
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(blobUrl);
                            } catch (err) {
                              console.error("Download error:", err);
                              alert("Failed to download Excel file. Please try again.");
                            }
                          };

                          return (
                        <div key={actIndex} style={activityTimeline.activityItem}>
                          <span style={activityTimeline.bullet}>•</span>
                              <div style={{ flex: 1 }}>
                                <div style={activityTimeline.text}>
                                  Reviewer made changes in wagon: {formatTime(activity.timestamp)}
                        </div>
                                <button
                                  onClick={handleDownload}
                                  style={{
                                    marginTop: '8px',
                                    padding: '6px 12px',
                                    backgroundColor: '#4CAF50',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '500'
                                  }}
                                  onMouseOver={(e) => e.target.style.backgroundColor = '#45a049'}
                                  onMouseOut={(e) => e.target.style.backgroundColor = '#4CAF50'}
                                >
                                  click here to view chnages
                                </button>
                              </div>
                            </div>
                          );
                        }
                        
                        const formattedText = formatActivityText(activity.text);
                        return (
                          <div key={actIndex} style={activityTimeline.activityItem}>
                            <span style={activityTimeline.bullet}>•</span>
                            <span style={activityTimeline.text}>{formattedText}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div style={activityTimeline.item}>
                  <div style={activityTimeline.date}>-</div>
                  <div style={activityTimeline.text}>
                    No activity recorded yet.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom: Last row with 4 columns */}
        <div style={pdf.lastRow}>
          <Field label="Loading Start Officer" value={form.loading_start_officer}
            onChange={(v) => setForm({ ...form, loading_start_officer: v })}
            required />

          <Field label="Loading Completion Officer" value={form.loading_completion_officer}
            onChange={(v) => setForm({ ...form, loading_completion_officer: v })}
            required />

          <Field label="Remarks(Operations)" value={form.remarks}
            onChange={(v) => setForm({ ...form, remarks: v })}
            required />

          <Field label="RR Number" value={form.rr_number}
            onChange={(v) => setForm({ ...form, rr_number: v })}
            required />
        </div>

        {/* Footer Buttons */}
        <div style={{ ...pdf.footer, justifyContent: "space-between" }}>
          {/* Left side: Cancel Indent button */}
          <button
            style={{
              padding: "10px 20px",
              backgroundColor: "#dc3545",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
            }}
            onClick={() => setShowCancelPopup(true)}
          >
            Cancel Indent
          </button>

          {/* Right side: Back and Submit buttons */}
          <div style={{ display: "flex", gap: "15px" }}>
            <button
              style={getButtonStyle("back")}
              onClick={() => navigate(-1)}
            >
              Back
            </button>
            <button
              style={{
                ...pdf.submitButton,
                ...(isFormComplete() ? {} : pdf.submitButtonDisabled)
              }}
              onClick={submit}
              disabled={!isFormComplete()}
            >
              Submit
            </button>
          </div>
        </div>

      </div>

      <SuccessPopup
        open={showSuccess}
        onClose={() => {
          setShowSuccess(false);
          navigate("/task-view");
        }}
      />

      {/* Cancel Indent Popup */}
      <CancelPopup
        open={showCancelPopup}
        onClose={() => {
                  setShowCancelPopup(false);
                  setCancelRemarks("");
        }}
        onConfirm={async (remarks) => {
          setCancelRemarks(remarks);
          await handleCancelIndent(remarks);
          setShowCancelPopup(false);
        }}
      />
    </AppShell>
  );
}

/* ================= CUSTOM DATETIME FIELD (24-HOUR FORMAT) ================= */
function DateTimeField24({ label, value, onChange, readOnly, required = false }) {
  const [localTime, setLocalTime] = useState("");

  // Parse the datetime-local value (YYYY-MM-DDTHH:mm:ss) into date and time parts
  const parseDateTime = (dtValue) => {
    if (!dtValue) return { date: "", time: "" };
    const [datePart, timePart] = dtValue.split("T");
    const time = timePart ? timePart.substring(0, 8) : ""; // HH:mm:ss
    return { date: datePart || "", time: time || "" };
  };

  // Combine date and time into datetime-local format
  const combineDateTime = (date, time) => {
    // If no date, just return empty string (user must select date first)
    if (!date || date.trim() === "") {
      return "";
    }
    // If no time provided, use 00:00:00
    if (!time || time.trim() === "") {
      return `${date}T00:00:00`;
    }
    // Ensure time is in HH:mm:ss format
    const timeParts = time.split(":");
    let hours = (timeParts[0] || "00").padStart(2, '0');
    let minutes = (timeParts[1] || "00").padStart(2, '0');
    let seconds = (timeParts[2] || "00").padStart(2, '0');

    // Validate and clamp values
    hours = Math.min(23, Math.max(0, parseInt(hours) || 0)).toString().padStart(2, '0');
    minutes = Math.min(59, Math.max(0, parseInt(minutes) || 0)).toString().padStart(2, '0');
    seconds = Math.min(59, Math.max(0, parseInt(seconds) || 0)).toString().padStart(2, '0');

    return `${date}T${hours}:${minutes}:${seconds}`;
  };

  const { date, time } = parseDateTime(value);

  // Sync localTime with value when value changes externally
  useEffect(() => {
    setLocalTime(time || "");
  }, [time]);

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    const currentTime = localTime || time || "00:00:00";
    const newValue = combineDateTime(newDate, currentTime);
    onChange && onChange(newValue);
  };

  const handleTimeChange = (e) => {
    let newTime = e.target.value;

    // Allow user to type freely - just clean up the input
    // Remove any non-digit characters except colons
    newTime = newTime.replace(/[^\d:]/g, '');

    // Auto-insert colons at appropriate positions (only if user is typing digits)
    if (newTime.length > 2 && newTime[2] !== ':') {
      newTime = newTime.substring(0, 2) + ':' + newTime.substring(2);
    }
    if (newTime.length > 5 && newTime[5] !== ':') {
      newTime = newTime.substring(0, 5) + ':' + newTime.substring(5);
    }

    // Limit to HH:mm:ss format (8 characters max)
    if (newTime.length > 8) {
      newTime = newTime.substring(0, 8);
    }

    // Update local state immediately for responsive typing
    setLocalTime(newTime);

    // Update parent only if we have a date (user can type time even without date, but won't save until date is set)
    if (date) {
      const newValue = combineDateTime(date, newTime);
      onChange && onChange(newValue);
    }
    // If no date, just update local state - user can still type time
  };

  const handleTimeBlur = () => {
    // On blur, ensure time is complete and valid
    if (localTime && date) {
      const timeParts = localTime.split(":");
      let hours = (timeParts[0] || "00").padStart(2, '0');
      let minutes = (timeParts[1] || "00").padStart(2, '0');
      let seconds = (timeParts[2] || "00").padStart(2, '0');

      // Validate hours (00-23)
      const h = parseInt(hours) || 0;
      if (h > 23) hours = "23";
      if (h < 0) hours = "00";
      hours = Math.min(23, Math.max(0, h)).toString().padStart(2, '0');

      // Validate minutes and seconds (00-59)
      const m = parseInt(minutes) || 0;
      const s = parseInt(seconds) || 0;
      minutes = Math.min(59, Math.max(0, m)).toString().padStart(2, '0');
      seconds = Math.min(59, Math.max(0, s)).toString().padStart(2, '0');

      const formattedTime = `${hours}:${minutes}:${seconds}`;
      setLocalTime(formattedTime);

      if (date) {
        const newValue = combineDateTime(date, formattedTime);
        onChange && onChange(newValue);
      }
    }
  };

  return (
    <fieldset style={field.fieldset}>
      <legend style={field.legend}>
        {label}
        {required && <span style={{ color: "#d32f2f", marginLeft: "2px" }}>*</span>}
      </legend>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          type="date"
          value={date}
          readOnly={readOnly}
          onChange={handleDateChange}
          style={{
            ...field.input,
            background: readOnly ? "#f4f4f4" : "white",
            flex: "1",
          }}
        />
        <input
          type="text"
          value={localTime || time || ""}
          readOnly={readOnly}
          onChange={handleTimeChange}
          onBlur={handleTimeBlur}
          placeholder="HH:mm:ss"
          style={{
            ...field.input,
            background: readOnly ? "#f4f4f4" : "white",
            flex: "1",
            minWidth: "120px",
            textAlign: "center",
          }}
          // Force 24-hour format: HH:mm:ss (00:00:00 to 23:59:59)
          pattern="([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]"
          title="Enter time in 24-hour format (HH:mm:ss), e.g., 13:30:00 for 1:30 PM"
        />
      </div>
    </fieldset>
  );
}

/* ================= FIELD ================= */
function Field({ label, value, onChange, readOnly, type = "text", required = false, selectOptions }) {
  // ✅ For datetime-local, use custom DateTimeField24 component to ensure 24-hour format display
  if (type === "datetime-local") {
    return (
      <DateTimeField24
        label={label}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        required={required}
      />
    );
  }

  const isSelect = Array.isArray(selectOptions) && selectOptions.length > 0 && !readOnly;

  return (
    <fieldset style={field.fieldset}>
      <legend style={field.legend}>
        {label}
        {required && <span style={{ color: "#d32f2f", marginLeft: "2px" }}>*</span>}
      </legend>
      {isSelect ? (
        <select
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={{
            ...field.input,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {selectOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={{
            ...field.input,
            background: readOnly ? "#f4f4f4" : "white",
          }}
        />
      )}
    </fieldset>
  );
}

/* ================= STYLES ================= */
const pdf = {
  page: {
    padding: "30px 40px",
    background: "#ffffffff",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  topSection: {
    display: "flex",
    gap: "30px",
    alignItems: "flex-start",
    marginBottom: "20px",
    width: "100%",
    maxWidth: "1400px",
    justifyContent: "center",
  },
  formContainer: {
    flex: 1,
    maxWidth: "900px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    columnGap: "20px",
    rowGap: "60px",
  },
  lastRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "20px",
    marginBottom: "20px",
    width: "100%",
    maxWidth: "1230px",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "15px",
    marginTop: "20px",
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
    background: "#5b9bd5",
    color: "#fff",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
    transition: "all 0.2s",
  },
  submitButton: {
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
  submitButtonDisabled: {
    background: "#9bb5d1",
    color: "#e0e0e0",
    cursor: "not-allowed",
    opacity: 0.6,
  },
};

const field = {
  fieldset: {
    border: "1px solid #333",
    borderRadius: "4px",
    padding: "14px 12px 10px",
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
    padding: "5px 0",
    fontSize: "14px",
    outline: "none",
    width: "100%",
    fontWeight: "400",
    color: "#333",
  },
};

const activityTimeline = {
  container: {
    width: "320px",
    background: "#ffffffff",
    borderRadius: "12px",
    padding: "0",
    boxShadow: "0 3px 10px rgba(0,0,0,0.15)",
    flexShrink: 0,
    height: "620px", // Fixed height so the timeline doesn't grow the page
    display: "flex",
    flexDirection: "column",
  },
  header: {
    background: "#a8a8a8",
    color: "white",
    padding: "15px 20px",
    fontSize: "18px",
    fontWeight: "600",
    borderRadius: "12px 12px 0 0",
    textAlign: "center",
  },
  content: {
    padding: "20px",
    flex: 1,
    overflowY: "auto", // Make activity list scrollable
  },
  item: {
    marginBottom: "15px",
  },
  dateGroup: {
    marginBottom: "20px",
  },
  date: {
    fontSize: "14px",
    fontWeight: "600",
    marginBottom: "10px",
    color: "#333",
  },
  activitiesList: {
    marginLeft: "0",
  },
  activityItem: {
    display: "flex",
    alignItems: "flex-start",
    marginBottom: "8px",
    fontSize: "13px",
    color: "#555",
    lineHeight: "1.5",
  },
  bullet: {
    marginRight: "8px",
    color: "#555",
    fontSize: "16px",
    lineHeight: "1.2",
  },
  text: {
    fontSize: "13px",
    color: "#555",
    lineHeight: "1.6",
    flex: 1,
    whiteSpace: "pre-line", // Allow line breaks in formatted text
  },
};

const popupStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },

  modal: {
    backgroundColor: "#fff",
    padding: "24px 30px 32px",
    borderRadius: "10px",
    width: "420px",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  image: {
    width: "320px",
    height: "320px",
    marginTop: "-70px",
    marginBottom: "-140px",
    marginLeft: "23px",
    objectFit: "contain",
  },

  title: {
    fontSize: "22px",
    fontWeight: "700",
    marginBottom: "6px",
  },

  message: {
    fontSize: "14px",
    color: "#555",
    marginBottom: "24px",
  },

  button: {
    padding: "10px 30px",
    backgroundColor: "#0B3A6E",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
  },
};
