import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import AppShell from "./AppShell";
import { getButtonStyle } from "./styles";
import { API_BASE } from "./api";
import { useAutoSave, loadSavedData, clearSavedData } from "./hooks/useAutoSave";
import { formatActivityText } from "./utils/formatActivityText";
import DraftSavePopup from "./components/DraftSavePopup";
import SuccessPopup from "./components/SuccessPopup";
import WarningPopup from "./components/WarningPopup";

/* ================= MAIN PAGE ================= */
export default function DispatchPage() {
  const { trainId: encodedTrainId } = useParams();
  const trainId = encodedTrainId ? decodeURIComponent(encodedTrainId) : null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const indentNumber = searchParams.get("indent_number"); // Support Case 2: multiple indents with same train_id
  const wagonDetailsComplete = searchParams.get("wagon_details_complete") === "true"; // Flag from TrainEdit.jsx

  // Current user role (ADMIN or SUPER_ADMIN) to drive backend behavior
  const role = localStorage.getItem("role") || "ADMIN";

  const [siding, setSiding] = useState("");
  const [rakeSerialNumber, setRakeSerialNumber] = useState(""); // ✅ FIX: Store actual rake_serial_number from backend
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDraftPopup, setShowDraftPopup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [indentError, setIndentError] = useState("");
  const [warning, setWarning] = useState({ open: false, message: "", title: "Warning" });

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
  const autoSaveKey = `dispatch-form-${trainId}${indentNumber ? `-${indentNumber}` : ''}`;
  useAutoSave(autoSaveKey, form, 1500); // Save after 1.5 seconds of inactivity

  const [autoData, setAutoData] = useState({
    rake_loading_start_datetime: "",
    rake_loading_end_actual: "",
  });

  // ✅ FIX: Also auto-save autoData to preserve calculated times
  const autoDataKey = `${autoSaveKey}-autoData`;
  useAutoSave(autoDataKey, autoData, 1500);


  const [activities, setActivities] = useState([]);
  const [rakeTypes, setRakeTypes] = useState([]);
  const [isApproved, setIsApproved] = useState(false);
  const [hasReviewerEdits, setHasReviewerEdits] = useState(false);


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

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    
    // Load saved form data first
    const savedData = loadSavedData(autoSaveKey);
    // ✅ FIX: Load saved autoData if available
    const savedAutoData = loadSavedData(autoDataKey);
    
    // Build URL with indent_number if present (Case 2: multiple indents with same train_id)
    const fetchUrl = indentNumber 
      ? `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch?indent_number=${encodeURIComponent(indentNumber)}`
      : `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch`;
    
    fetch(fetchUrl)
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
          // The backend returns the correct rake_serial_number for this indent
          setRakeSerialNumber(d.rake_serial_number || trainId || "");

          if (d.dispatch) {
            console.log("Step 2: Dispatch object exists", d.dispatch);
            
            console.log("Step 3: Formatting dates");
            const placementDate = formatDateTimeLocal(d.dispatch.rake_placement_datetime);
            console.log("Placement date formatted:", placementDate);
            const clearanceDate = formatDateTimeLocal(d.dispatch.rake_clearance_datetime);
            console.log("Clearance date formatted:", clearanceDate);
            
            // Only load rake_loading_end_railway if dispatch has been submitted or has other user-entered data
            // This ensures it's only loaded if the user has actually worked on the form before
            const hasUserData = d.dispatch.status === 'SUBMITTED' || 
                               d.dispatch.rake_placement_datetime || 
                               d.dispatch.rake_clearance_datetime ||
                               d.dispatch.rake_type ||
                               d.dispatch.indent_wagon_count ||
                               d.dispatch.loading_start_officer ||
                               d.dispatch.loading_completion_officer ||
                               d.dispatch.remarks;
            
            const rakeLoadingEndRailwayDate = hasUserData 
              ? formatDateTimeLocal(d.dispatch.rake_loading_end_railway)
              : ""; // Empty if no user data exists (first time visit)
            
            // ✅ Load door_closing_datetime and rake_haul_out_datetime into form (now user-editable)
            // Declare these BEFORE they're used in the form object
            const doorClosingDate = formatDateTimeLocal(d.dispatch.door_closing_datetime);
            const rakeHaulOutDate = formatDateTimeLocal(d.dispatch.rake_haul_out_datetime);
            
            console.log("Rake Loading End Railway date formatted:", rakeLoadingEndRailwayDate);
            console.log("Has user data (should load railway):", hasUserData);
            
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
              setOriginalForm(f); // Keep original as the API data
            } else {
              // No meaningful saved data - use fresh API data from database
              console.log("Using fresh data from database");
              setForm(f);
              setOriginalForm(f);
              
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
            const autoDataObj = {
              rake_loading_start_datetime: d.dispatch.rake_loading_start_datetime || "", // Try dispatch first
              rake_loading_end_actual: d.dispatch.rake_loading_end_actual || "", // Try dispatch first
            };
            
            // ✅ FIX: Merge with saved autoData from localStorage if available
            if (savedAutoData) {
              console.log("Found saved autoData from localStorage, merging");
              // Preserve loading times from localStorage if they exist (they might be more recent)
              if (savedAutoData.rake_loading_start_datetime && savedAutoData.rake_loading_start_datetime.trim() !== "") {
                autoDataObj.rake_loading_start_datetime = savedAutoData.rake_loading_start_datetime;
              }
              if (savedAutoData.rake_loading_end_actual && savedAutoData.rake_loading_end_actual.trim() !== "") {
                autoDataObj.rake_loading_end_actual = savedAutoData.rake_loading_end_actual;
              }
            }
            
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

    // Fetch activity timeline
    const fetchActivityTimeline = async () => {
      try {
        const timelineUrl = indentNumber 
          ? `${API_BASE}/train/${encodeURIComponent(trainId)}/activity-timeline?indent_number=${encodeURIComponent(indentNumber)}`
          : `${API_BASE}/train/${encodeURIComponent(trainId)}/activity-timeline`;
        
        const response = await fetch(timelineUrl, {
          headers: {
            "x-user-role": role,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setActivities(data.activities || []);
          
          // Check if status is APPROVED and if there are reviewer edits
          const allActivities = (data.activities || []).flatMap(group => group.activities || []);
          const hasApproval = allActivities.some(act => 
            act.activity_type === 'DISPATCH_APPROVED' || 
            act.text?.toLowerCase().includes('approved by reviewer') ||
            act.text?.toLowerCase().includes('submitted and approved')
          );
          const hasReviewerEdits = allActivities.some(act => 
            act.activity_type === 'REVIEWER_TRAIN_EDITED' && act.changeDetails
          );
          
          setIsApproved(hasApproval);
          setHasReviewerEdits(hasReviewerEdits);
        }
      } catch (err) {
        console.error("Failed to load activity timeline:", err);
      }
    };

    // ✅ FIX: Always fetch times from wagon_records based on indent_number, ordered by tower_number
    const fetchWagonData = async () => {
      try {
        console.log("Fetching wagon data to calculate rake loading times");
        const wagonUrl = indentNumber 
          ? `${API_BASE}/train/${encodeURIComponent(trainId)}/view?indent_number=${encodeURIComponent(indentNumber)}`
          : `${API_BASE}/train/${encodeURIComponent(trainId)}/view`;
        
        const response = await fetch(wagonUrl, {
          headers: {
            "x-user-role": "ADMIN",
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
            
            // ✅ FIX: Get last wagon's loading_end_time (ordered by tower_number)
            const lastWagon = [...sortedWagons].reverse().find(w => w.loading_end_time);
            const rakeLoadingEnd = lastWagon ? lastWagon.loading_end_time : "";
            
            // ✅ FIX: Update autoData with fetched values from wagons
            // Prefer fetched values from wagons (most accurate), but don't overwrite if previous has value and fetched is empty
            setAutoData(prev => {
              const newData = {
              ...prev,
                // Use fetched value if available, otherwise keep previous value (which might be from dispatch_records)
                rake_loading_start_datetime: rakeLoadingStart || prev.rake_loading_start_datetime || "",
                rake_loading_end_actual: rakeLoadingEnd || prev.rake_loading_end_actual || "",
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
                wagonsWithTimes: wagons.filter(w => w.loading_start_time || w.loading_end_time).length
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

    fetchActivityTimeline();
    // ✅ FIX: Add delay to ensure dispatch data is loaded first, and backend save completes
    // Increased delay to ensure wagon data is saved after proceed button click from TrainEdit
    // Increased from 500ms to 1000ms to give backend enough time to process and save all data
    setTimeout(() => {
      fetchWagonData();
    }, 1000);
  }, [trainId, indentNumber]);

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
    fetchRakeTypes();
  }, [role]);

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
    if (!originalForm) return form;
    const c = {};
    Object.keys(form).forEach((k) => {
      if (form[k] !== originalForm[k]) c[k] = form[k];
    });
    return c;
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

  /* ================= DOWNLOAD EXCEL TEMPLATE ================= */
  const downloadExcelTemplate = async () => {
    try {
      // Fetch the existing Excel template file from public folder
      const templatePath = "/Rake_details.xlsx";
      const downloadName = "Rake_details.xlsx";

      const response = await fetch(templatePath);
      if (!response.ok) {
        throw new Error("Failed to fetch template file");
      }

      const arrayBuffer = await response.arrayBuffer();

      // Create blob and download
      const blob = new Blob([arrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download Excel template", err);
      setWarning({ open: true, message: "Failed to download template file. Please try again.", title: "Error" });
    }
  };

  /* ================= UPLOAD EXCEL ================= */
  const handleExcelUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Read as 2D array
      const matrix = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      if (!matrix.length || matrix.length < 2) {
        setWarning({ open: true, message: "Uploaded file is empty or missing data row. Please ensure the file has headers in row 1 and data in row 2.", title: "Warning" });
        return;
      }

      // Normalize function for Excel headers (case-insensitive, removes all special characters)
      // Removes spaces, underscores, hyphens, ampersands, parentheses, commas, and other special chars
      const normalizeKey = (str) => {
        return String(str || "").trim().toLowerCase().replace(/[_\s\-&(),]/g, "").replace(/[^\w]/g, "");
      };

      // Find header row (first row)
      const headerRow = matrix[0] || [];
      const dataRow = matrix[1] || [];

      // Create mapping of normalized header names to form field names
      const headerMap = {
        "numberofindentwagons": "indent_wagon_count",
        "vesselname": "vessel_name",
        "typeofrake": "rake_type",
        "rakeplacementdatetime": "rake_placement_datetime",
        "rakeclearancetime": "rake_clearance_datetime",
        "rakeidletime": "rake_idle_time",
        "loadingstartofficer": "loading_start_officer",
        "loadingcompletionofficer": "loading_completion_officer",
        "remarksoperations": "remarks",
        "rrnumber": "rr_number",
        "rakeloadingenddatetimerailway": "rake_loading_end_railway",
        "doorclosingdatetime": "door_closing_datetime",
        "rakehauloutdatetime": "rake_haul_out_datetime",
      };

      // Build form data from Excel
      const formData = { ...form };
      let foundFields = 0;

      headerRow.forEach((header, index) => {
        const normalizedHeader = normalizeKey(header);
        const fieldName = headerMap[normalizedHeader];
        
        if (fieldName && dataRow[index] !== undefined && dataRow[index] !== null) {
          const value = String(dataRow[index]).trim();
          if (value !== "") {
            formData[fieldName] = value;
            foundFields++;
          }
        }
      });

      if (foundFields === 0) {
        setWarning({ open: true, message: "No matching fields found in the Excel file. Please check the header names match the template.", title: "Warning" });
        return;
      }

      // Update form with imported data
      setForm(formData);
      setOriginalForm(formData);
      
      setWarning({ open: true, message: `Successfully imported ${foundFields} field(s) from Excel file.`, title: "Success" });
    } catch (err) {
      console.error("Failed to import Excel", err);
      setWarning({ open: true, message: "Failed to read Excel file. Please check the format and try again.", title: "Error" });
    } finally {
      // Reset input so same file can be uploaded again if needed
      e.target.value = "";
    }
  };

  /* ================= VALIDATION ================= */
  const getMissingFields = () => {
    const missing = [];
    
    // Order: First wagon details, then fields in order of columns on rake details page
    
    // 1. Wagon details (from Wagon Edit page) - FIRST
    if (!wagonDetailsComplete) {
      missing.push("Wagon details (from Wagon Edit page)");
    }
    
    // 2. Number of Indent Wagons
    if (!form.indent_wagon_count || form.indent_wagon_count.trim() === "" || indentError) {
      missing.push("Number of Indent Wagons");
    }
    
    // 3. Type Of Rake
    if (!form.rake_type || form.rake_type.trim() === "") {
      missing.push("Type Of Rake");
    }
    
    // 4. Rake Placement Date & Time
    if (!form.rake_placement_datetime || form.rake_placement_datetime.trim() === "") {
      missing.push("Rake Placement Date & Time");
    }
    
    // 5. Rake Clearance Time
    if (!form.rake_clearance_datetime || form.rake_clearance_datetime.trim() === "") {
      missing.push("Rake Clearance Time");
    }
    
    // 6. Rake Idle time
    if (!form.rake_idle_time || form.rake_idle_time.trim() === "") {
      missing.push("Rake Idle time");
    }
    
    // 7. Rake Loading Start Date & Time (auto-populated, but check if missing)
    if (!autoData.rake_loading_start_datetime || autoData.rake_loading_start_datetime.trim() === "") {
      missing.push("Rake Loading Start Date & Time");
    }
    
    // 8. Rake Loading End Date & Time Actual (auto-populated, but check if missing)
    if (!autoData.rake_loading_end_actual || autoData.rake_loading_end_actual.trim() === "") {
      missing.push("Rake Loading End Date & Time Actual");
    }
    
    // 9. Rake Loading End Date & Time Railway
    if (!form.rake_loading_end_railway || form.rake_loading_end_railway.trim() === "") {
      missing.push("Rake Loading End Date & Time Railway");
    }
    
    // 10. Door Closing Date & Time
    if (!form.door_closing_datetime || form.door_closing_datetime.trim() === "") {
      missing.push("Door Closing Date & Time");
    }
    
    // 11. Loading Start Officer
    if (!form.loading_start_officer || form.loading_start_officer.trim() === "") {
      missing.push("Loading Start Officer");
    }
    
    // 12. Loading Completion Officer
    if (!form.loading_completion_officer || form.loading_completion_officer.trim() === "") {
      missing.push("Loading Completion Officer");
    }
    
    // 13. Remarks(Operations)
    if (!form.remarks || form.remarks.trim() === "") {
      missing.push("Remarks(Operations)");
    }
    
    return missing;
  };

  const isFormComplete = () => {
    // Check all required fields (vessel_name, rr_number, and rake_haul_out_datetime are optional)
    // Also check if wagon details are complete (from TrainEdit.jsx)
    const dispatchFieldsComplete = (
      form.indent_wagon_count &&
      form.indent_wagon_count.trim() !== "" &&
      !indentError &&
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
      form.door_closing_datetime.trim() !== ""
    );
    
    // Submit is only enabled if both dispatch fields AND wagon details are complete
    return dispatchFieldsComplete && wagonDetailsComplete;
  };

  const saveDraft = async (showAlert = true) => {
    const data = getChangedFields();
    if (!Object.keys(data).length) {
      // No changes - show popup and redirect to Dashboard
      if (showAlert) {
        setShowDraftPopup(true);
        // Popup will handle redirect to Dashboard when closed
      }
      return true; // Return true if no changes (nothing to save)
    }

    // ✅ FIX: DO NOT include auto-populated fields (rake_loading_start_datetime, rake_loading_end_actual)
    // These fields are calculated from wagon_records by the backend and should NEVER be updated by frontend saves
    // Only send user-editable fields
    const dataToSave = { ...data };
    
    // Explicitly exclude auto-populated fields
    delete dataToSave.rake_loading_start_datetime;
    delete dataToSave.rake_loading_end_actual;

    // Build URL with indent_number if present (Case 2: multiple indents with same train_id)
    const draftUrl = indentNumber 
      ? `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch/draft?indent_number=${encodeURIComponent(indentNumber)}`
      : `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch/draft`;

    try {
      const res = await fetch(
        draftUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": role,
          },
          body: JSON.stringify(dataToSave),
        }
      );

      if (res.ok) {
        setOriginalForm({ ...originalForm, ...data });
        // ✅ FIX: Clear autoData localStorage after successful save since it's now in the database
        clearSavedData(autoDataKey);
        
        // ✅ Also clear door_closing_datetime and rake_haul_out_datetime from autoData (they're now in form)
        
        // Show popup if showAlert is true
        if (showAlert) {
          setShowDraftPopup(true);
        }
        return true;
      } else {
        if (showAlert) setWarning({ open: true, message: "Save failed", title: "Error" });
        return false;
      }
    } catch (err) {
      console.error("Save draft error:", err);
      if (showAlert) setWarning({ open: true, message: "Save failed", title: "Error" });
      return false;
    }
  };

  const submit = async () => {
    if (!isFormComplete()) {
      setWarning({ open: true, message: "Please fill all required fields before submitting.", title: "Warning" });
      return;
    }
    
    // Automatically save draft before submitting
    const saveSuccess = await saveDraft(false); // Don't show alert for auto-save
    if (!saveSuccess) {
      setWarning({ open: true, message: "Failed to save changes. Please try again.", title: "Error" });
      return;
    }
    
    // Build URL with indent_number if present (Case 2: multiple indents with same train_id)
    const submitUrl = indentNumber 
      ? `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch/submit?indent_number=${encodeURIComponent(indentNumber)}`
      : `${API_BASE}/train/${encodeURIComponent(trainId)}/dispatch/submit`;
    
    try {
      const username = localStorage.getItem("username");
      const r = await fetch(
        submitUrl,
        { 
          method: "POST", 
          headers: { 
            "x-user-role": role,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            indent_number: indentNumber || null,
            rr_number: form.rr_number || null,
            rake_loading_end_railway: form.rake_loading_end_railway || null,
            door_closing_datetime: form.door_closing_datetime || null,
            rake_haul_out_datetime: form.rake_haul_out_datetime || null,
            // ✅ FIX: DO NOT send auto-populated fields (rake_loading_start_datetime, rake_loading_end_actual)
            // These are calculated from wagon_records by the backend and should NEVER be updated by frontend
            // Backend will fetch these from wagon_records automatically
            username: username, // Send username for activity timeline
          })
        }
      );
      
      if (r.ok) {
        // Clear auto-saved data on successful submit
        clearSavedData(autoSaveKey);
        // ✅ FIX: Also clear autoData localStorage
        clearSavedData(autoDataKey);
        
        // Refresh activity timeline after submission
        const timelineUrl = indentNumber 
          ? `${API_BASE}/train/${encodeURIComponent(trainId)}/activity-timeline?indent_number=${encodeURIComponent(indentNumber)}`
          : `${API_BASE}/train/${encodeURIComponent(trainId)}/activity-timeline`;
        
        fetch(timelineUrl, {
          headers: { "x-user-role": "ADMIN" },
        })
          .then(res => res.json())
          .then(data => setActivities(data.activities || []))
          .catch(err => console.error("Failed to refresh activity timeline:", err));
        
        setShowSuccess(true);
      } else {
        const errorData = await r.json().catch(() => ({ message: "Submit failed" }));
        setWarning({ open: true, message: errorData.message || "Submit failed", title: "Error" });
      }
    } catch (err) {
      console.error("Submit error:", err);
      setWarning({ open: true, message: "Submit failed. Please try again.", title: "Error" });
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
              onClick={() => navigate("/dashboard")}
            >
              Back to Dashboard
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
            {/* Download Template & Upload Excel buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "15px", gap: "10px" }}>
              <button
                onClick={downloadExcelTemplate}
                style={{
                  ...getButtonStyle("add"),
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: "8px 18px",
                }}
              >
                Download Template
              </button>
              <input
                id="dispatch-excel-upload"
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={handleExcelUpload}
              />
              <label
                htmlFor="dispatch-excel-upload"
                style={{
                  ...getButtonStyle("add"),
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: "8px 18px",
                }}
              >
                Upload Excel
              </label>
            </div>
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
            onChange={(v) => setForm({ ...form, vessel_name: v })} />

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
              <Field type="datetime-local" label="Rake Loading End Date & Time Railway" 
                value={form.rake_loading_end_railway}
                onChange={(v) => setForm({ ...form, rake_loading_end_railway: v })} 
                required />

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
              
              {/* Download button - only show after reviewer submits (APPROVED) and has reviewer edits */}
              {isApproved && hasReviewerEdits && (
                <div style={{ padding: "16px", borderTop: "1px solid #eee", backgroundColor: "#f9f9f9" }}>
                  <button
                    onClick={async () => {
                            try {
                              const role = localStorage.getItem("role");
                        const url = `${API_BASE}/train/${encodeURIComponent(trainId)}/export-all-reviewer-changes`;
                              
                              const response = await fetch(url, {
                                headers: {
                                  "x-user-role": role || "ADMIN",
                                },
                              });

                              if (!response.ok) {
                                const errorData = await response.json().catch(() => ({ message: "Download failed" }));
                                setWarning({ open: true, message: errorData.message || "Failed to download Excel file", title: "Error" });
                                return;
                              }

                              // Get the blob from response
                              const blob = await response.blob();
                              
                        // Format filename from rake_serial_number
                        // Format: {year-part}_{month-short}_{serial-part}_changes.xlsx
                        // Example: "2025-26/02/001" -> "2025-26_feb_001_changes.xlsx"
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
                              setWarning({ open: true, message: "Failed to download Excel file. Please try again.", title: "Error" });
                            }
                    }}
                                  style={{
                      width: "100%",
                      padding: "10px 16px",
                      backgroundColor: "#4CAF50",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "600",
                      transition: "background-color 0.2s",
                                  }}
                    onMouseOver={(e) => e.target.style.backgroundColor = "#45a049"}
                    onMouseOut={(e) => e.target.style.backgroundColor = "#4CAF50"}
                                >
                    Download All Reviewer Changes (Excel)
                                </button>
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
            onChange={(v) => setForm({ ...form, rr_number: v })} />
        </div>

        {/* Footer Buttons */}
        <div style={pdf.footer}>
        <button
        style={getButtonStyle("back")}
            onClick={() => {
              const editUrl = indentNumber
                ? `/train/${encodeURIComponent(trainId)}/edit?indent_number=${encodeURIComponent(indentNumber)}`
                : `/train/${encodeURIComponent(trainId)}/edit`;
              navigate(editUrl);
            }}
        >
        Back
        </button>
          <button style={pdf.cancelButton} onClick={() => navigate("/dashboard")}>
            Cancel
          </button>
          <button style={pdf.saveButton} onClick={saveDraft}>
            Save
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
            
            {/* Info button - show when form is not complete */}
            {!isFormComplete() && (
              <button
                style={infoButtonStyle}
                onClick={() => {
                  const missingFields = getMissingFields();
                  if (missingFields.length > 0) {
                    setWarning({ open: true, message: `Please fill the following fields:\n\n${missingFields.map(f => `• ${f}`).join('\n')}`, title: "Warning" });
                  } else {
                    setWarning({ open: true, message: "Please fill all required fields to submit.", title: "Warning" });
                  }
                }}
                title="Click to see why submit is disabled"
              >
                i
              </button>
            )}
          </div>
        </div>

      </div>

      <DraftSavePopup
        open={showDraftPopup}
        onClose={() => {
          setShowDraftPopup(false);
          navigate("/dashboard");
        }}
      />
      <SuccessPopup
        open={showSuccess}
        onClose={() => {
          setShowSuccess(false);
          navigate("/dashboard");
        }}
        title="Completed"
        message="Records Shared For Review."
      />
      <WarningPopup
        open={warning.open}
        onClose={() => setWarning({ open: false, message: "", title: "Warning" })}
        message={warning.message}
        title={warning.title}
      />
    </AppShell>
  );
}


/* ================= CUSTOM DATETIME FIELD (24-HOUR FORMAT) ================= */
function DateTimeField24({ label, value, onChange, readOnly, required = false, error }) {
  const [localDate, setLocalDate] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [pickerHours, setPickerHours] = useState("00");
  const [pickerMinutes, setPickerMinutes] = useState("00");
  const [pickerSeconds, setPickerSeconds] = useState("00");
  const [activeTimePart, setActiveTimePart] = useState('hours'); // 'hours', 'minutes', 'seconds'
  const hoursInputRef = useRef(null);
  const minutesInputRef = useRef(null);
  const secondsInputRef = useRef(null);
  const dateInputRef = useRef(null);
  const timeInputRef = useRef(null);
  const calendarRef = useRef(null);

  // Parse the datetime value (ISO string or datetime-local format) into date and time parts
  const parseDateTime = (dtValue) => {
    if (!dtValue) return { date: "", dateDisplay: "", time: "" };
    
    let dateObj;
    // Check if it's an ISO string or datetime-local format
    if (dtValue.includes("T")) {
      // Try to parse as ISO string first
      dateObj = new Date(dtValue);
      if (isNaN(dateObj.getTime())) {
        // If not valid ISO, try datetime-local format (YYYY-MM-DDTHH:mm:ss)
        const [datePart, timePart] = dtValue.split("T");
        const time = timePart ? timePart.substring(0, 8) : ""; // HH:mm:ss
        // Convert YYYY-MM-DD to DD/MM/YYYY for display
        const dateDisplay = datePart ? convertToDDMMYYYY(datePart) : "";
        return { date: datePart || "", dateDisplay: dateDisplay, time: time || "" };
      }
    } else {
      return { date: "", dateDisplay: "", time: "" };
    }
    
    // Convert Date object to date and time parts
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    
    // Format: YYYY-MM-DD for storage, DD/MM/YYYY for display
    const dateStorage = `${year}-${month}-${day}`;
    const dateDisplay = `${day}/${month}/${year}`;
    
    return {
      date: dateStorage,
      dateDisplay: dateDisplay,
      time: `${hours}:${minutes}:${seconds}`
    };
  };

  // Convert YYYY-MM-DD to DD/MM/YYYY
  const convertToDDMMYYYY = (yyyyMMdd) => {
    if (!yyyyMMdd) return "";
    const parts = yyyyMMdd.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return yyyyMMdd;
  };

  // Convert DD/MM/YYYY to YYYY-MM-DD
  const convertToYYYYMMDD = (ddmmyyyy) => {
    if (!ddmmyyyy) return "";
    const parts = ddmmyyyy.split("/");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return ddmmyyyy;
  };

  // Combine date and time into ISO string format
  const combineDateTime = (date, time) => {
    // If no date, just return empty string (user must select date first)
    if (!date || date.trim() === "") {
      return "";
    }
    // If no time provided, use 00:00:00
    if (!time || time.trim() === "") {
      const dateObj = new Date(`${date}T00:00:00`);
      return dateObj.toISOString();
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

    const dateObj = new Date(`${date}T${hours}:${minutes}:${seconds}`);
    return dateObj.toISOString();
  };

  const { date, dateDisplay, time } = parseDateTime(value);

  // Sync localDate and localTime with value when value changes externally
  useEffect(() => {
    // Initialize with "00/00/0000" if no date value exists
    setLocalDate(dateDisplay || "00/00/0000");
    // Initialize with "00:00:00" if no time value exists
    setLocalTime(time || "00:00:00");
    
    // Initialize calendar date and time picker values
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
      // Initialize with current year if no value
      const today = new Date();
      setCalendarDate(today);
      setSelectedDate(today);
    }
  }, [dateDisplay, time, value]);

  // Close calendar when clicking outside
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
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCalendar]);

  const handleDateChange = (e) => {
    // This handler is mainly for paste operations and manual editing
    let newDate = e.target.value;
    
    // Remove any non-digit and slash characters
    newDate = newDate.replace(/[^\d/]/g, '');
    
    // Ensure format is DD/MM/YYYY
    const parts = newDate.split('/');
    let day = (parts[0] || '00').padStart(2, '0').substring(0, 2);
    let month = (parts[1] || '00').padStart(2, '0').substring(0, 2);
    let year = (parts[2] || '0000').padStart(4, '0').substring(0, 4);
    
    // Validate ranges
    const dayNum = parseInt(day) || 0;
    const monthNum = parseInt(month) || 0;
    const yearNum = parseInt(year) || 0;
    
    if (dayNum > 31) day = '31';
    if (monthNum > 12) month = '12';
    if (yearNum > 9999) year = '9999';
    
    const formattedDate = `${day}/${month}/${year}`;
    setLocalDate(formattedDate);
    
    // Convert to YYYY-MM-DD for storage
    const dateStorage = convertToYYYYMMDD(formattedDate);
    const currentTime = localTime || time || "00:00:00";
    const newValue = combineDateTime(dateStorage, currentTime);
    onChange && onChange(newValue);
  };

  const handleDateKeyDown = (e) => {
    const input = e.target;
    let currentDate = localDate || "00/00/0000";
    
    // Ensure format is always DD/MM/YYYY
    if (!currentDate.includes('/')) {
      currentDate = "00/00/0000";
    }
    
    const parts = currentDate.split('/');
    let day = (parts[0] || '00').padStart(2, '0');
    let month = (parts[1] || '00').padStart(2, '0');
    let year = (parts[2] || '0000').padStart(4, '0');
    
    // Determine current position (0-9: D D / M M / Y Y Y Y)
    // Position: 0,1 = day, 3,4 = month, 6,7,8,9 = year
    let currentPosition = input.selectionStart;
    
    // Adjust position if cursor is on a slash
    if (currentPosition === 2 || currentPosition === 5) {
      currentPosition = currentPosition + 1;
    }
    
    // Handle number key press - replace digit at current position
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      
      let newDay = day;
      let newMonth = month;
      let newYear = year;
      let nextPosition = currentPosition + 1;
      let shouldMoveToTime = false;
      
      if (currentPosition < 2) {
        // Replacing day digits
        const dayPos = currentPosition;
        const newDayStr = day.split('');
        newDayStr[dayPos] = e.key;
        const newDayNum = parseInt(newDayStr.join('')) || 0;
        
        // Validate: first digit can be 0-3, second digit depends on first
        if (dayPos === 0) {
          // First digit of day
          if (parseInt(e.key) > 3) {
            return;
          }
          newDay = e.key + day[1];
        } else if (dayPos === 1) {
          // Second digit of day
          const firstDigit = parseInt(day[0]) || 0;
          if (firstDigit === 3 && parseInt(e.key) > 1) {
            return;
        }
          newDay = day[0] + e.key;
    }
    
        // Validate final day value
        const finalDay = parseInt(newDay) || 0;
        if (finalDay > 31) {
          newDay = '31';
        }
        
        // Auto-advance to month after second digit
        if (dayPos === 1) {
          nextPosition = 3; // Move to first month digit
        }
      } else if (currentPosition >= 3 && currentPosition < 5) {
        // Replacing month digits
        const monthPos = currentPosition - 3;
        const newMonthStr = month.split('');
        newMonthStr[monthPos] = e.key;
        const newMonthNum = parseInt(newMonthStr.join('')) || 0;
        
        // Validate: first digit can be 0-1, second digit depends on first
        if (monthPos === 0) {
          // First digit of month
          if (parseInt(e.key) > 1) {
            return;
          }
          newMonth = e.key + month[1];
        } else if (monthPos === 1) {
          // Second digit of month
          const firstDigit = parseInt(month[0]) || 0;
          if (firstDigit === 1 && parseInt(e.key) > 2) {
            return;
          }
          newMonth = month[0] + e.key;
    }
    
        // Validate final month value
        const finalMonth = parseInt(newMonth) || 0;
        if (finalMonth > 12) {
          newMonth = '12';
        }
        
        // Auto-advance to year after second digit
        if (monthPos === 1) {
          nextPosition = 6; // Move to first year digit
        }
      } else if (currentPosition >= 6 && currentPosition < 10) {
        // Replacing year digits
        const yearPos = currentPosition - 6;
        const newYearStr = year.split('');
        newYearStr[yearPos] = e.key;
        newYear = newYearStr.join('');
        
        // Auto-advance to time after fourth digit
        if (yearPos === 3) {
          shouldMoveToTime = true;
        }
      }
      
      // Update date with new values
      const formattedDate = `${newDay}/${newMonth}/${newYear}`;
      setLocalDate(formattedDate);
      
      // Convert to YYYY-MM-DD for storage
      const dateStorage = convertToYYYYMMDD(formattedDate);
      const currentTime = localTime || time || "00:00:00";
      const newValue = combineDateTime(dateStorage, currentTime);
      onChange && onChange(newValue);
      
      // Move cursor to next position or move to time input
      if (shouldMoveToTime) {
        setTimeout(() => {
          if (timeInputRef.current) {
            timeInputRef.current.focus();
            timeInputRef.current.setSelectionRange(0, 0);
          }
        }, 0);
      } else {
        setTimeout(() => {
          input.setSelectionRange(nextPosition, nextPosition);
        }, 0);
      }
      
      return;
    }
    
    // Handle backspace - remove digit and move cursor back
    if (e.key === 'Backspace') {
      e.preventDefault();
      
      let newDay = day;
      let newMonth = month;
      let newYear = year;
      let nextPosition = currentPosition;
      
      if (currentPosition < 2) {
        // In day field
        if (currentPosition === 1) {
          const newDayStr = day.split('');
          newDayStr[1] = '0';
          newDay = newDayStr.join('');
          nextPosition = 0;
        } else if (currentPosition === 0) {
          const newDayStr = day.split('');
          newDayStr[0] = '0';
          newDay = newDayStr.join('');
          nextPosition = 0;
        }
      } else if (currentPosition >= 3 && currentPosition < 5) {
        // In month field
        if (currentPosition === 4) {
          const newMonthStr = month.split('');
          newMonthStr[1] = '0';
          newMonth = newMonthStr.join('');
          nextPosition = 3;
        } else if (currentPosition === 3) {
          const newMonthStr = month.split('');
          newMonthStr[0] = '0';
          newMonth = newMonthStr.join('');
          nextPosition = 1; // Move to second day digit
        }
      } else if (currentPosition >= 6 && currentPosition < 10) {
        // In year field
        if (currentPosition > 6) {
          const newYearStr = year.split('');
          newYearStr[currentPosition - 6] = '0';
          newYear = newYearStr.join('');
          nextPosition = currentPosition - 1;
        } else if (currentPosition === 6) {
          const newYearStr = year.split('');
          newYearStr[0] = '0';
          newYear = newYearStr.join('');
          nextPosition = 4; // Move to second month digit
        }
      }
      
      const formattedDate = `${newDay}/${newMonth}/${newYear}`;
      setLocalDate(formattedDate);
    
      // Convert to YYYY-MM-DD for storage
      const dateStorage = convertToYYYYMMDD(formattedDate);
      const currentTime = localTime || time || "00:00:00";
      const newValue = combineDateTime(dateStorage, currentTime);
      onChange && onChange(newValue);
      
    setTimeout(() => {
        input.setSelectionRange(nextPosition, nextPosition);
      }, 0);
      
      return;
    }
    
    // Handle arrow keys for navigation
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      setTimeout(() => {
        const newPos = input.selectionStart;
        if (newPos === 2 || newPos === 5) {
          const direction = e.key === 'ArrowLeft' ? -1 : 1;
          input.setSelectionRange(newPos + direction, newPos + direction);
    }
    }, 0);
    }
  };

  const handleDateFocus = (e) => {
    // Ensure format is "00/00/0000" when focused if empty or invalid
    const currentDate = localDate || "";
    if (!currentDate || !currentDate.includes('/') || currentDate.split('/').length !== 3) {
      setLocalDate("00/00/0000");
      setTimeout(() => {
        e.target.setSelectionRange(0, 0); // Position cursor at start
      }, 0);
    }
  };

  const handleDateInputClick = () => {
    if (!readOnly) {
      setShowCalendar(true);
      // Initialize calendar with current value or today
      if (value) {
        const dateObj = new Date(value);
        if (!isNaN(dateObj.getTime())) {
          setCalendarDate(dateObj);
          setSelectedDate(dateObj);
          // Initialize time picker values from current time
          const timeParts = time.split(':');
          setPickerHours(String(parseInt(timeParts[0] || 0) || 0).padStart(2, '0'));
          setPickerMinutes(String(parseInt(timeParts[1] || 0) || 0).padStart(2, '0'));
          setPickerSeconds(String(parseInt(timeParts[2] || 0) || 0).padStart(2, '0'));
      } else {
          const today = new Date();
          setCalendarDate(today);
          setSelectedDate(today);
          setPickerHours("00");
          setPickerMinutes("00");
          setPickerSeconds("00");
        }
      } else {
        const today = new Date();
        setCalendarDate(today);
        setSelectedDate(today);
        setPickerHours("00");
        setPickerMinutes("00");
        setPickerSeconds("00");
      }
    }
  };

  // Calendar functions
  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getCalendarDays = () => {
    const daysInMonth = getDaysInMonth(calendarDate);
    const firstDay = getFirstDayOfMonth(calendarDate);
    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
      }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  };

  const navigateMonth = (direction) => {
    setCalendarDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const getAllYears = () => {
    // Generate array of years: 100 years before current year to 50 years after
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 100;
    const endYear = currentYear + 50;
    return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
  };

  const handleDateSelect = (day) => {
    if (day === null) return;
    
    const newDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
    setSelectedDate(newDate);
    
    // Update the date part
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(newDate.getDate()).padStart(2, '0');
    const dateStorage = `${year}-${month}-${dayStr}`;
    const dateDisplay = `${dayStr}/${month}/${year}`;
    
    setLocalDate(dateDisplay);
    
    // Combine with current time
    const currentTime = localTime || time || "00:00:00";
    const newValue = combineDateTime(dateStorage, currentTime);
    onChange && onChange(newValue);
  };

  const handleTimePickerKeyDown = (e, type) => {
    const input = e.target;
    let currentValue = type === 'hours' ? pickerHours : type === 'minutes' ? pickerMinutes : pickerSeconds;
    const cursorPos = input.selectionStart || 0;
    
    // Ensure format is always 2 digits
    if (!currentValue || currentValue.length !== 2) {
      currentValue = "00";
    }
    
    // Handle number key press - replace digit at current position
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      
      let newValue = currentValue.split('');
      let nextPosition = cursorPos + 1;
      let shouldMoveToNext = false;
      
      if (cursorPos < 2) {
        // Replace digit at cursor position
        newValue[cursorPos] = e.key;
        
        // Validate based on type and position
        if (type === 'hours') {
          if (cursorPos === 0 && parseInt(e.key) > 2) {
            return; // First digit of hours can't be > 2
          }
          if (cursorPos === 1) {
            const firstDigit = parseInt(newValue[0]) || 0;
            if (firstDigit === 2 && parseInt(e.key) > 3) {
              return; // Can't be > 23
            }
            shouldMoveToNext = true; // Move to minutes after second digit
          }
        } else if (type === 'minutes' || type === 'seconds') {
          if (cursorPos === 0 && parseInt(e.key) > 5) {
            return; // First digit can't be > 5
          }
          if (cursorPos === 1) {
            shouldMoveToNext = true; // Move to next field after second digit
          }
        }
        
        const updatedValue = newValue.join('');
        const numValue = parseInt(updatedValue) || 0;
        
        // Validate ranges
        if (type === 'hours' && numValue > 23) {
          return;
        }
        if ((type === 'minutes' || type === 'seconds') && numValue > 59) {
          return;
        }
        
        // Update state
        if (type === 'hours') {
          setPickerHours(updatedValue);
        } else if (type === 'minutes') {
          setPickerMinutes(updatedValue);
        } else if (type === 'seconds') {
          setPickerSeconds(updatedValue);
      }
        
        // Update time immediately
        const hours = type === 'hours' ? updatedValue : pickerHours;
        const minutes = type === 'minutes' ? updatedValue : pickerMinutes;
        const seconds = type === 'seconds' ? updatedValue : pickerSeconds;
        const timeStr = `${hours}:${minutes}:${seconds}`;
        setLocalTime(timeStr);
        
        if (selectedDate || date) {
          const dateStorage = selectedDate 
            ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
            : date;
          const newValue = combineDateTime(dateStorage, timeStr);
          onChange && onChange(newValue);
        }
        
        // Move cursor or focus next field
        if (shouldMoveToNext) {
          setTimeout(() => {
            if (type === 'hours' && minutesInputRef.current) {
              minutesInputRef.current.focus();
              minutesInputRef.current.setSelectionRange(0, 0);
            } else if (type === 'minutes' && secondsInputRef.current) {
              secondsInputRef.current.focus();
              secondsInputRef.current.setSelectionRange(0, 0);
            }
          }, 0);
    } else {
          setTimeout(() => {
            input.setSelectionRange(nextPosition, nextPosition);
          }, 0);
        }
      }
      return;
    }
    
    // Handle backspace - remove digit and move cursor back
    if (e.key === 'Backspace') {
      e.preventDefault();
      
      let newValue = currentValue.split('');
      let nextPosition = cursorPos;
      
      if (cursorPos === 1) {
        // At second digit - clear it and move to first
        newValue[1] = '0';
        nextPosition = 0;
      } else if (cursorPos === 0) {
        // At first digit - clear it (stay at position 0)
        newValue[0] = '0';
        nextPosition = 0;
    }
    
      const updatedValue = newValue.join('');
      
      // Update state
      if (type === 'hours') {
        setPickerHours(updatedValue);
      } else if (type === 'minutes') {
        setPickerMinutes(updatedValue);
      } else if (type === 'seconds') {
        setPickerSeconds(updatedValue);
      }
      
      // Update time immediately
      const hours = type === 'hours' ? updatedValue : pickerHours;
      const minutes = type === 'minutes' ? updatedValue : pickerMinutes;
      const seconds = type === 'seconds' ? updatedValue : pickerSeconds;
      const timeStr = `${hours}:${minutes}:${seconds}`;
      setLocalTime(timeStr);
      
      if (selectedDate || date) {
        const dateStorage = selectedDate 
          ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
          : date;
        const newValue = combineDateTime(dateStorage, timeStr);
        onChange && onChange(newValue);
      }
      
    setTimeout(() => {
        input.setSelectionRange(nextPosition, nextPosition);
      }, 0);
      
      return;
    }
    
    // Handle arrow keys for navigation
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Allow default behavior
      return;
    }
  };

  const handleTimePickerFocus = (type) => {
    setActiveTimePart(type);
    // Select all text on focus for easy replacement
    setTimeout(() => {
      if (type === 'hours' && hoursInputRef.current) {
        hoursInputRef.current.setSelectionRange(0, 2);
      } else if (type === 'minutes' && minutesInputRef.current) {
        minutesInputRef.current.setSelectionRange(0, 2);
      } else if (type === 'seconds' && secondsInputRef.current) {
        secondsInputRef.current.setSelectionRange(0, 2);
    }
    }, 0);
  };

  const handleCalendarOK = () => {
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStorage = `${year}-${month}-${day}`;
      const dateDisplay = `${day}/${month}/${year}`;
      
      setLocalDate(dateDisplay);
      
      // pickerHours, pickerMinutes, pickerSeconds are already strings in "00" format
      const timeStr = `${pickerHours}:${pickerMinutes}:${pickerSeconds}`;
      setLocalTime(timeStr);
      
      const newValue = combineDateTime(dateStorage, timeStr);
      onChange && onChange(newValue);
    }
    setShowCalendar(false);
  };

  const handleCalendarCancel = () => {
    setShowCalendar(false);
  };

  const handleDateBlur = (e) => {
    let newDate = localDate || "";
    
    // Validate and format date on blur
    if (newDate && newDate.trim() !== "") {
      const parts = newDate.split('/');
      let day = parseInt(parts[0] || 0) || 0;
      let month = parseInt(parts[1] || 0) || 0;
      let year = parseInt(parts[2] || 0) || 0;
      
      // Clamp values to valid ranges
      day = Math.min(31, Math.max(1, day));
      month = Math.min(12, Math.max(1, month));
      year = Math.min(9999, Math.max(1900, year));
      
      const formattedDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`;
      setLocalDate(formattedDate);
      
      // Convert to YYYY-MM-DD for storage
      const dateStorage = convertToYYYYMMDD(formattedDate);
      const currentTime = localTime || time || "00:00:00";
      const newValue = combineDateTime(dateStorage, currentTime);
      onChange && onChange(newValue);
    } else {
      // If empty, set to "00/00/0000"
      setLocalDate("00/00/0000");
      const dateStorage = convertToYYYYMMDD("00/00/0000");
      const currentTime = localTime || time || "00:00:00";
      const newValue = combineDateTime(dateStorage, currentTime);
      onChange && onChange(newValue);
    }
  };

  const handleTimeChange = (e) => {
    // This handler is mainly for paste operations and manual editing
    // The actual digit-by-digit replacement is handled in handleTimeKeyDown
    let newTime = e.target.value;
    
    // Remove any non-digit and colon characters
    newTime = newTime.replace(/[^\d:]/g, '');
    
    // Ensure format is HH:mm:ss
    const parts = newTime.split(':');
    let hours = (parts[0] || '00').padStart(2, '0').substring(0, 2);
    let minutes = (parts[1] || '00').padStart(2, '0').substring(0, 2);
    let seconds = (parts[2] || '00').padStart(2, '0').substring(0, 2);
    
    // Validate ranges
    const hourNum = parseInt(hours) || 0;
    const minNum = parseInt(minutes) || 0;
    const secNum = parseInt(seconds) || 0;
    
    if (hourNum > 23) hours = '23';
    if (minNum > 59) minutes = '59';
    if (secNum > 59) seconds = '59';
    
    const formattedTime = `${hours}:${minutes}:${seconds}`;
    setLocalTime(formattedTime);
    
    // Update the combined datetime value
    if (date) {
      const newValue = combineDateTime(date, formattedTime);
      onChange && onChange(newValue);
    }
  };
  
  const handleTimeKeyDown = (e) => {
    const input = e.target;
    let currentTime = localTime || "00:00:00";
    const cursorPos = input.selectionStart;
    
    // Ensure format is always HH:mm:ss
    if (!currentTime.includes(':')) {
      currentTime = "00:00:00";
    }
    
    const parts = currentTime.split(':');
    let hours = (parts[0] || '00').padStart(2, '0');
    let minutes = (parts[1] || '00').padStart(2, '0');
    let seconds = (parts[2] || '00').padStart(2, '0');
    
    // Determine current position (0-7: H H : M M : S S)
    // Position: 0,1 = hours, 3,4 = minutes, 6,7 = seconds
    let currentPosition = cursorPos;
    
    // Adjust position if cursor is on a colon
    if (cursorPos === 2 || cursorPos === 5) {
      // Cursor is on a colon, move to next digit
      currentPosition = cursorPos + 1;
    }
    
    // Handle number key press - replace digit at current position
    if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
      
      let newHours = hours;
      let newMinutes = minutes;
      let newSeconds = seconds;
      let nextPosition = currentPosition + 1;
      
      if (currentPosition < 2) {
        // Replacing hours digits
        const hourPos = currentPosition;
        const newHourStr = hours.split('');
        newHourStr[hourPos] = e.key;
        const newHour = parseInt(newHourStr.join('')) || 0;
        
        // Validate: first digit can be 0-2, second digit depends on first
        if (hourPos === 0) {
          // First digit of hours
          if (parseInt(e.key) > 2) {
            // Invalid, don't update
          return;
        }
          newHours = e.key + hours[1];
        } else if (hourPos === 1) {
          // Second digit of hours
          const firstDigit = parseInt(hours[0]) || 0;
          if (firstDigit === 2 && parseInt(e.key) > 3) {
            // Can't be > 23
          return;
        }
          newHours = hours[0] + e.key;
        }
        
        // Validate final hour value
        const finalHour = parseInt(newHours) || 0;
        if (finalHour > 23) {
          newHours = '23';
        }
        
        // Auto-advance to minutes after second digit
        if (hourPos === 1) {
          nextPosition = 3; // Move to first minute digit
        }
      } else if (currentPosition >= 3 && currentPosition < 5) {
        // Replacing minutes digits
        const minPos = currentPosition - 3;
        const newMinStr = minutes.split('');
        newMinStr[minPos] = e.key;
        const newMin = parseInt(newMinStr.join('')) || 0;
        
        // Validate: first digit can be 0-5, second digit 0-9
        if (minPos === 0) {
          // First digit of minutes
          if (parseInt(e.key) > 5) {
            // Invalid, don't update
          return;
        }
          newMinutes = e.key + minutes[1];
        } else if (minPos === 1) {
          // Second digit of minutes
          newMinutes = minutes[0] + e.key;
    }
    
        // Validate final minute value
        const finalMin = parseInt(newMinutes) || 0;
        if (finalMin > 59) {
          newMinutes = '59';
        }
        
        // Auto-advance to seconds after second digit
        if (minPos === 1) {
          nextPosition = 6; // Move to first second digit
        }
      } else if (currentPosition >= 6 && currentPosition < 8) {
        // Replacing seconds digits
        const secPos = currentPosition - 6;
        const newSecStr = seconds.split('');
        newSecStr[secPos] = e.key;
        const newSec = parseInt(newSecStr.join('')) || 0;
        
        // Validate: first digit can be 0-5, second digit 0-9
        if (secPos === 0) {
          // First digit of seconds
          if (parseInt(e.key) > 5) {
            // Invalid, don't update
            return;
          }
          newSeconds = e.key + seconds[1];
        } else if (secPos === 1) {
          // Second digit of seconds
          newSeconds = seconds[0] + e.key;
        }
        
        // Validate final second value
        const finalSec = parseInt(newSeconds) || 0;
        if (finalSec > 59) {
          newSeconds = '59';
        }
        
        // Stay in seconds field after second digit
        if (secPos === 1) {
          nextPosition = 8; // End of input
        }
      }
      
      // Update time with new values
      const formattedTime = `${newHours}:${newMinutes}:${newSeconds}`;
      setLocalTime(formattedTime);
      
      // Update the combined datetime value
      if (date) {
        const newValue = combineDateTime(date, formattedTime);
        onChange && onChange(newValue);
      }
      
      // Move cursor to next position
        setTimeout(() => {
        input.setSelectionRange(nextPosition, nextPosition);
        }, 0);
      
      return;
    }
    
    // Handle arrow keys for navigation
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Allow default behavior but adjust if on colon
      setTimeout(() => {
        const newPos = input.selectionStart;
        if (newPos === 2 || newPos === 5) {
          // On a colon, move to next digit
          const direction = e.key === 'ArrowLeft' ? -1 : 1;
          input.setSelectionRange(newPos + direction, newPos + direction);
        }
      }, 0);
    }
    
    // Handle backspace - remove digit and move cursor back
    if (e.key === 'Backspace') {
        e.preventDefault();
      
      let newHours = hours;
      let newMinutes = minutes;
      let newSeconds = seconds;
      let nextPosition = currentPosition;
      
      if (currentPosition < 2) {
        // In hours field
        if (currentPosition === 1) {
          // At second hour digit - clear it and move to first
          const newHourStr = hours.split('');
          newHourStr[1] = '0';
          newHours = newHourStr.join('');
          nextPosition = 0;
        } else if (currentPosition === 0) {
          // At first hour digit - clear it (stay at position 0)
          const newHourStr = hours.split('');
          newHourStr[0] = '0';
          newHours = newHourStr.join('');
          nextPosition = 0;
        }
      } else if (currentPosition >= 3 && currentPosition < 5) {
        // In minutes field
        if (currentPosition === 4) {
          // At second minute digit - clear it and move to first
          const newMinStr = minutes.split('');
          newMinStr[1] = '0';
          newMinutes = newMinStr.join('');
          nextPosition = 3;
        } else if (currentPosition === 3) {
          // At first minute digit - clear it and move back to hours
          const newMinStr = minutes.split('');
          newMinStr[0] = '0';
          newMinutes = newMinStr.join('');
          nextPosition = 1; // Move to second hour digit
        }
      } else if (currentPosition >= 6 && currentPosition < 8) {
        // In seconds field
        if (currentPosition === 7) {
          // At second second digit - clear it and move to first
          const newSecStr = seconds.split('');
          newSecStr[1] = '0';
          newSeconds = newSecStr.join('');
          nextPosition = 6;
        } else if (currentPosition === 6) {
          // At first second digit - clear it and move back to minutes
          const newSecStr = seconds.split('');
          newSecStr[0] = '0';
          newSeconds = newSecStr.join('');
          nextPosition = 4; // Move to second minute digit
        }
      }
      
      const formattedTime = `${newHours}:${newMinutes}:${newSeconds}`;
      setLocalTime(formattedTime);
      
      // Update the combined datetime value
      if (date) {
        const newValue = combineDateTime(date, formattedTime);
        onChange && onChange(newValue);
      }
      
      // Move cursor to previous position
        setTimeout(() => {
        input.setSelectionRange(nextPosition, nextPosition);
        }, 0);
      
      return;
    }
    
    // Handle delete - remove digit at current position (forward delete)
    if (e.key === 'Delete') {
      e.preventDefault();
      
      let newHours = hours;
      let newMinutes = minutes;
      let newSeconds = seconds;
      
      if (currentPosition < 2) {
        // In hours field
        const hourPos = currentPosition === 0 ? 0 : 1;
        const newHourStr = hours.split('');
        newHourStr[hourPos] = '0';
        newHours = newHourStr.join('');
      } else if (currentPosition >= 3 && currentPosition < 5) {
        // In minutes field
        const minPos = currentPosition === 3 ? 0 : 1;
        const newMinStr = minutes.split('');
        newMinStr[minPos] = '0';
        newMinutes = newMinStr.join('');
      } else if (currentPosition >= 6 && currentPosition < 8) {
        // In seconds field
        const secPos = currentPosition === 6 ? 0 : 1;
        const newSecStr = seconds.split('');
        newSecStr[secPos] = '0';
        newSeconds = newSecStr.join('');
      }
      
      const formattedTime = `${newHours}:${newMinutes}:${newSeconds}`;
      setLocalTime(formattedTime);
      
      // Update the combined datetime value
      if (date) {
        const newValue = combineDateTime(date, formattedTime);
        onChange && onChange(newValue);
      }
      
      return;
    }
  };

  const handleTimeFocus = (e) => {
    // Ensure format is "00:00:00" when focused if empty or invalid
    const currentTime = localTime || time || "";
    if (!currentTime || !currentTime.includes(':') || currentTime.split(':').length !== 3) {
      setLocalTime("00:00:00");
      setTimeout(() => {
        e.target.setSelectionRange(0, 0); // Position cursor at start
      }, 0);
      }
    };

  const handleTimeBlur = (e) => {
    let newTime = localTime || time || "";
    
    // Validate and format time on blur
    if (newTime && newTime.trim() !== "") {
      const parts = newTime.split(':');
      let hours = parseInt(parts[0] || 0) || 0;
      let minutes = parseInt(parts[1] || 0) || 0;
      let seconds = parseInt(parts[2] || 0) || 0;
      
      // Clamp values to valid ranges
      hours = Math.min(23, Math.max(0, hours));
      minutes = Math.min(59, Math.max(0, minutes));
      seconds = Math.min(59, Math.max(0, seconds));
      
      const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      setLocalTime(formattedTime);
      
      // Update the combined value
      if (date) {
        const newValue = combineDateTime(date, formattedTime);
        onChange && onChange(newValue);
      }
      } else {
      // If empty, set to "00:00:00"
      setLocalTime("00:00:00");
      if (date) {
        const newValue = combineDateTime(date, "00:00:00");
        onChange && onChange(newValue);
      }
      }
    };

  // Format datetime for display (read-only mode)
  const formatDisplay = (dtValue) => {
    if (!dtValue) return "-";
    try {
      const date = new Date(dtValue);
      if (isNaN(date.getTime())) return "-";
      
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      return "-";
    }
  };

  if (readOnly) {
    return (
      <fieldset style={{
        ...field.fieldset,
        background: "#f4f4f4",
      }}>
        <legend style={field.legend}>
          {label}
          {required && <span style={{ color: "#d32f2f", marginLeft: "2px" }}>*</span>}
        </legend>
        <div style={{
          ...field.input,
          background: "#f4f4f4",
          padding: "8px 12px",
          color: "#666",
        }}>
          {formatDisplay(value)}
        </div>
        {error && (
          <div style={{ marginTop: "4px", fontSize: "12px", color: "#d32f2f" }}>
            {error}
          </div>
        )}
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
            value={localDate || "00/00/0000"}
          readOnly={readOnly}
          onChange={handleDateChange}
            onFocus={handleDateFocus}
            onBlur={handleDateBlur}
            onKeyDown={handleDateKeyDown}
            onClick={handleDateInputClick}
            placeholder="DD/MM/YYYY"
          style={{
            ...field.input,
            background: readOnly ? "#f4f4f4" : "white",
            flex: "1",
              minWidth: "140px",
              textAlign: "center",
              cursor: readOnly ? "default" : "pointer",
            }}
            pattern="\d{2}/\d{2}/\d{4}"
            title="Enter date in DD/MM/YYYY format. Click to open calendar or type digits to replace: 00/00/0000"
        />
        <div style={{ position: "relative", flex: "1", display: "flex", alignItems: "center" }}>
            <input
          type="text"
          ref={timeInputRef}
          value={localTime || "00:00:00"}
          readOnly={readOnly}
          onChange={handleTimeChange}
          onFocus={handleTimeFocus}
          onBlur={handleTimeBlur}
          onKeyDown={handleTimeKeyDown}
          onClick={() => !readOnly && setShowCalendar(true)}
          placeholder="00:00:00"
              style={{
                ...field.input,
            background: readOnly ? "#f4f4f4" : "white",
            flex: "1",
            minWidth: "120px",
            textAlign: "center",
            cursor: readOnly ? "default" : "pointer",
              }}
          pattern="([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]"
          title="Enter time in 24-hour format (HH:mm:ss). Click to open calendar or type digits to replace: 00:00:00"
        />
          {!readOnly && (
            <span
              onClick={handleDateInputClick}
              style={{
                position: "absolute",
                right: "8px",
                cursor: "pointer",
                fontSize: "16px",
                color: "#666",
                userSelect: "none",
              }}
            >
              📅
            </span>
          )}
        </div>
        
        {/* Calendar Popup */}
        {showCalendar && !readOnly && (
          <div
            ref={calendarRef}
            style={dateTimePickerStyles.overlay}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={dateTimePickerStyles.modal}>
              {/* Calendar Header */}
              <div style={dateTimePickerStyles.header}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <button
                    onClick={() => navigateMonth(-1)}
                    style={dateTimePickerStyles.arrowButton}
                    title="Previous Month"
                  >
                    ‹
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1", justifyContent: "center" }}>
                    <select
                      value={calendarDate.getMonth()}
                      onChange={(e) => {
                        const newDate = new Date(calendarDate);
                        newDate.setMonth(parseInt(e.target.value));
                        setCalendarDate(newDate);
                      }}
                      style={{
                        padding: "4px 8px",
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "white",
                        background: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.3)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        outline: "none",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, idx) => (
                        <option key={idx} value={idx} style={{ background: "#0B3A6E", color: "white" }}>
                          {month}
                        </option>
                      ))}
                    </select>
                    <select
                      value={calendarDate.getFullYear()}
                      onChange={(e) => {
                        const newDate = new Date(calendarDate);
                        const selectedYear = parseInt(e.target.value);
                        newDate.setFullYear(selectedYear);
                        setCalendarDate(newDate);
                      }}
                      style={{
                        padding: "4px 8px",
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "white",
                        background: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.3)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        outline: "none",
                        minWidth: "70px",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {getAllYears().map((year) => (
                        <option key={year} value={year} style={{ background: "#0B3A6E", color: "white" }}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => navigateMonth(1)}
                    style={dateTimePickerStyles.arrowButton}
                    title="Next Month"
                  >
                    ›
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div style={{ padding: "16px", backgroundColor: "#fff" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "8px" }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} style={{ textAlign: "center", fontSize: "12px", fontWeight: "600", color: "#666", padding: "4px" }}>
                      {day}
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
                  {getCalendarDays().map((day, index) => {
                    const isSelected = selectedDate && day !== null &&
                      selectedDate.getDate() === day &&
                      selectedDate.getMonth() === calendarDate.getMonth() &&
                      selectedDate.getFullYear() === calendarDate.getFullYear();
                    const isToday = day !== null && new Date().toDateString() === 
                      new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day).toDateString();
                    
                    return (
                      <button
                        key={index}
                        onClick={() => handleDateSelect(day)}
                        disabled={day === null}
                        style={{
                          padding: "8px",
                          border: "1px solid #ddd",
                          background: isSelected ? "#0B3A6E" : isToday ? "#e3f2fd" : "white",
                          color: isSelected ? "white" : isToday ? "#0B3A6E" : "#333",
                          cursor: day === null ? "default" : "pointer",
                          fontSize: "14px",
                          fontWeight: isToday ? "600" : "400",
                          borderRadius: "4px",
                          minHeight: "36px",
                          opacity: day === null ? 0 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (day !== null && !isSelected) {
                            e.target.style.background = "#f0f0f0";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (day !== null && !isSelected) {
                            e.target.style.background = "white";
                          }
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Picker */}
              <div style={{ padding: "16px", backgroundColor: "#f9f9f9", borderTop: "1px solid #eee" }}>
                <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "#333" }}>
                  Time (24-hour format)
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Hours</div>
                    <input
                      type="text"
                      ref={hoursInputRef}
                      value={pickerHours}
                      onKeyDown={(e) => handleTimePickerKeyDown(e, 'hours')}
                      onFocus={() => handleTimePickerFocus('hours')}
                      onChange={(e) => e.preventDefault()}
                      style={{
                        width: "60px",
                        padding: "8px",
                        border: `2px solid ${activeTimePart === 'hours' ? '#0B3A6E' : '#ddd'}`,
                        borderRadius: "4px",
                        textAlign: "center",
                        fontSize: "16px",
                        fontWeight: "600",
                        cursor: "text",
                        background: "white",
                      }}
                      title="Type digits to replace: 00 (0-23)"
                    />
                  </div>
                  <span style={{ fontSize: "20px", fontWeight: "600", color: "#333" }}>:</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Minutes</div>
                    <input
                      type="text"
                      ref={minutesInputRef}
                      value={pickerMinutes}
                      onKeyDown={(e) => handleTimePickerKeyDown(e, 'minutes')}
                      onFocus={() => handleTimePickerFocus('minutes')}
                      onChange={(e) => e.preventDefault()}
                      style={{
                        width: "60px",
                        padding: "8px",
                        border: `2px solid ${activeTimePart === 'minutes' ? '#0B3A6E' : '#ddd'}`,
                        borderRadius: "4px",
                        textAlign: "center",
                        fontSize: "16px",
                        fontWeight: "600",
                        cursor: "text",
                        background: "white",
                      }}
                      title="Type digits to replace: 00 (0-59)"
        />
                  </div>
                  <span style={{ fontSize: "20px", fontWeight: "600", color: "#333" }}>:</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Seconds</div>
                    <input
                      type="text"
                      ref={secondsInputRef}
                      value={pickerSeconds}
                      onKeyDown={(e) => handleTimePickerKeyDown(e, 'seconds')}
                      onFocus={() => handleTimePickerFocus('seconds')}
                      onChange={(e) => e.preventDefault()}
                      style={{
                        width: "60px",
                        padding: "8px",
                        border: `2px solid ${activeTimePart === 'seconds' ? '#0B3A6E' : '#ddd'}`,
                        borderRadius: "4px",
                        textAlign: "center",
                        fontSize: "16px",
                        fontWeight: "600",
                        cursor: "text",
                        background: "white",
                      }}
                      title="Type digits to replace: 00 (0-59)"
                    />
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div style={dateTimePickerStyles.buttonGroup}>
                <button
                  onClick={handleCalendarCancel}
                  style={dateTimePickerStyles.cancelButton}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCalendarOK}
                  style={dateTimePickerStyles.okButton}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div style={{ marginTop: "4px", fontSize: "12px", color: "#d32f2f" }}>
          {error}
        </div>
      )}
    </fieldset>
  );
}

/* ================= FIELD ================= */
function Field({ label, value, onChange, readOnly, type = "text", required = false, error, selectOptions }) {
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
    marginTop: "45px",
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

const infoButtonStyle = {
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  border: "2px solid #dc2626",
  backgroundColor: "#dc2626",
  color: "#fff",
  fontSize: "18px",
  fontWeight: "bold",
  fontStyle: "italic",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  transition: "all 0.2s",
  boxShadow: "0 2px 4px rgba(220, 38, 38, 0.2)",
  lineHeight: "1",
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
  dateSection: {
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderBottom: "1px solid #eee",
    backgroundColor: "#f9f9f9",
  },
  dateLabel: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#333",
  },
  dateInput: {
    flex: "1",
    padding: "6px 10px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    fontSize: "13px",
  },
  header: {
    backgroundColor: "#0B3A6E",
    padding: "16px 20px",
    textAlign: "center",
    position: "relative",
  },
  timeDisplay: {
    fontSize: "32px",
    fontWeight: "bold",
    color: "white",
    marginBottom: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
  },
  activeTime: {
    color: "white",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: "3px",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  inactiveTime: {
    color: "rgba(255,255,255,0.7)",
    cursor: "pointer",
    padding: "2px 6px",
  },
  timeSeparator: {
    color: "white",
  },
  instruction: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.9)",
    marginTop: "4px",
  },
  arrowControls: {
    position: "absolute",
    right: "16px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
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
  clockSection: {
    padding: "20px 16px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  clockSvg: {
    display: "block",
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