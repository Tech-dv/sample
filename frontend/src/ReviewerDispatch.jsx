import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "./AppShell";
import approvedTick from "./assets/approved_tick.png";
import { getButtonStyle } from "./styles";
import { API_BASE } from "./api";
import { useAutoSave, loadSavedData, clearSavedData } from "./hooks/useAutoSave";
import { formatActivityText } from "./utils/formatActivityText";
import SuccessPopup from "./components/SuccessPopup";
import CancelPopup from "./components/CancelPopup";
import { idToUrlParam, urlParamToId } from "./utils/trainIdUtils";


/* ================= MAIN PAGE ================= */
export default function ReviewerDispatch() {
  const { trainId: encodedTrainId } = useParams();
  const trainId = encodedTrainId ? urlParamToId(encodedTrainId) : null;
  const [searchParams] = useSearchParams();
  const indentNumber = searchParams.get('indent_number');
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const reviewerUsername = localStorage.getItem("username");

  const [siding, setSiding] = useState("");
  const [rakeSerialNumber, setRakeSerialNumber] = useState(""); // ✅ FIX: Store actual rake_serial_number from backend
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [cancelRemarks, setCancelRemarks] = useState("");
  const [indentError, setIndentError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    door_closing_datetime: "",
    rake_haul_out_datetime: "",
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
  const [rakeTypes, setRakeTypes] = useState([]);


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
        ? `${API_BASE}/train/${idToUrlParam(trainId)}/activity-timeline?indent_number=${encodeURIComponent(indentNumber)}`
        : `${API_BASE}/train/${idToUrlParam(trainId)}/activity-timeline`;

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
      ? `${API_BASE}/train/${idToUrlParam(trainId)}/dispatch?indent_number=${encodeURIComponent(indentNumber)}`
      : `${API_BASE}/train/${idToUrlParam(trainId)}/dispatch`;

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
          console.log("Step 1: Setting siding and rake serial number");
          setSiding(d.siding || "");
          // ✅ FIX: Set actual rake_serial_number from backend response (not URL trainId)
          setRakeSerialNumber(d.rake_serial_number || trainId || "");

          if (d.dispatch) {
            console.log("Step 2: Dispatch object exists", d.dispatch);

            console.log("Step 3: Formatting dates");
            const placementDate = formatDateTimeLocal(d.dispatch.rake_placement_datetime);
            console.log("Placement date formatted:", placementDate);
            const clearanceDate = formatDateTimeLocal(d.dispatch.rake_clearance_datetime);
            console.log("Clearance date formatted:", clearanceDate);
            const rakeLoadingEndRailwayDate = formatDateTimeLocal(d.dispatch.rake_loading_end_railway);
            console.log("Rake Loading End Railway date formatted:", rakeLoadingEndRailwayDate);

            // ✅ Load door_closing_datetime and rake_haul_out_datetime into form (now user-editable)
            const doorClosingDate = formatDateTimeLocal(d.dispatch.door_closing_datetime);
            const rakeHaulOutDate = formatDateTimeLocal(d.dispatch.rake_haul_out_datetime);

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
              door_closing_datetime: doorClosingDate,
              rake_haul_out_datetime: rakeHaulOutDate,
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

            // ✅ FIX: Initialize autoData with dispatch data
            // Try to get times from dispatch_records first (if they were saved), then fetch from wagons
            // ✅ FIX: Don't initialize rake_loading_end_actual from dispatch - it will be calculated from wagons
            // to ensure it only shows when ALL wagons have loading_end_time filled
            const autoDataObj = {
              rake_loading_start_datetime: d.dispatch.rake_loading_start_datetime || "", // Try dispatch first
              rake_loading_end_actual: "", // ✅ FIX: Always start empty - will be calculated from wagons
            };
            console.log("Step 8: Auto data created (times from dispatch or will be fetched from wagons):", autoDataObj);
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

    // ✅ FIX: Always fetch times from wagon_records based on indent_number, ordered by tower_number
    const fetchWagonData = async () => {
      try {
        console.log("Fetching wagon data to calculate rake loading times");
        const wagonUrl = indentNumber
          ? `${API_BASE}/train/${idToUrlParam(trainId)}/view?indent_number=${encodeURIComponent(indentNumber)}`
          : `${API_BASE}/train/${idToUrlParam(trainId)}/view`;

        const response = await fetch(wagonUrl, {
          headers: {
            "x-user-role": role || "REVIEWER",
          },
        });

        if (response.ok) {
          const data = await response.json();
          const wagons = data.wagons || [];

          if (wagons.length > 0) {
            // ✅ FIX: Sort wagons by tower_number (ascending)
            const sortedWagons = [...wagons].sort((a, b) => {
              const towerA = a.tower_number || 0;
              const towerB = b.tower_number || 0;
              return towerA - towerB;
            });

            // ✅ FIX: Get first wagon's loading_start_time (ordered by tower_number)
            const firstWagon = sortedWagons.find(w => w.loading_start_time);
            const rakeLoadingStart = firstWagon ? firstWagon.loading_start_time : "";

            // ✅ FIX: Only get last wagon's loading_end_time if ALL wagons have loading_end_time filled
            const totalWagons = sortedWagons.length;
            // ✅ FIX: More robust check - ensure loading_end_time exists, is not null/undefined, and is not empty
            const wagonsWithEndTime = sortedWagons.filter(w => {
              const endTime = w.loading_end_time;
              return endTime != null && String(endTime).trim() !== "";
            }).length;

            let rakeLoadingEnd = "";
            // ✅ FIX: Only set if ALL wagons have loading_end_time AND we have wagons
            if (totalWagons > 0 && wagonsWithEndTime === totalWagons) {
              // All wagons have loading_end_time filled - get the last wagon's time (by tower_number)
              const lastWagon = sortedWagons[sortedWagons.length - 1];
              if (lastWagon && lastWagon.loading_end_time) {
                rakeLoadingEnd = String(lastWagon.loading_end_time).trim();
              }
            }
            // If not all wagons have loading_end_time, keep rakeLoadingEnd as empty string

            // ✅ FIX: Update autoData with fetched values from wagons
            // Prefer fetched values from wagons (most accurate), but don't overwrite if previous has value and fetched is empty
            setAutoData(prev => {
              const newData = {
                ...prev,
                // Use fetched value if available, otherwise keep previous value (which might be from dispatch_records)
                rake_loading_start_datetime: rakeLoadingStart || prev.rake_loading_start_datetime || "",
                // ✅ FIX: Only set rake_loading_end_actual if ALL wagons have loading_end_time filled
                // If not all wagons have it, always set to empty string (don't preserve previous value)
                // This ensures the field is always recalculated from current wagon data, never preserved from previous state
                rake_loading_end_actual: (wagonsWithEndTime === totalWagons && rakeLoadingEnd && rakeLoadingEnd.trim() !== "") ? rakeLoadingEnd : "",
              };

              console.log("Updating autoData with wagon times:", {
                fetchedFromWagons: {
                  rake_loading_start_datetime: rakeLoadingStart,
                  rake_loading_end_actual: rakeLoadingEnd,
                },
                previousState: {
                  rake_loading_start_datetime: prev.rake_loading_start_datetime,
                  rake_loading_end_actual: prev.rake_loading_end_actual,
                },
                finalState: newData,
                indentNumber: indentNumber || "none",
                wagonCount: wagons.length,
                totalWagons: totalWagons,
                wagonsWithEndTime: wagonsWithEndTime,
                allWagonsHaveEndTime: wagonsWithEndTime === totalWagons
              });

              return newData;
            });
          } else {
            // No wagons found - clear the times
            setAutoData(prev => ({
              ...prev,
              rake_loading_start_datetime: "",
              rake_loading_end_actual: "",
            }));
          }
        }
      } catch (err) {
        console.error("Failed to load wagon data:", err);
      }
    };

    // ✅ FIX: Add delay to ensure dispatch data is loaded first, and backend save completes
    // Increased delay to ensure wagon data is saved after proceed button click from TrainEdit
    // Increased from 500ms to 1000ms to give backend enough time to process and save all data
    setTimeout(() => {
      fetchWagonData();
    }, 1000);
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

  // Fetch rake types from backend
  useEffect(() => {
    const fetchRakeTypes = async () => {
      try {
        const res = await fetch(`${API_BASE}/dropdown-options?type=rake_type`, {
          headers: {
            "x-user-role": role || "",
          },
        });
        if (res.ok) {
          const data = await res.json();
          setRakeTypes(data.map(item => ({
            value: item.option_value,
            label: item.option_value,
          })));
        }
      } catch (err) {
        console.error("Failed to fetch rake types:", err);
        // Fallback to default values if fetch fails
        setRakeTypes([
          { value: "Full rake", label: "Full rake" },
          { value: "Part rake", label: "Part rake" },
          { value: "Combo rake", label: "Combo rake" },
        ]);
      }
    };
    if (role) {
      fetchRakeTypes();
    }
  }, [role]);

  /* ================= HELPER: Format DateTime for display ================= */
  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return "-";
    try {
      const date = new Date(dateTimeString);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn("Invalid date:", dateTimeString);
        return "-";
      }

      // Get date parts (local timezone)
      const month = date.getMonth() + 1; // 1-12
      const day = date.getDate(); // 1-31
      const year = date.getFullYear();

      // Get time parts (24-hour format, local timezone)
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      // Format: M/D/YYYY, HH:mm:ss (24-hour format, local timezone)
      return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      console.error("Error formatting date:", dateTimeString, e);
      return "-";
    }
  };

  /* ================= FORMAT FILENAME FROM RAKE SERIAL NUMBER ================= */
  const formatRakeSerialFilename = (rakeSerial) => {
    if (!rakeSerial) return `${trainId}_changes.xlsx`;

    // Parse rake_serial_number format: "2025-26/02/001"
    // Expected output: "2025-26_feb_001_changes.xlsx"
    const parts = rakeSerial.split('/');
    if (parts.length === 3) {
      const yearPart = parts[0]; // "2025-26"
      const monthNum = parts[1]; // "02"
      const serialPart = parts[2]; // "001"

      // Convert month number to short month name
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
        'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthIndex = parseInt(monthNum, 10) - 1;
      const monthShort = (monthIndex >= 0 && monthIndex < 12)
        ? monthNames[monthIndex]
        : monthNum.toLowerCase();

      return `${yearPart}_${monthShort}_${serialPart}_changes.xlsx`;
    }

    // Fallback to original format if parsing fails
    return `${rakeSerial}_changes.xlsx`;
  };

  /* ================= INPUT HANDLERS ================= */
  const handleIndentWagonChange = (v) => {
    setForm({ ...form, indent_wagon_count: v });

    if (v === "") {
      setIndentError("");
    } else if (!/^[0-9]+$/.test(v)) {
      setIndentError("Please enter a number (digits only).");
    } else {
      setIndentError("");
    }
  };

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
      !indentError &&
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
      form.door_closing_datetime &&
      form.door_closing_datetime.trim() !== "" &&
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
      ? `${API_BASE}/train/${idToUrlParam(trainId)}/dispatch/draft?indent_number=${encodeURIComponent(indentNumber)}`
      : `${API_BASE}/train/${idToUrlParam(trainId)}/dispatch/draft`;

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

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    const ok = await saveDraft();
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
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
      `${API_BASE}/reviewer/tasks/${idToUrlParam(trainId)}/approve`,
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
        `${API_BASE}/reviewer/tasks/${idToUrlParam(trainId)}/cancel`,
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
              <Field label="Rake Serial Number" value={rakeSerialNumber || trainId} readOnly />
              <Field label="Siding" value={siding} readOnly />

              <Field
                label="Number of Indent Wagons"
                value={form.indent_wagon_count}
                onChange={handleIndentWagonChange}
                required
                error={indentError}
              />

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
                  ...rakeTypes,
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

              <Field label="Rake Loading Start Date & Time" value={formatDateTime(autoData.rake_loading_start_datetime)} readOnly />
              <Field label="Rake Loading End Date & Time Actual" value={formatDateTime(autoData.rake_loading_end_actual)} readOnly />
              <Field
                type="datetime-local"
                label="Rake Loading End Date & Time Railway"
                value={form.rake_loading_end_railway}
                onChange={(v) => setForm({ ...form, rake_loading_end_railway: v })}
                required
              />

              <Field
                type="datetime-local"
                label="Door Closing Date & Time"
                value={form.door_closing_datetime}
                onChange={(v) => setForm({ ...form, door_closing_datetime: v })}
                required
              />
              <Field
                type="datetime-local"
                label="Rake Haul Out Date & Time"
                value={form.rake_haul_out_datetime}
                onChange={(v) => setForm({ ...form, rake_haul_out_datetime: v })}
              />
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
                        const formatActivityTime = (timestamp) => {
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

                        // Show REVIEWER_EDITED activities as "Reviewer made changes in rake details"
                        if (activity.activity_type === 'REVIEWER_EDITED') {
                          return (
                            <div key={actIndex} style={activityTimeline.activityItem}>
                              <span style={activityTimeline.bullet}>•</span>
                              <div style={{ flex: 1 }}>
                                <div style={activityTimeline.text}>
                                  Reviewer made changes in rake details: {formatActivityTime(activity.timestamp)}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        // ✅ FIX: Only show REVIEWER_TRAIN_EDITED if it has wagon changes
                        // Rake changes are only shown in Excel, not in activity timeline
                        if (activity.activity_type === 'REVIEWER_TRAIN_EDITED' && activity.changeDetails) {
                          // Check if there are wagon changes (not just rake changes)
                          const hasWagonChanges = activity.changeDetails.wagonChanges &&
                            activity.changeDetails.wagonChanges.length > 0;

                          // Only show if there are wagon changes
                          if (!hasWagonChanges) {
                            return null; // Hide activities that only have rake changes
                          }

                          return (
                            <div key={actIndex} style={activityTimeline.activityItem}>
                              <span style={activityTimeline.bullet}>•</span>
                              <div style={{ flex: 1 }}>
                                <div style={activityTimeline.text}>
                                  Reviewer made changes in wagon: {formatActivityTime(activity.timestamp)}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const formattedText = formatActivityText(activity.text);
                        const isReviewedAndApproved = activity.text && activity.text.includes('reviewed and approved');

                        return (
                          <div key={actIndex}>
                            <div style={activityTimeline.activityItem}>
                              <span style={activityTimeline.bullet}>•</span>
                              <span style={activityTimeline.text}>{formattedText}</span>
                            </div>
                            {isReviewedAndApproved && (
                              <div style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
                                <button
                                  onClick={async () => {
                                    try {
                                      const role = localStorage.getItem("role");
                                      const url = `${API_BASE}/train/${idToUrlParam(trainId)}/export-all-reviewer-changes`;

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

                                      // Format filename from rake_serial_number
                                      const filename = formatRakeSerialFilename(rakeSerialNumber || trainId);

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
                                  }}
                                  style={{
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
                                  View Changes
                                </button>
                              </div>
                            )}
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

          {/* Right side: Back, Save and Submit buttons */}
          <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
            <button
              style={getButtonStyle("back")}
              onClick={() => navigate(-1)}
            >
              Back
            </button>
            <button
              style={{
                ...pdf.saveButton,
                ...(isSaving ? { opacity: 0.7, cursor: "not-allowed" } : {}),
              }}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : saveSuccess ? "✓ Saved" : "Save"}
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

/* ================= CUSTOM DATETIME FIELD (24-HOUR FORMAT WITH CALENDAR) ================= */
function DateTimeField24({ label, value, onChange, readOnly, required = false, error }) {
  const [localDate, setLocalDate] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [pickerHours, setPickerHours] = useState("00");
  const [pickerMinutes, setPickerMinutes] = useState("00");
  const [pickerSeconds, setPickerSeconds] = useState("00");
  const [activeTimePart, setActiveTimePart] = useState('hours');
  const hoursInputRef = useRef(null);
  const minutesInputRef = useRef(null);
  const secondsInputRef = useRef(null);
  const dateInputRef = useRef(null);
  const timeInputRef = useRef(null);
  const calendarRef = useRef(null);

  const parseDateTime = (dtValue) => {
    if (!dtValue) return { date: "", dateDisplay: "", time: "" };
    let dateObj;
    if (dtValue.includes("T")) {
      dateObj = new Date(dtValue);
      if (isNaN(dateObj.getTime())) {
    const [datePart, timePart] = dtValue.split("T");
        const time = timePart ? timePart.substring(0, 8) : "";
        const dateDisplay = datePart ? convertToDDMMYYYY(datePart) : "";
        return { date: datePart || "", dateDisplay: dateDisplay, time: time || "" };
      }
    } else {
      return { date: "", dateDisplay: "", time: "" };
    }
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    const dateStorage = `${year}-${month}-${day}`;
    const dateDisplay = `${day}/${month}/${year}`;
    return { date: dateStorage, dateDisplay: dateDisplay, time: `${hours}:${minutes}:${seconds}` };
  };

  const convertToDDMMYYYY = (yyyyMMdd) => {
    if (!yyyyMMdd) return "";
    const parts = yyyyMMdd.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return yyyyMMdd;
  };

  const convertToYYYYMMDD = (ddmmyyyy) => {
    if (!ddmmyyyy) return "";
    const parts = ddmmyyyy.split("/");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return ddmmyyyy;
  };

  const combineDateTime = (date, time) => {
    if (!date || date.trim() === "") return "";
    if (!time || time.trim() === "") {
      const dateObj = new Date(`${date}T00:00:00`);
      return dateObj.toISOString();
    }
    const timeParts = time.split(":");
    let hours = (timeParts[0] || "00").padStart(2, '0');
    let minutes = (timeParts[1] || "00").padStart(2, '0');
    let seconds = (timeParts[2] || "00").padStart(2, '0');
    hours = Math.min(23, Math.max(0, parseInt(hours) || 0)).toString().padStart(2, '0');
    minutes = Math.min(59, Math.max(0, parseInt(minutes) || 0)).toString().padStart(2, '0');
    seconds = Math.min(59, Math.max(0, parseInt(seconds) || 0)).toString().padStart(2, '0');
    const dateObj = new Date(`${date}T${hours}:${minutes}:${seconds}`);
    return dateObj.toISOString();
  };

  const { date, dateDisplay, time } = parseDateTime(value);

  useEffect(() => {
    setLocalDate(dateDisplay || "dd/mm/yyyy");
    setLocalTime(time || "HH:MM:SS");
    if (value) {
      const dateObj = new Date(value);
      if (!isNaN(dateObj.getTime())) {
        setCalendarDate(dateObj);
        setSelectedDate(dateObj);
        const timeParts = time.split(':');
        setPickerHours(String(parseInt(timeParts[0] || 0) || 0).padStart(2, '0'));
        setPickerMinutes(String(parseInt(timeParts[1] || 0) || 0).padStart(2, '0'));
        setPickerSeconds(String(parseInt(timeParts[2] || 0) || 0).padStart(2, '0'));
      }
    } else {
      const today = new Date();
      setCalendarDate(today);
      setSelectedDate(today);
    }
  }, [dateDisplay, time, value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target) &&
        dateInputRef.current && !dateInputRef.current.contains(event.target) &&
        timeInputRef.current && !timeInputRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCalendar]);

  const handleDateChange = (e) => {
    let newDate = e.target.value;
    if (newDate.includes('d') || newDate.includes('m') || newDate.includes('y')) {
      newDate = newDate.replace(/[^\d/]/g, '');
      if (newDate === "" || !newDate.includes('/')) newDate = "00/00/0000";
    }
    newDate = newDate.replace(/[^\d/]/g, '');
    if (!newDate || newDate.trim() === "") { setLocalDate("dd/mm/yyyy"); return; }
    const parts = newDate.split('/');
    let day = (parts[0] || '00').padStart(2, '0').substring(0, 2);
    let month = (parts[1] || '00').padStart(2, '0').substring(0, 2);
    let year = (parts[2] || '0000').padStart(4, '0').substring(0, 4);
    if (parseInt(day) > 31) day = '31';
    if (parseInt(month) > 12) month = '12';
    if (parseInt(year) > 9999) year = '9999';
    const formattedDate = `${day}/${month}/${year}`;
    setLocalDate(formattedDate);
    const dateStorage = convertToYYYYMMDD(formattedDate);
    const currentTime = localTime === "HH:MM:SS" ? "00:00:00" : (localTime || time || "00:00:00");
    onChange && onChange(combineDateTime(dateStorage, currentTime));
  };

  const handleDateKeyDown = (e) => {
    const input = e.target;
    let currentDate = localDate || "dd/mm/yyyy";
    if (currentDate === "dd/mm/yyyy") { currentDate = "00/00/0000"; setLocalDate("00/00/0000"); }
    if (!currentDate.includes('/')) currentDate = "00/00/0000";
    const parts = currentDate.split('/');
    let day = (parts[0] || '00').padStart(2, '0');
    let month = (parts[1] || '00').padStart(2, '0');
    let year = (parts[2] || '0000').padStart(4, '0');
    let currentPosition = input.selectionStart;
    if (currentPosition === 2 || currentPosition === 5) currentPosition = currentPosition + 1;

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      if (currentDate === "dd/mm/yyyy") {
        currentDate = "00/00/0000"; setLocalDate("00/00/0000");
        const p = currentDate.split('/');
        day = (p[0] || '00').padStart(2, '0'); month = (p[1] || '00').padStart(2, '0'); year = (p[2] || '0000').padStart(4, '0');
        currentPosition = 0;
      }
      let newDay = day, newMonth = month, newYear = year;
      let nextPosition = currentPosition + 1, shouldMoveToTime = false;
      if (currentPosition < 2) {
        const dayPos = currentPosition;
        const newDayStr = day.split('');
        newDayStr[dayPos] = e.key;
        if (dayPos === 0) { if (parseInt(e.key) > 3) return; newDay = e.key + day[1]; }
        else if (dayPos === 1) { if (parseInt(day[0]) === 3 && parseInt(e.key) > 1) return; newDay = day[0] + e.key; }
        if (parseInt(newDay) > 31) newDay = '31';
        if (dayPos === 1) nextPosition = 3;
      } else if (currentPosition >= 3 && currentPosition < 5) {
        const monthPos = currentPosition - 3;
        if (monthPos === 0) { if (parseInt(e.key) > 1) return; newMonth = e.key + month[1]; }
        else if (monthPos === 1) { if (parseInt(month[0]) === 1 && parseInt(e.key) > 2) return; newMonth = month[0] + e.key; }
        if (parseInt(newMonth) > 12) newMonth = '12';
        if (monthPos === 1) nextPosition = 6;
      } else if (currentPosition >= 6 && currentPosition < 10) {
        const yearPos = currentPosition - 6;
        const newYearStr = year.split(''); newYearStr[yearPos] = e.key; newYear = newYearStr.join('');
        if (yearPos === 3) shouldMoveToTime = true;
      }
      const formattedDate = `${newDay}/${newMonth}/${newYear}`;
      setLocalDate(formattedDate);
      const dateStorage = convertToYYYYMMDD(formattedDate);
      const currentTime = localTime === "HH:MM:SS" ? "00:00:00" : (localTime || time || "00:00:00");
      onChange && onChange(combineDateTime(dateStorage, currentTime));
      if (shouldMoveToTime) {
        setTimeout(() => { if (timeInputRef.current) { timeInputRef.current.focus(); timeInputRef.current.setSelectionRange(0, 0); } }, 0);
      } else {
        setTimeout(() => { input.setSelectionRange(nextPosition, nextPosition); }, 0);
      }
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      let newDay = day, newMonth = month, newYear = year, nextPosition = currentPosition;
      if (currentPosition < 2) {
        const newDayStr = day.split(''); newDayStr[currentPosition === 1 ? 1 : 0] = '0'; newDay = newDayStr.join('');
        nextPosition = currentPosition === 1 ? 0 : 0;
      } else if (currentPosition >= 3 && currentPosition < 5) {
        const newMonthStr = month.split('');
        if (currentPosition === 4) { newMonthStr[1] = '0'; newMonth = newMonthStr.join(''); nextPosition = 3; }
        else { newMonthStr[0] = '0'; newMonth = newMonthStr.join(''); nextPosition = 1; }
      } else if (currentPosition >= 6 && currentPosition < 10) {
        const newYearStr = year.split('');
        if (currentPosition > 6) { newYearStr[currentPosition - 6] = '0'; newYear = newYearStr.join(''); nextPosition = currentPosition - 1; }
        else { newYearStr[0] = '0'; newYear = newYearStr.join(''); nextPosition = 4; }
      }
      const formattedDate = `${newDay}/${newMonth}/${newYear}`; setLocalDate(formattedDate);
      const dateStorage = convertToYYYYMMDD(formattedDate);
      const currentTime = localTime === "HH:MM:SS" ? "00:00:00" : (localTime || time || "00:00:00");
      onChange && onChange(combineDateTime(dateStorage, currentTime));
      setTimeout(() => { input.setSelectionRange(nextPosition, nextPosition); }, 0);
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      setTimeout(() => { const newPos = input.selectionStart; if (newPos === 2 || newPos === 5) { const dir = e.key === 'ArrowLeft' ? -1 : 1; input.setSelectionRange(newPos + dir, newPos + dir); } }, 0);
    }
  };

  const handleDateFocus = (e) => {
    const currentDate = localDate || "";
    if (!currentDate || currentDate === "dd/mm/yyyy" || currentDate === "00/00/0000" || !currentDate.includes('/') || currentDate.split('/').length !== 3) {
      const today = new Date();
      const year = today.getFullYear(), month = String(today.getMonth() + 1).padStart(2, '0'), day = String(today.getDate()).padStart(2, '0');
      const dateStorage = `${year}-${month}-${day}`, dateDisplayToday = `${day}/${month}/${year}`;
      setLocalDate(dateDisplayToday); setSelectedDate(today); setCalendarDate(today);
      const currentTime = localTime === "HH:MM:SS" ? "00:00:00" : (localTime || time || "00:00:00");
      onChange && onChange(combineDateTime(dateStorage, currentTime));
      setTimeout(() => { e.target.setSelectionRange(0, 0); }, 0);
    }
  };

  const handleDateInputClick = () => {
    if (!readOnly) {
      const currentDate = localDate || dateDisplay || "";
      if (!currentDate || currentDate === "dd/mm/yyyy" || currentDate === "00/00/0000" || currentDate.trim() === "") {
      const today = new Date();
        const year = today.getFullYear(), month = String(today.getMonth() + 1).padStart(2, '0'), day = String(today.getDate()).padStart(2, '0');
        const dateStorage = `${year}-${month}-${day}`, dateDisplayToday = `${day}/${month}/${year}`;
        setLocalDate(dateDisplayToday); setSelectedDate(today); setCalendarDate(today);
        const currentTime = localTime === "HH:MM:SS" ? "00:00:00" : (localTime || time || "00:00:00");
        onChange && onChange(combineDateTime(dateStorage, currentTime));
      }
      setShowCalendar(true);
      if (value) {
        const dateObj = new Date(value);
        if (!isNaN(dateObj.getTime())) {
          setCalendarDate(dateObj); setSelectedDate(dateObj);
          const timeParts = time.split(':');
          setPickerHours(String(parseInt(timeParts[0] || 0) || 0).padStart(2, '0'));
          setPickerMinutes(String(parseInt(timeParts[1] || 0) || 0).padStart(2, '0'));
          setPickerSeconds(String(parseInt(timeParts[2] || 0) || 0).padStart(2, '0'));
        } else { const today = new Date(); setCalendarDate(today); setSelectedDate(today); setPickerHours("00"); setPickerMinutes("00"); setPickerSeconds("00"); }
      } else { const today = new Date(); setCalendarDate(today); setSelectedDate(today); setPickerHours("00"); setPickerMinutes("00"); setPickerSeconds("00"); }
    }
  };

  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const getCalendarDays = () => {
    const daysInMonth = getDaysInMonth(calendarDate), firstDay = getFirstDayOfMonth(calendarDate), days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) days.push(day);
    return days;
  };

  const navigateMonth = (direction) => setCalendarDate(prev => { const d = new Date(prev); d.setMonth(prev.getMonth() + direction); return d; });

  const getAllYears = () => {
    const currentYear = new Date().getFullYear(), startYear = 2026, endYear = currentYear + 50;
    return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
  };

  const handleDateSelect = (day) => {
    if (day === null) return;
    const newDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
    setSelectedDate(newDate);
    const year = newDate.getFullYear(), month = String(newDate.getMonth() + 1).padStart(2, '0'), dayStr = String(newDate.getDate()).padStart(2, '0');
    const dateStorage = `${year}-${month}-${dayStr}`, dateDisplayNew = `${dayStr}/${month}/${year}`;
    setLocalDate(dateDisplayNew);
    const currentTime = localTime === "HH:MM:SS" ? "00:00:00" : (localTime || time || "00:00:00");
    onChange && onChange(combineDateTime(dateStorage, currentTime));
  };

  const handleTimePickerKeyDown = (e, type) => {
    const input = e.target;
    let currentValue = type === 'hours' ? pickerHours : type === 'minutes' ? pickerMinutes : pickerSeconds;
    const cursorPos = input.selectionStart || 0;
    if (!currentValue || currentValue.length !== 2) currentValue = "00";

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      let newValue = currentValue.split(''), nextPosition = cursorPos + 1, shouldMoveToNext = false;
      if (cursorPos < 2) {
        newValue[cursorPos] = e.key;
        if (type === 'hours') {
          if (cursorPos === 0 && parseInt(e.key) > 2) return;
          if (cursorPos === 1) { if (parseInt(newValue[0]) === 2 && parseInt(e.key) > 3) return; shouldMoveToNext = true; }
        } else if (type === 'minutes' || type === 'seconds') {
          if (cursorPos === 0 && parseInt(e.key) > 5) return;
          if (cursorPos === 1) shouldMoveToNext = true;
        }
        const updatedValue = newValue.join(''), numValue = parseInt(updatedValue) || 0;
        if (type === 'hours' && numValue > 23) return;
        if ((type === 'minutes' || type === 'seconds') && numValue > 59) return;
        if (type === 'hours') setPickerHours(updatedValue);
        else if (type === 'minutes') setPickerMinutes(updatedValue);
        else setPickerSeconds(updatedValue);
        const hours = type === 'hours' ? updatedValue : pickerHours;
        const minutes = type === 'minutes' ? updatedValue : pickerMinutes;
        const seconds = type === 'seconds' ? updatedValue : pickerSeconds;
        const timeStr = `${hours}:${minutes}:${seconds}`; setLocalTime(timeStr);
        if (selectedDate || date) {
          const dateStorage = selectedDate ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}` : date;
          onChange && onChange(combineDateTime(dateStorage, timeStr));
        }
        if (shouldMoveToNext) {
          setTimeout(() => {
            if (type === 'hours' && minutesInputRef.current) { minutesInputRef.current.focus(); minutesInputRef.current.setSelectionRange(0, 0); }
            else if (type === 'minutes' && secondsInputRef.current) { secondsInputRef.current.focus(); secondsInputRef.current.setSelectionRange(0, 0); }
          }, 0);
        } else { setTimeout(() => { input.setSelectionRange(nextPosition, nextPosition); }, 0); }
      }
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      let newValue = currentValue.split(''), nextPosition = cursorPos;
      if (cursorPos === 1) { newValue[1] = '0'; nextPosition = 0; } else if (cursorPos === 0) { newValue[0] = '0'; nextPosition = 0; }
      const updatedValue = newValue.join('');
      if (type === 'hours') setPickerHours(updatedValue);
      else if (type === 'minutes') setPickerMinutes(updatedValue);
      else setPickerSeconds(updatedValue);
      const hours = type === 'hours' ? updatedValue : pickerHours;
      const minutes = type === 'minutes' ? updatedValue : pickerMinutes;
      const seconds = type === 'seconds' ? updatedValue : pickerSeconds;
      const timeStr = `${hours}:${minutes}:${seconds}`; setLocalTime(timeStr);
      if (selectedDate || date) {
        const dateStorage = selectedDate ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}` : date;
        onChange && onChange(combineDateTime(dateStorage, timeStr));
      }
      setTimeout(() => { input.setSelectionRange(nextPosition, nextPosition); }, 0);
      return;
    }
  };

  const handleTimePickerFocus = (type) => {
    setActiveTimePart(type);
    setTimeout(() => {
      if (type === 'hours' && hoursInputRef.current) hoursInputRef.current.setSelectionRange(0, 2);
      else if (type === 'minutes' && minutesInputRef.current) minutesInputRef.current.setSelectionRange(0, 2);
      else if (type === 'seconds' && secondsInputRef.current) secondsInputRef.current.setSelectionRange(0, 2);
    }, 0);
  };

  const handleCalendarOK = () => {
    if (selectedDate) {
      const year = selectedDate.getFullYear(), month = String(selectedDate.getMonth() + 1).padStart(2, '0'), day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStorage = `${year}-${month}-${day}`, dateDisplayNew = `${day}/${month}/${year}`;
      setLocalDate(dateDisplayNew);
      const timeStr = `${pickerHours}:${pickerMinutes}:${pickerSeconds}`; setLocalTime(timeStr);
      onChange && onChange(combineDateTime(dateStorage, timeStr));
    }
    setShowCalendar(false);
  };

  const handleCalendarCancel = () => setShowCalendar(false);

  const handleDateBlur = (e) => {
    let newDate = localDate || "";
    if (newDate && newDate.trim() !== "") {
      const parts = newDate.split('/');
      let day = Math.min(31, Math.max(1, parseInt(parts[0] || 0) || 0));
      let month = Math.min(12, Math.max(1, parseInt(parts[1] || 0) || 0));
      let year = Math.min(9999, Math.max(1900, parseInt(parts[2] || 0) || 0));
      const formattedDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`;
      setLocalDate(formattedDate);
      const dateStorage = convertToYYYYMMDD(formattedDate);
      const currentTime = localTime === "HH:MM:SS" ? "00:00:00" : (localTime || time || "00:00:00");
      onChange && onChange(combineDateTime(dateStorage, currentTime));
    } else { setLocalDate("dd/mm/yyyy"); }
  };

  const handleTimeChange = (e) => {
    let newTime = e.target.value;
    if (newTime.includes('H') || newTime.includes('M') || newTime.includes('S')) newTime = newTime.replace(/[^\d:]/g, '');
    newTime = newTime.replace(/[^\d:]/g, '');
    if (!newTime || newTime.trim() === "") { setLocalTime("HH:MM:SS"); return; }
    const parts = newTime.split(':');
    let hours = (parts[0] || '00').padStart(2, '0').substring(0, 2);
    let minutes = (parts[1] || '00').padStart(2, '0').substring(0, 2);
    let seconds = (parts[2] || '00').padStart(2, '0').substring(0, 2);
    if (parseInt(hours) > 23) hours = '23';
    if (parseInt(minutes) > 59) minutes = '59';
    if (parseInt(seconds) > 59) seconds = '59';
    const formattedTime = `${hours}:${minutes}:${seconds}`; setLocalTime(formattedTime);
    if (date) onChange && onChange(combineDateTime(date, formattedTime));
  };

  const handleTimeKeyDown = (e) => {
    const input = e.target;
    let currentTime = localTime || "HH:MM:SS";
    const cursorPos = input.selectionStart;
    if (currentTime === "HH:MM:SS") { currentTime = "00:00:00"; setLocalTime("00:00:00"); }
    if (!currentTime.includes(':')) currentTime = "00:00:00";
    const parts = currentTime.split(':');
    let hours = (parts[0] || '00').padStart(2, '0');
    let minutes = (parts[1] || '00').padStart(2, '0');
    let seconds = (parts[2] || '00').padStart(2, '0');
    let currentPosition = cursorPos;
    if (cursorPos === 2 || cursorPos === 5) currentPosition = cursorPos + 1;

    if (e.key >= '0' && e.key <= '9') {
      const currentDateCheck = localDate || dateDisplay || "";
      if (!currentDateCheck || currentDateCheck === "dd/mm/yyyy" || currentDateCheck === "00/00/0000" || currentDateCheck.trim() === "") {
        const today = new Date();
        const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
        setLocalDate(`${d}/${m}/${y}`);
      }
      if (currentTime === "HH:MM:SS") { currentTime = "00:00:00"; setLocalTime("00:00:00"); const p = currentTime.split(':'); hours = (p[0] || '00').padStart(2, '0'); minutes = (p[1] || '00').padStart(2, '0'); seconds = (p[2] || '00').padStart(2, '0'); currentPosition = 0; }
      e.preventDefault();
      let newHours = hours, newMinutes = minutes, newSeconds = seconds, nextPosition = currentPosition + 1;
      if (currentPosition < 2) {
        const hourPos = currentPosition;
        if (hourPos === 0) { if (parseInt(e.key) > 2) return; newHours = e.key + hours[1]; }
        else if (hourPos === 1) { if (parseInt(hours[0]) === 2 && parseInt(e.key) > 3) return; newHours = hours[0] + e.key; }
        if (parseInt(newHours) > 23) newHours = '23';
        if (hourPos === 1) nextPosition = 3;
      } else if (currentPosition >= 3 && currentPosition < 5) {
        const minPos = currentPosition - 3;
        if (minPos === 0) { if (parseInt(e.key) > 5) return; newMinutes = e.key + minutes[1]; }
        else if (minPos === 1) { newMinutes = minutes[0] + e.key; }
        if (parseInt(newMinutes) > 59) newMinutes = '59';
        if (minPos === 1) nextPosition = 6;
      } else if (currentPosition >= 6 && currentPosition < 8) {
        const secPos = currentPosition - 6;
        if (secPos === 0) { if (parseInt(e.key) > 5) return; newSeconds = e.key + seconds[1]; }
        else if (secPos === 1) { newSeconds = seconds[0] + e.key; }
        if (parseInt(newSeconds) > 59) newSeconds = '59';
        if (secPos === 1) nextPosition = 8;
      }
      const formattedTime = `${newHours}:${newMinutes}:${newSeconds}`; setLocalTime(formattedTime);
      const currentDateForCombine = localDate || dateDisplay || "";
      let dateForCombine = date;
      if (!currentDateForCombine || currentDateForCombine === "dd/mm/yyyy" || currentDateForCombine === "00/00/0000" || currentDateForCombine.trim() === "") {
        const today = new Date(); dateForCombine = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      }
      if (dateForCombine) onChange && onChange(combineDateTime(dateForCombine, formattedTime));
      setTimeout(() => { input.setSelectionRange(nextPosition, nextPosition); }, 0);
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      setTimeout(() => { const newPos = input.selectionStart; if (newPos === 2 || newPos === 5) { const dir = e.key === 'ArrowLeft' ? -1 : 1; input.setSelectionRange(newPos + dir, newPos + dir); } }, 0);
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      let newHours = hours, newMinutes = minutes, newSeconds = seconds, nextPosition = currentPosition;
      if (currentPosition < 2) {
        const newHourStr = hours.split(''); newHourStr[currentPosition === 1 ? 1 : 0] = '0'; newHours = newHourStr.join(''); nextPosition = currentPosition === 1 ? 0 : 0;
      } else if (currentPosition >= 3 && currentPosition < 5) {
        const newMinStr = minutes.split('');
        if (currentPosition === 4) { newMinStr[1] = '0'; newMinutes = newMinStr.join(''); nextPosition = 3; }
        else { newMinStr[0] = '0'; newMinutes = newMinStr.join(''); nextPosition = 1; }
      } else if (currentPosition >= 6 && currentPosition < 8) {
        const newSecStr = seconds.split('');
        if (currentPosition === 7) { newSecStr[1] = '0'; newSeconds = newSecStr.join(''); nextPosition = 6; }
        else { newSecStr[0] = '0'; newSeconds = newSecStr.join(''); nextPosition = 4; }
      }
      const formattedTime = `${newHours}:${newMinutes}:${newSeconds}`; setLocalTime(formattedTime);
      const currentDateForCombine = localDate || dateDisplay || "";
      let dateForCombine = date;
      if (!currentDateForCombine || currentDateForCombine === "dd/mm/yyyy" || currentDateForCombine === "00/00/0000" || currentDateForCombine.trim() === "") {
        const today = new Date(); dateForCombine = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      }
      if (dateForCombine) onChange && onChange(combineDateTime(dateForCombine, formattedTime));
      setTimeout(() => { input.setSelectionRange(nextPosition, nextPosition); }, 0);
      return;
    }
  };

  const handleTimeFocus = (e) => {
    const currentDate = localDate || dateDisplay || "";
    if (!currentDate || currentDate === "dd/mm/yyyy" || currentDate === "00/00/0000" || currentDate.trim() === "") {
      const today = new Date();
      const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
      const dateStorage = `${y}-${m}-${d}`, dateDisplayToday = `${d}/${m}/${y}`;
      setLocalDate(dateDisplayToday);
      const currentTime = localTime === "HH:MM:SS" ? "00:00:00" : (localTime || time || "00:00:00");
      onChange && onChange(combineDateTime(dateStorage, currentTime));
    }
    const currentTime = localTime || time || "";
    if (!currentTime || !currentTime.includes(':') || currentTime.split(':').length !== 3 || currentTime === "HH:MM:SS") {
      setLocalTime("HH:MM:SS");
      setTimeout(() => { e.target.setSelectionRange(0, 0); }, 0);
    }
  };

  const handleTimeBlur = (e) => {
    let newTime = localTime || time || "";
    if (newTime && newTime.trim() !== "") {
      const parts = newTime.split(':');
      let hours = Math.min(23, Math.max(0, parseInt(parts[0] || 0) || 0));
      let minutes = Math.min(59, Math.max(0, parseInt(parts[1] || 0) || 0));
      let seconds = Math.min(59, Math.max(0, parseInt(parts[2] || 0) || 0));
      const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      setLocalTime(formattedTime);
      if (date) onChange && onChange(combineDateTime(date, formattedTime));
    } else { setLocalTime("HH:MM:SS"); }
  };

  const formatDisplay = (dtValue) => {
    if (!dtValue) return "-";
    try {
      const d = new Date(dtValue);
      if (isNaN(d.getTime())) return "-";
      const month = d.getMonth() + 1, day = d.getDate(), year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0'), minutes = String(d.getMinutes()).padStart(2, '0'), seconds = String(d.getSeconds()).padStart(2, '0');
      return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds}`;
    } catch (e) { return "-"; }
  };

  if (readOnly) {
    return (
      <fieldset style={{ ...field.fieldset, background: "#f4f4f4" }}>
        <legend style={field.legend}>
          {label}
          {required && <span style={{ color: "#d32f2f", marginLeft: "2px" }}>*</span>}
        </legend>
        <div style={{ ...field.input, background: "#f4f4f4", padding: "8px 12px", color: "#666" }}>
          {formatDisplay(value)}
        </div>
        {error && <div style={{ marginTop: "4px", fontSize: "12px", color: "#d32f2f" }}>{error}</div>}
      </fieldset>
    );
  }

  return (
    <fieldset style={field.fieldset}>
      <legend style={field.legend}>
        {label}
        {required && <span style={{ color: "#d32f2f", marginLeft: "2px" }}>*</span>}
      </legend>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", position: "relative" }}>
        <input
          type="text"
          ref={dateInputRef}
          value={localDate || "dd/mm/yyyy"}
          readOnly={readOnly}
          onChange={handleDateChange}
          onFocus={handleDateFocus}
          onBlur={handleDateBlur}
          onKeyDown={handleDateKeyDown}
          onClick={handleDateInputClick}
          placeholder="dd/mm/yyyy"
          style={{ ...field.input, background: "white", flex: "1", minWidth: "140px", textAlign: "center", cursor: "pointer" }}
          pattern="\d{2}/\d{2}/\d{4}"
          title="Enter date in DD/MM/YYYY format. Click to open calendar or type digits to replace."
        />
        <div style={{ position: "relative", flex: "1", display: "flex", alignItems: "center" }}>
        <input
          type="text"
            ref={timeInputRef}
            value={localTime || "HH:MM:SS"}
          readOnly={readOnly}
          onChange={handleTimeChange}
            onFocus={handleTimeFocus}
          onBlur={handleTimeBlur}
            onKeyDown={handleTimeKeyDown}
            onClick={() => !readOnly && setShowCalendar(true)}
            placeholder="HH:MM:SS"
            style={{ ...field.input, background: "white", flex: "1", minWidth: "120px", textAlign: "center", cursor: "pointer" }}
          pattern="([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]"
            title="Enter time in 24-hour format (HH:mm:ss). Click to open calendar."
        />
          {!readOnly && (
            <span onClick={handleDateInputClick} style={{ position: "absolute", right: "8px", cursor: "pointer", fontSize: "16px", color: "#666", userSelect: "none" }}>
              📅
            </span>
          )}
      </div>

        {/* Calendar Popup */}
        {showCalendar && !readOnly && (
          <div ref={calendarRef} style={dateTimePickerStyles.overlay} onClick={(e) => e.stopPropagation()}>
            <div style={dateTimePickerStyles.modal}>
              {/* Calendar Header */}
              <div style={dateTimePickerStyles.header}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <button onClick={() => navigateMonth(-1)} style={dateTimePickerStyles.arrowButton} title="Previous Month">‹</button>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1", justifyContent: "center" }}>
                    <select value={calendarDate.getMonth()} onChange={(e) => { const d = new Date(calendarDate); d.setMonth(parseInt(e.target.value)); setCalendarDate(d); }} style={{ padding: "4px 8px", fontSize: "16px", fontWeight: "600", color: "white", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "4px", cursor: "pointer", outline: "none" }} onClick={(e) => e.stopPropagation()}>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, idx) => <option key={idx} value={idx} style={{ background: "#0B3A6E", color: "white" }}>{m}</option>)}
                    </select>
                    <select value={calendarDate.getFullYear()} onChange={(e) => { const d = new Date(calendarDate); d.setFullYear(parseInt(e.target.value)); setCalendarDate(d); }} style={{ padding: "4px 8px", fontSize: "16px", fontWeight: "600", color: "white", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "4px", cursor: "pointer", outline: "none", minWidth: "70px" }} onClick={(e) => e.stopPropagation()}>
                      {getAllYears().map((y) => <option key={y} value={y} style={{ background: "#0B3A6E", color: "white" }}>{y}</option>)}
                    </select>
                  </div>
                  <button onClick={() => navigateMonth(1)} style={dateTimePickerStyles.arrowButton} title="Next Month">›</button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div style={{ padding: "16px", backgroundColor: "#fff" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "8px" }}>
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} style={{ textAlign: "center", fontSize: "12px", fontWeight: "600", color: "#666", padding: "4px" }}>{d}</div>)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
                  {getCalendarDays().map((day, index) => {
                    const isSelected = selectedDate && day !== null && selectedDate.getDate() === day && selectedDate.getMonth() === calendarDate.getMonth() && selectedDate.getFullYear() === calendarDate.getFullYear();
                    const isToday = day !== null && new Date().toDateString() === new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day).toDateString();
                    return (
                      <button key={index} onClick={() => handleDateSelect(day)} disabled={day === null} style={{ padding: "8px", border: "1px solid #ddd", background: isSelected ? "#0B3A6E" : isToday ? "#e3f2fd" : "white", color: isSelected ? "white" : isToday ? "#0B3A6E" : "#333", cursor: day === null ? "default" : "pointer", fontSize: "14px", fontWeight: isToday ? "600" : "400", borderRadius: "4px", minHeight: "36px", opacity: day === null ? 0 : 1 }}
                        onMouseEnter={(e) => { if (day !== null && !isSelected) e.target.style.background = "#f0f0f0"; }}
                        onMouseLeave={(e) => { if (day !== null && !isSelected) e.target.style.background = "white"; }}
                      >{day}</button>
                    );
                  })}
                </div>
              </div>

              {/* Time Picker */}
              <div style={{ padding: "16px", backgroundColor: "#f9f9f9", borderTop: "1px solid #eee" }}>
                <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "#333" }}>Time (24-hour format)</div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Hours</div>
                    <input type="text" ref={hoursInputRef} value={pickerHours} onKeyDown={(e) => handleTimePickerKeyDown(e, 'hours')} onFocus={() => handleTimePickerFocus('hours')} onChange={(e) => e.preventDefault()} style={{ width: "60px", padding: "8px", border: `2px solid ${activeTimePart === 'hours' ? '#0B3A6E' : '#ddd'}`, borderRadius: "4px", textAlign: "center", fontSize: "16px", fontWeight: "600", cursor: "text", background: "white" }} title="Type digits to replace: 00 (0-23)" />
                  </div>
                  <span style={{ fontSize: "20px", fontWeight: "600", color: "#333" }}>:</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Minutes</div>
                    <input type="text" ref={minutesInputRef} value={pickerMinutes} onKeyDown={(e) => handleTimePickerKeyDown(e, 'minutes')} onFocus={() => handleTimePickerFocus('minutes')} onChange={(e) => e.preventDefault()} style={{ width: "60px", padding: "8px", border: `2px solid ${activeTimePart === 'minutes' ? '#0B3A6E' : '#ddd'}`, borderRadius: "4px", textAlign: "center", fontSize: "16px", fontWeight: "600", cursor: "text", background: "white" }} title="Type digits to replace: 00 (0-59)" />
                  </div>
                  <span style={{ fontSize: "20px", fontWeight: "600", color: "#333" }}>:</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Seconds</div>
                    <input type="text" ref={secondsInputRef} value={pickerSeconds} onKeyDown={(e) => handleTimePickerKeyDown(e, 'seconds')} onFocus={() => handleTimePickerFocus('seconds')} onChange={(e) => e.preventDefault()} style={{ width: "60px", padding: "8px", border: `2px solid ${activeTimePart === 'seconds' ? '#0B3A6E' : '#ddd'}`, borderRadius: "4px", textAlign: "center", fontSize: "16px", fontWeight: "600", cursor: "text", background: "white" }} title="Type digits to replace: 00 (0-59)" />
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div style={dateTimePickerStyles.buttonGroup}>
                <button onClick={handleCalendarCancel} style={dateTimePickerStyles.cancelButton}>Cancel</button>
                <button onClick={handleCalendarOK} style={dateTimePickerStyles.okButton}>OK</button>
              </div>
            </div>
        </div>
      )}
      </div>
      {error && <div style={{ marginTop: "4px", fontSize: "12px", color: "#d32f2f" }}>{error}</div>}
    </fieldset>
  );
}

/* ================= FIELD ================= */
function Field({ label, value, onChange, readOnly, type = "text", required = false, selectOptions, error }) {
  // ✅ For datetime-local, use custom DateTimeField24 component to ensure 24-hour format display
  if (type === "datetime-local") {
    return (
      <DateTimeField24
        label={label}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        required={required}
        error={error}
      />
    );
  }

  const isSelect = Array.isArray(selectOptions) && selectOptions.length > 0 && !readOnly;

  return (
    <fieldset style={{
      ...field.fieldset,
      background: readOnly ? "#f4f4f4" : "white",
    }}>
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
      {error && (
        <div style={{ marginTop: "4px", fontSize: "12px", color: "#d32f2f" }}>
          {error}
        </div>
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

const dateTimePickerStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1001,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: "8px",
    overflow: "hidden",
    width: "380px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    backgroundColor: "#0B3A6E",
    padding: "16px 20px",
    textAlign: "center",
    position: "relative",
  },
  arrowButton: {
    width: "32px",
    height: "32px",
    backgroundColor: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: "50%",
    color: "white",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
  buttonGroup: {
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    borderTop: "1px solid #eee",
    backgroundColor: "#f9f9f9",
  },
  cancelButton: {
    flex: "1",
    padding: "8px 16px",
    backgroundColor: "transparent",
    color: "#0B3A6E",
    border: "1px solid #0B3A6E",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    textTransform: "uppercase",
    transition: "all 0.2s",
  },
  okButton: {
    flex: "1",
    padding: "8px 16px",
    backgroundColor: "#0B3A6E",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    textTransform: "uppercase",
    transition: "all 0.2s",
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
