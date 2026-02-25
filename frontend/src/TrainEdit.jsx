import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import AppShell from "./AppShell";
import { API_BASE } from "./api";
import DraftSavePopup from "./components/DraftSavePopup";
import MultipleRakeSerialPopup from "./components/MultipleRakeSerialPopup";
import WarningPopup from "./components/WarningPopup";
import DeleteConfirmPopup from "./components/DeleteConfirmPopup";
import { urlParamToId, idToUrlParam } from "./utils/trainIdUtils";


import {
  cardStyles,
  fieldStyles,
  inputStyles,
  tableStyles,
  buttonGroupStyles,
  getButtonStyle,
  getInputStyle,
} from "./styles";


function FloatingField({ label, value, onChange, readOnly }) {
  return (
    <div style={floatingField.wrapper}>
      <div style={floatingField.label}>{label}</div>
      <input
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={floatingField.input}
      />
    </div>
  );
}

function BoxedField({ label, value, onChange, readOnly, isSelect, children }) {
  return (
    <div style={boxedFieldStyles.wrapper}>
      <div style={boxedFieldStyles.label}>{label}</div>

      {isSelect ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={boxedFieldStyles.select}
        >
          {children}
        </select>
      ) : (
        <input
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={boxedFieldStyles.input}
        />
      )}
    </div>
  );
}



function TrainEdit() {
  const { trainId: encodedTrainId } = useParams();
  const trainId = encodedTrainId ? urlParamToId(encodedTrainId) : null;
  const [searchParams] = useSearchParams();
  const indentNumber = searchParams.get('indent_number');
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const [showDraftPopup, setShowDraftPopup] = useState(false);
  const [showMultipleRakePopup, setShowMultipleRakePopup] = useState(false);
  const [warning, setWarning] = useState({ open: false, message: "", title: "Warning" });
  const [showToggleWarning, setShowToggleWarning] = useState(false);
  const [pendingToggleIndex, setPendingToggleIndex] = useState(null);

  /* ================= EDIT OPTIONS FROM POPUP ================= */
  const [editOptions, setEditOptions] = useState({
    singleIndent: true,
    wagonTypeHL: false
  });

  /* ================= TRACK IF SERIALS ALREADY SPLIT ================= */
  const [hasSequentialSerials, setHasSequentialSerials] = useState(false);
  // ✅ FIX: Track if the question has been answered (to prevent showing popup again)
  const [serialQuestionAnswered, setSerialQuestionAnswered] = useState(false);

  /* ================= HELPER: Format DateTime ================= */
  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return "-";
    try {
      const date = new Date(dateTimeString);

      // Get date parts
      const month = date.getMonth() + 1; // 1-12
      const day = date.getDate(); // 1-31
      const year = date.getFullYear();

      // Get time parts (24-hour format)
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      // Format: 7/1/2026, 11:08:21 (24-hour format)
      return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      return "-";
    }
  };


  /* ================= CUSTOMERS ================= */
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    if (role !== "ADMIN") return;

    fetch(`${API_BASE}/customers`, {
      headers: { "x-user-role": "ADMIN" },
    })
      .then((res) => res.json())
      .then(setCustomers)
      .catch(console.error);
  }, [role]);

  /* ================= DROPDOWN OPTIONS ================= */
  const [commodities, setCommodities] = useState([]);
  const [wagonTypes, setWagonTypes] = useState([]);

  useEffect(() => {
    // Fetch commodities
    fetch(`${API_BASE}/dropdown-options?type=commodity`, {
      headers: { "x-user-role": role || "" },
    })
      .then((res) => res.json())
      .then((data) => {
        setCommodities(data.map(item => item.option_value));
      })
      .catch((err) => {
        console.error("Failed to fetch commodities:", err);
        // Fallback to default values
        setCommodities(["Urea granuals", "Red MoP", "DAP", "NPK", "NPS", "TSP", "AS", "APS", "white MoP", "Urea prilled"]);
      });

    // Fetch wagon types
    fetch(`${API_BASE}/dropdown-options?type=wagon_type`, {
      headers: { "x-user-role": role || "" },
    })
      .then((res) => res.json())
      .then((data) => {
        setWagonTypes(data.map(item => item.option_value));
      })
      .catch((err) => {
        console.error("Failed to fetch wagon types:", err);
        // Fallback to default values
        setWagonTypes(["HL", "BCN", "BCNA", "BCNA-HS"]);
      });
  }, [role]);

  /* ================= SAVE STATE ================= */
  const [isSaved, setIsSaved] = useState(false);

  /* ================= TRAIN HEADER ================= */
  const [trainHeader, setTrainHeader] = useState({
    indent_number: "",
    customer_id: "",
    wagon_destination: "", // ✅ fetched only
    siding: "", // ✅ Store siding to persist round-trip
  });


  /* ================= WAGONS ================= */
  const [wagons, setWagons] = useState([]);

  // Track wagons manually toggled TRUE→FALSE by user (so we can persist false on save)
  const [manuallyToggledFalseWagons, setManuallyToggledFalseWagons] = useState(new Set());

  // (auto-write refs removed – backend poller handles loading_status=true writes)

  /* ================= ORIGINAL STATE (for change detection) ================= */
  const [originalState, setOriginalState] = useState(null);

  // Extract only user-editable fields (exclude auto-populated fields)
  // Used for change detection (originalState comparison)
  const getUserEditableFields = (wagons) => {
    return wagons.map(w => {
      // ✅ CRITICAL FIX: Normalize seal_numbers array for comparison
      // Filter out empty strings and normalize to ensure consistent comparison
      const normalizedSealNumbers = (w.seal_numbers && Array.isArray(w.seal_numbers))
        ? w.seal_numbers
          .map(s => s != null ? String(s).trim() : "")
          .filter(s => s !== "") // Remove empty strings for comparison
        : [];

      // Only user-editable fields, exclude auto-populated ones
      const editableFields = {
        wagon_number: w.wagon_number || "",
        wagon_type: w.wagon_type || "",
        cc_weight: w.cc_weight || "",
        sick_box: w.sick_box || "",
        wagon_to_be_loaded: w.wagon_to_be_loaded || "",
        commodity: w.commodity || "",
        seal_numbers: normalizedSealNumbers.length > 0 ? normalizedSealNumbers : [], // Use normalized array for comparison
        confirmed_seal_indices: w.confirmed_seal_indices || [], // Preserve confirmed seal indices
        stoppage_time: w.stoppage_time || "",
        remarks: w.remarks || "",
        loading_status: w.loading_status || false, // ✅ CRITICAL FIX: Include loading_status in change detection
        tower_number: w.tower_number, // Keep for reference but will be recalculated
        // Multiple indent mode fields
        indent_number: w.indent_number || "",
        wagon_destination: w.wagon_destination || "",
        customer_id: w.customer_id || "",
      };
      return editableFields;
    });
  };

  function createEmptyWagon(index) {
    return {
      wagon_number: "",
      wagon_type: editOptions.wagonTypeHL ? "HL" : "",  // Pre-fill with HL if option enabled
      cc_weight: "",
      sick_box: "",
      wagon_to_be_loaded: "",
      commodity: "",
      tower_number: index,
      loaded_bag_count: 0,
      unloaded_bag_count: 0,
      loading_start_time: "",
      loading_end_time: "",
      seal_numbers: [""],
      confirmed_seal_indices: [], // Track which seal numbers are confirmed (green)
      stoppage_time: "",
      remarks: "",
      loading_status: false,
      // Fields for multiple indent mode - use values from trainHeader
      indent_number: !editOptions.singleIndent ? (trainHeader.indent_number || "") : "",
      wagon_destination: !editOptions.singleIndent ? (trainHeader.wagon_destination || "") : "",
      customer_id: !editOptions.singleIndent ? (trainHeader.customer_id || "") : "",
    };
  }

  const smallActionBtn = {
    padding: "4px 8px",
    fontSize: "11px",
    lineHeight: "1",
    minHeight: "26px",
  };


  /* ================= LOAD EXISTING DATA ================= */
  useEffect(() => {
    const loadTrainData = async () => {
      try {
        // Build URL with indent_number query parameter if provided
        const url = indentNumber
          ? `${API_BASE}/train/${idToUrlParam(trainId)}/edit?indent_number=${encodeURIComponent(indentNumber)}`
          : `${API_BASE}/train/${idToUrlParam(trainId)}/edit`;

        const res = await fetch(url);
        if (!res.ok) return;

        const data = await res.json();

        // Load edit options from database or localStorage (fallback)
        const perTrainOptionsKey = trainId ? `editOptions:${trainId}` : 'editOptions';
        const storedOptions = localStorage.getItem(perTrainOptionsKey) || localStorage.getItem('editOptions');
        const dbOptions = {
          singleIndent: data.header.single_indent !== undefined ? data.header.single_indent : true,
          wagonTypeHL: data.header.hl_only !== undefined ? data.header.hl_only : false
        };

        // ✅ FIX: Always prefer the popup choice from localStorage when present (first-open intent),
        // then fall back to DB values (persisted choice), then defaults.
        // Relying on `indent_number` presence caused the popup selection to be ignored for single-indent trains.
        const finalOptions = storedOptions ? JSON.parse(storedOptions) : dbOptions;

        setEditOptions(finalOptions);

        // Load the flag for whether this train has already been split
        const hasSequentialFlag = data.header.has_sequential_serials;
        setHasSequentialSerials(hasSequentialFlag || false);

        // ✅ FIX: Check if question has been answered
        // For new trains, has_sequential_serials defaults to FALSE, so we need to check if train has been worked on
        // If train has no wagons or only empty wagons, it's a new train - show popup
        // If train has wagons with data, check the flag value
        const hasWagonsWithData = data.wagons && data.wagons.length > 0 &&
          data.wagons.some(w =>
            w.wagon_number || w.wagon_type || w.cc_weight || w.commodity || w.remarks ||
            w.loaded_bag_count > 0 || w.unloaded_bag_count > 0
          );

        // Question is answered if:
        // 1. Flag is explicitly TRUE (answered "Yes"), OR
        // 2. Flag is FALSE AND train has been worked on (has wagons with data) - meaning user answered "No"
        // Question is NOT answered if:
        // - Flag is FALSE but train hasn't been worked on yet (new train) - show popup
        const questionAnswered = hasSequentialFlag === true || (hasSequentialFlag === false && hasWagonsWithData);
        setSerialQuestionAnswered(questionAnswered);

        // Clear localStorage after using it
        // Clear localStorage after using it (per-train + legacy key)
        localStorage.removeItem(perTrainOptionsKey);
        localStorage.removeItem('editOptions');

        const apiHeader = {
          indent_number: data.header.indent_number || "",
          customer_id: data.header.customer_id
            ? String(data.header.customer_id)
            : "",
          commodity: data.header.commodity || "",
          wagon_destination: data.header.wagon_destination || "",
          siding: data.header.siding || "", // ✅ Persist siding from backend
        };

        let apiWagons;
        const manuallyFalseSet = new Set(); // wagons where DB=false but condition is met (user explicitly set false)

        // Get wagon_count from train_session (from header response)
        // For child records, wagon_count is already set to the actual count of wagons for that indent
        // For parent records, wagon_count is from train_session
        const wagonCount = data.header.wagon_count != null ? Number(data.header.wagon_count) : null;
        const existingWagonsCount = data.wagons?.length || 0;

        // Use the is_child_record flag from backend to determine if this is a child record
        // This is more reliable than checking train_id pattern, as child records may not have sequential numbers yet
        const isChildRecord = data.header.is_child_record === true;

        console.log(`[TRAIN_EDIT] URL trainId: ${trainId}, actual train_id from header: ${data.header.train_id}, isChildRecord (from flag): ${isChildRecord}, wagon_count from API: ${wagonCount}, existing wagons: ${existingWagonsCount}, header data:`, data.header);

        if (data.wagons?.length) {
          // Map existing wagons from database
          apiWagons = data.wagons.map((w, i) => {
            const sealNumbers = w.seal_number
              ? w.seal_number.split(",").map(s => s.trim()).filter(Boolean)
              : [""];

            // If seal numbers exist in database, they were confirmed (saved), so mark all as confirmed
            // If only one empty seal number, don't mark it as confirmed
            const confirmedIndices = sealNumbers.length > 0 && sealNumbers[0] !== ""
              ? sealNumbers.map((_, idx) => idx).filter(idx => sealNumbers[idx] && sealNumbers[idx].trim() !== "")
              : [];

            const dbLoadingStatus = Boolean(w.loading_status);

            // DB is source of truth – use it directly
            const wagonToBeLoaded = w.wagon_to_be_loaded != null && w.wagon_to_be_loaded !== ""
              ? Number(w.wagon_to_be_loaded)
              : null;
            const loadedBagCount = Number(w.loaded_bag_count) || 0;
            const conditionMet = wagonToBeLoaded != null && loadedBagCount >= wagonToBeLoaded;

            const towerNum = w.tower_number || (i + 1);

            // If DB says false but condition is met → user explicitly forced it false
            if (!dbLoadingStatus && conditionMet) {
              manuallyFalseSet.add(towerNum);
            }

            // Remove seal_number from the object to avoid conflicts
            const { seal_number: _, ...wagonWithoutSealNumber } = w;

            return {
              ...wagonWithoutSealNumber,
              wagon_type: finalOptions.wagonTypeHL ? "HL" : (w.wagon_type || ""),
              sick_box: w.sick_box ? "Yes" : "No",
              loading_status: dbLoadingStatus, // Always use DB value on load
              tower_number: towerNum,
              seal_numbers: sealNumbers.length > 0 ? sealNumbers : [""],
              confirmed_seal_indices: confirmedIndices, // Restore confirmed seal indices from saved data
              // ✅ FIX: Explicitly preserve multiple indent mode fields from database
              // Ensure customer_id is converted to string for consistency with form inputs
              indent_number: !finalOptions.singleIndent ? (w.indent_number || "") : (w.indent_number || ""),
              wagon_destination: !finalOptions.singleIndent ? (w.wagon_destination || "") : (w.wagon_destination || ""),
              customer_id: !finalOptions.singleIndent ? (w.customer_id != null ? String(w.customer_id) : "") : (w.customer_id != null ? String(w.customer_id) : ""),
            };
          });

          // ✅ FIX: Only add empty wagons for parent records, not for child records
          // For child records, wagon_count already equals the actual wagon count, so don't add empty wagons
          // For parent records, add empty wagons if wagon_count is specified and we have fewer wagons
          if (!isChildRecord && wagonCount !== null && wagonCount > apiWagons.length) {
            console.log(`[TRAIN_EDIT] Parent record: Adding ${wagonCount - apiWagons.length} empty wagons to match wagon_count`);
            const existingTowerNumbers = new Set(apiWagons.map(w => w.tower_number));
            let nextTowerNumber = 1;

            // Find the next available tower_number
            while (existingTowerNumbers.has(nextTowerNumber)) {
              nextTowerNumber++;
            }

            // Add empty wagons until we reach wagon_count
            for (let i = apiWagons.length; i < wagonCount; i++) {
              apiWagons.push({
                wagon_number: "",
                wagon_type: finalOptions.wagonTypeHL ? "HL" : "",
                cc_weight: "",
                sick_box: "",
                wagon_to_be_loaded: "",
                commodity: "",
                tower_number: nextTowerNumber,
                loaded_bag_count: 0,
                unloaded_bag_count: 0,
                loading_start_time: "",
                loading_end_time: "",
                seal_numbers: [""],
                confirmed_seal_indices: [],
                stoppage_time: "",
                remarks: "",
                loading_status: false,
                // Fields for multiple indent mode - use values from header
                indent_number: !finalOptions.singleIndent ? (data.header.indent_number || "") : "",
                wagon_destination: !finalOptions.singleIndent ? (data.header.wagon_destination || "") : "",
                customer_id: !finalOptions.singleIndent ? (data.header.customer_id ? String(data.header.customer_id) : "") : "",
              });
              nextTowerNumber++;
            }
          } else if (isChildRecord) {
            console.log(`[TRAIN_EDIT] Child record: Not adding empty wagons. wagon_count: ${wagonCount}, existing wagons: ${apiWagons.length}`);
          }

          // Seed manually-false set from DB state
          setManuallyToggledFalseWagons(manuallyFalseSet);
        } else {
          // No wagons found - create empty wagons based on wagon_count
          // For child records, wagon_count should be 0 (no wagons), so don't create any empty wagons
          // For parent records, use wagon_count from train_session
          // If wagon_count is available and it's a parent record, create that many empty wagons
          // Otherwise, create just 1 empty wagon (fallback for parent records only)
          let countToCreate = 1; // Default fallback
          if (isChildRecord) {
            // For child records, if no wagons exist, don't create empty wagons
            countToCreate = 0;
            console.log(`[TRAIN_EDIT] Child record with no wagons - not creating empty wagons`);
          } else if (wagonCount !== null && wagonCount > 0) {
            // For parent records, use wagon_count from train_session
            countToCreate = wagonCount;
            console.log(`[TRAIN_EDIT] Parent record with no wagons - creating ${countToCreate} empty wagons based on wagon_count`);
          } else {
            console.log(`[TRAIN_EDIT] Parent record with no wagons and no wagon_count - creating 1 empty wagon (fallback)`);
          }
          const emptyWagons = [];

          for (let i = 1; i <= countToCreate; i++) {
            emptyWagons.push({
              wagon_number: "",
              wagon_type: finalOptions.wagonTypeHL ? "HL" : "",
              cc_weight: "",
              sick_box: "",
              wagon_to_be_loaded: "",
              commodity: "",
              tower_number: i,
              loaded_bag_count: 0,
              unloaded_bag_count: 0,
              loading_start_time: "",
              loading_end_time: "",
              seal_numbers: [""],
              confirmed_seal_indices: [], // Initialize confirmed seal indices
              stoppage_time: "",
              remarks: "",
              loading_status: false,
              // Fields for multiple indent mode - use values from header
              indent_number: !finalOptions.singleIndent ? (data.header.indent_number || "") : "",
              wagon_destination: !finalOptions.singleIndent ? (data.header.wagon_destination || "") : "",
              customer_id: !finalOptions.singleIndent ? (data.header.customer_id ? String(data.header.customer_id) : "") : "",
            });
          }

          apiWagons = emptyWagons;
        }

        // Always use fresh API data (no auto-save/restore)
        setTrainHeader(apiHeader);
        setWagons(apiWagons);

        // Set original state after loading fresh data
        setOriginalState({
          trainHeader: apiHeader,
          wagons: getUserEditableFields(apiWagons),
        });
      } catch (err) {
        console.error("Failed to load train data", err);
      }
    };

    loadTrainData();
  }, [trainId, indentNumber]);

  /* ================= WAGON HANDLERS ================= */
  const addWagon = () => {
    const newWagon = createEmptyWagon(wagons.length + 1);
    // Ensure new wagon has correct indent_number if in multiple indent mode
    if (!editOptions.singleIndent && trainHeader.indent_number) {
      newWagon.indent_number = trainHeader.indent_number;
      newWagon.wagon_destination = trainHeader.wagon_destination || "";
      newWagon.customer_id = trainHeader.customer_id || "";
    }
    setWagons([...wagons, newWagon]);
    setIsSaved(false);
  };

  // NOTE: loading_status=true is now set exclusively by the backend poller
  // (loadingAlertService.js every 10s). The frontend only reads it via the
  // 5-second auto-refresh. This avoids the race condition where the frontend
  // would re-write true over a user's manual false override.

  const updateWagon = (index, field, value) => {
    // Fields that always cascade to rows below
    let cascadeFields = [
      "wagon_type",
      "cc_weight",
      "wagon_to_be_loaded",
      "commodity",
    ];

    // Fields that should be cleared when indent_number changes
    const fieldsToClearOnIndentChange = [
      "wagon_destination",
      "customer_id",
      "cc_weight",
      "wagon_to_be_loaded",
      "commodity",
    ];

    // In single indent mode, wagon_destination cascades from header
    // In multiple indent mode, indent_number, wagon_destination, and customer_id cascade
    if (editOptions.singleIndent) {
      cascadeFields.push("wagon_destination");
    } else {
      // Multiple indent mode: these fields cascade when filled in table
      cascadeFields.push("indent_number");
      cascadeFields.push("wagon_destination");
      cascadeFields.push("customer_id");
    }

    const updated = wagons.map((w, i) => {
      // Helper function to calculate loading status based on bag counts
      const calculateLoadingStatus = (wagon) => {
        const wagonToBeLoadedValue = wagon.wagon_to_be_loaded != null ? String(wagon.wagon_to_be_loaded) : "";
        const wagonToBeLoaded = wagonToBeLoadedValue && wagonToBeLoadedValue.trim() !== ""
          ? Number(wagonToBeLoadedValue)
          : null;
        const loadedBagCount = Number(wagon.loaded_bag_count) || 0;

        // If wagon_to_be_loaded is null (not filled), status must be false (can't compare null)
        if (wagonToBeLoaded == null) {
          return false;
        }

        // Status is true if loaded_bag_count >= wagon_to_be_loaded
        return loadedBagCount >= wagonToBeLoaded;
      };

      // always update current row
      if (i === index) {
        const updatedWagon = { ...w, [field]: value };

        // Special handling: When indent_number changes in the edited row,
        // clear related fields in the edited row itself
        if (field === "indent_number" && w.indent_number !== value && w.indent_number !== "") {
          fieldsToClearOnIndentChange.forEach(clearField => {
            updatedWagon[clearField] = "";
          });
        }

        // ✅ FIX: Auto-update loading_status when wagon_to_be_loaded changes
        if (field === "wagon_to_be_loaded") {
          // Check if the new value is null or empty
          const newValue = value != null ? String(value).trim() : "";
          const isNull = newValue === "";

          if (isNull) {
            // wagon_to_be_loaded cleared – reset status to false and clear manual override
            updatedWagon.loading_status = false;
            setManuallyToggledFalseWagons(prev => {
              const newSet = new Set(prev);
              newSet.delete(w.tower_number);
              return newSet;
            });
          } else {
            // wagon_to_be_loaded set – only update local status if user hasn't manually forced false
            const isManuallyFalse = manuallyToggledFalseWagons.has(w.tower_number);
            if (!isManuallyFalse) {
              const calculatedStatus = calculateLoadingStatus(updatedWagon);
              updatedWagon.loading_status = calculatedStatus;
            }
          }
        }

        return updatedWagon;
      }

      // copy value to rows BELOW (only for cascade fields)
      // IMPORTANT: Only cascade to rows below (i > index), never to rows above
      if (cascadeFields.includes(field) && i > index) {
        const updatedWagon = { ...w };

        // Special handling: When indent_number cascades and changes,
        // clear related fields (wagon_destination, customer_id, cc_weight, 
        // wagon_to_be_loaded, commodity) because they might belong to the old indent_number
        if (field === "indent_number" && w.indent_number !== value && w.indent_number !== "") {
          // Indent number is changing from a non-empty value, clear related fields
          fieldsToClearOnIndentChange.forEach(clearField => {
            updatedWagon[clearField] = "";
          });
        }

        // Update the cascaded field
        updatedWagon[field] = value;

        // ✅ FIX: Auto-update loading_status when wagon_to_be_loaded cascades
        if (field === "wagon_to_be_loaded") {
          // Check if the new value is null or empty
          const newValue = value != null ? String(value).trim() : "";
          const isNull = newValue === "";

          if (isNull) {
            // wagon_to_be_loaded cleared – reset status and clear manual override
            updatedWagon.loading_status = false;
            setManuallyToggledFalseWagons(prev => {
              const newSet = new Set(prev);
              newSet.delete(w.tower_number);
              return newSet;
            });
          } else {
            const isManuallyFalse = manuallyToggledFalseWagons.has(w.tower_number);
            if (!isManuallyFalse) {
              const calculatedStatus = calculateLoadingStatus(updatedWagon);
              updatedWagon.loading_status = calculatedStatus;
            }
          }
        }

        return updatedWagon;
      }

      // For rows above (i < index), return unchanged
      return w;
    });

    setWagons(updated);
    setIsSaved(false);
  };
  const toggleStatus = async (index) => {
    const updated = [...wagons];
    const wagon = updated[index];
    const newStatus = !wagon.loading_status;

    // Calculate if condition is met (loaded_bag_count >= wagon_to_be_loaded)
    const wagonToBeLoadedValue = wagon.wagon_to_be_loaded != null ? String(wagon.wagon_to_be_loaded) : "";
    const wagonToBeLoaded = wagonToBeLoadedValue && wagonToBeLoadedValue.trim() !== ""
      ? Number(wagonToBeLoadedValue)
      : null;
    const loadedBagCount = Number(wagon.loaded_bag_count) || 0;
    const conditionMet = wagonToBeLoaded != null && loadedBagCount >= wagonToBeLoaded;

    // If user is trying to set status to false when condition is met, show warning popup
    if (newStatus === false && conditionMet) {
      setPendingToggleIndex(index);
      setShowToggleWarning(true);
      return;
    }

    // Proceed with toggle – update local state and write to DB immediately
    wagon.loading_status = newStatus;
    setWagons(updated);
    setIsSaved(false);

    if (newStatus === false) {
      // User manually set to false – track so auto-refresh doesn't overwrite it
      setManuallyToggledFalseWagons(prev => {
        const newSet = new Set(prev);
        newSet.add(wagon.tower_number);
        return newSet;
      });
    } else {
      // User manually set to true – clear the false-override flag
      setManuallyToggledFalseWagons(prev => {
        const newSet = new Set(prev);
        newSet.delete(wagon.tower_number);
        return newSet;
      });
    }

    try {
      await fetch(
        `${API_BASE}/wagon/${idToUrlParam(trainId)}/${wagon.tower_number}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loading_status: newStatus }),
        }
      );
    } catch (err) {
      console.error("Failed to toggle wagon status", err);
    }
  };

  // Handle confirmation when user wants to set status to false even though condition is met
  const handleToggleWarningYes = async () => {
    if (pendingToggleIndex === null) {
      setShowToggleWarning(false);
      return;
    }

    const updated = [...wagons];
    const wagon = updated[pendingToggleIndex];

    // Set status to false
    wagon.loading_status = false;
    setWagons(updated);
    setIsSaved(false);

    // Track as manually false so auto-refresh doesn't overwrite it
    setManuallyToggledFalseWagons(prev => {
      const newSet = new Set(prev);
      newSet.add(wagon.tower_number);
      return newSet;
    });

    try {
      await fetch(
        `${API_BASE}/wagon/${idToUrlParam(trainId)}/${wagon.tower_number}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loading_status: false }),
        }
      );
    } catch (err) {
      console.error("Failed to toggle wagon status", err);
    }

    setShowToggleWarning(false);
    setPendingToggleIndex(null);
  };

  const handleToggleWarningNo = () => {
    setShowToggleWarning(false);
    setPendingToggleIndex(null);
  };

  /* ================= SEAL NUMBER HANDLERS ================= */
  const confirmSealNumber = (wagonIndex, sealIndex) => {
    const updated = [...wagons];
    if (!updated[wagonIndex].confirmed_seal_indices) {
      updated[wagonIndex].confirmed_seal_indices = [];
    }
    // Add to confirmed list if not already confirmed
    if (!updated[wagonIndex].confirmed_seal_indices.includes(sealIndex)) {
      updated[wagonIndex].confirmed_seal_indices.push(sealIndex);
    }
    setWagons(updated);
    setIsSaved(false);
  };

  const addSealNumber = (wagonIndex) => {
    const updated = [...wagons];
    const wagon = updated[wagonIndex];

    // Only allow adding new seal number if the last entry is filled
    const lastIndex = wagon.seal_numbers.length - 1;
    const lastSeal = wagon.seal_numbers[lastIndex];

    if (!lastSeal || lastSeal.trim() === "") {
      // Last entry is empty, don't allow adding new one
      return;
    }

    // Auto-confirm the last entry if it has a value and is not already confirmed
    if (lastIndex >= 0 && lastSeal && lastSeal.trim() !== "") {
      if (!wagon.confirmed_seal_indices) {
        wagon.confirmed_seal_indices = [];
      }
      if (!wagon.confirmed_seal_indices.includes(lastIndex)) {
        wagon.confirmed_seal_indices.push(lastIndex);
      }
    }

    // Add new empty seal number
    wagon.seal_numbers.push("");
    setWagons(updated);
    setIsSaved(false);
  };

  const updateSealNumber = (wagonIndex, sealIndex, value) => {
    const updated = [...wagons];
    updated[wagonIndex].seal_numbers[sealIndex] = value;
    setWagons(updated);
    setIsSaved(false);
  };

  const handleSealNumberBlur = (wagonIndex, sealIndex) => {
    const updated = [...wagons];
    const wagon = updated[wagonIndex];
    const sealValue = wagon.seal_numbers[sealIndex];

    // Auto-confirm if this is the last entry and has a value
    if (sealIndex === wagon.seal_numbers.length - 1 && sealValue && sealValue.trim() !== "") {
      if (!wagon.confirmed_seal_indices) {
        wagon.confirmed_seal_indices = [];
      }
      if (!wagon.confirmed_seal_indices.includes(sealIndex)) {
        wagon.confirmed_seal_indices.push(sealIndex);
      }
      setWagons(updated);
      setIsSaved(false);
    }
  };

  const removeSealNumber = (wagonIndex, sealIndex) => {
    const updated = [...wagons];
    const wagon = updated[wagonIndex];
    // If only one seal number exists, clear it instead of removing the row
    if (wagon.seal_numbers.length <= 1) {
      wagon.seal_numbers[0] = "";
      wagon.confirmed_seal_indices = [];
      setWagons(updated);
      setIsSaved(false);
      return;
    }

    wagon.seal_numbers.splice(sealIndex, 1);
    // Remove from confirmed list if it was confirmed, and shift indices after removal
    if (wagon.confirmed_seal_indices) {
      const confirmedIdx = wagon.confirmed_seal_indices.indexOf(sealIndex);
      if (confirmedIdx > -1) {
        wagon.confirmed_seal_indices.splice(confirmedIdx, 1);
      }
      wagon.confirmed_seal_indices = wagon.confirmed_seal_indices.map((idx) =>
        idx > sealIndex ? idx - 1 : idx
      );
    }
    setWagons(updated);
    setIsSaved(false);
  };

  /* ================= DUPLICATE WAGON ================= */
  const duplicateWagon = (index) => {
    const source = wagons[index];

    const duplicated = {
      ...source,

      // reset fields that must be unique
      wagon_number: "",
      wagon_type: editOptions.wagonTypeHL ? "HL" : source.wagon_type,  // Ensure HL if option enabled
      seal_numbers: [""],
      loading_start_time: "",
      loading_end_time: "",
      loaded_bag_count: 0,
      unloaded_bag_count: 0,
      loading_status: false, // Reset loading status for duplicated wagon
    };

    const updated = [...wagons];
    updated.splice(index + 1, 0, duplicated);

    // reassign tower numbers
    const withTower = updated.map((w, i) => ({
      ...w,
      tower_number: i + 1,
    }));

    // Preserve manuallyToggledFalseWagons for wagons that still exist after duplicate
    setManuallyToggledFalseWagons(prev => {
      const newSet = new Set();
    withTower.forEach(w => {
        if (prev.has(w.tower_number)) newSet.add(w.tower_number);
      });
      return newSet;
    });

    setWagons(withTower);
    setIsSaved(false);
  };

  /* ================= DELETE WAGON ================= */
  const deleteWagon = (index) => {
    if (wagons.length === 1) {
      alert("At least one wagon is required");
      return;
    }

    const updated = wagons.filter((_, i) => i !== index);

    const withTower = updated.map((w, i) => ({
      ...w,
      tower_number: i + 1,
    }));

    // Preserve manuallyToggledFalseWagons for wagons that still exist after delete
    setManuallyToggledFalseWagons(prev => {
      const newSet = new Set();
    withTower.forEach(w => {
        if (prev.has(w.tower_number)) newSet.add(w.tower_number);
      });
      return newSet;
    });

    setWagons(withTower);
    setIsSaved(false);
  };

  /* ================= AUTO-REFRESH AUTO-POPULATED FIELDS ================= */
  const refreshAutoPopulatedFields = async () => {
    try {
      // Build URL with indent_number query parameter if provided
      const url = indentNumber
        ? `${API_BASE}/train/${idToUrlParam(trainId)}/edit?indent_number=${encodeURIComponent(indentNumber)}`
        : `${API_BASE}/train/${idToUrlParam(trainId)}/edit`;

      const res = await fetch(url);
      if (!res.ok) {
        console.error("Failed to refresh auto-populated fields");
        return;
      }

      const data = await res.json();

      if (!data.wagons || data.wagons.length === 0) {
        return;
      }

      // Create a map of fresh data by tower_number for quick lookup
      const freshDataMap = new Map();
      data.wagons.forEach(w => {
        const towerNum = w.tower_number || null;
        if (towerNum !== null) {
          freshDataMap.set(towerNum, {
            loaded_bag_count: w.loaded_bag_count || 0,
            unloaded_bag_count: w.unloaded_bag_count || 0,
            loading_start_time: w.loading_start_time || "",
            loading_end_time: w.loading_end_time || "",
            // Pull loading_status from DB as source of truth
            loading_status: Boolean(w.loading_status),
            // ✅ FIX: Preserve multiple indent mode fields from API response
            indent_number: w.indent_number || "",
            wagon_destination: w.wagon_destination || "",
            customer_id: w.customer_id != null ? String(w.customer_id) : "",
          });
        }
      });

      // Update auto-populated fields, preserving all other fields.
      // loading_status is read from DB UNLESS the user has manually toggled it to false
      // (in that case we preserve the manual false until the user saves).
      setWagons(prevWagons => {
        const updated = prevWagons.map(w => {
          const freshData = freshDataMap.get(w.tower_number);
          if (freshData) {
            const updatedWagon = {
              ...w,
              loaded_bag_count: freshData.loaded_bag_count,
              unloaded_bag_count: freshData.unloaded_bag_count,
              loading_start_time: freshData.loading_start_time,
              loading_end_time: freshData.loading_end_time,
            };
            
            // Apply DB loading_status unless user has manually set it to false
            if (!manuallyToggledFalseWagons.has(w.tower_number)) {
              updatedWagon.loading_status = freshData.loading_status;
            }

            // In multiple indent mode, preserve these fields from API response
            if (!editOptions.singleIndent) {
              updatedWagon.indent_number = freshData.indent_number;
              updatedWagon.wagon_destination = freshData.wagon_destination;
              updatedWagon.customer_id = freshData.customer_id;
            }
            
            return updatedWagon;
          }
          // If no matching tower_number found, return wagon unchanged
          return w;
        });
        return updated;
      });
    } catch (err) {
      console.error("Failed to refresh auto-populated fields:", err);
      // Silently fail - don't interrupt user workflow
    }
  };

  // ✅ AUTO-REFRESH: Poll for updates to auto-populated fields every 5 seconds
  useEffect(() => {
    if (!trainId) return;

    // Set up interval to refresh auto-populated fields
    const intervalId = setInterval(() => {
      refreshAutoPopulatedFields();
    }, 5000); // Refresh every 5 seconds

    // Cleanup interval on unmount or when dependencies change
    return () => {
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainId, indentNumber]); // Only restart interval when trainId or indentNumber changes

  /* ================= CHECK FOR CHANGES ================= */
  const hasChanges = () => {
    if (!originalState) return true; // If no original state, assume there are changes

    const currentState = {
      trainHeader,
      wagons: getUserEditableFields(wagons),
    };

    // Compare trainHeader
    const headerChanged = JSON.stringify(currentState.trainHeader) !== JSON.stringify(originalState.trainHeader);

    // Compare wagons (deep comparison)
    const wagonsChanged = JSON.stringify(currentState.wagons) !== JSON.stringify(originalState.wagons);

    // ✅ DEBUG: Log change detection for seal numbers and loading_status
    if (wagonsChanged) {
      console.log(`[CHANGE DETECTION] Wagons changed detected`);
      // Check specifically for seal number changes
      currentState.wagons.forEach((w, i) => {
        const originalSeals = originalState.wagons[i]?.seal_numbers || [];
        const currentSeals = w.seal_numbers || [];
        if (JSON.stringify(originalSeals) !== JSON.stringify(currentSeals)) {
          console.log(`[CHANGE DETECTION] Wagon ${i + 1} (tower ${w.tower_number}) seal numbers changed:`, {
            original: originalSeals,
            current: currentSeals
          });
        }
        // ✅ DEBUG: Check for loading_status changes
        const originalStatus = originalState.wagons[i]?.loading_status || false;
        const currentStatus = w.loading_status || false;
        if (originalStatus !== currentStatus) {
          console.log(`[CHANGE DETECTION] Wagon ${i + 1} (tower ${w.tower_number}) loading_status changed:`, {
            original: originalStatus,
            current: currentStatus
          });
        }
      });
    } else {
      console.log(`[CHANGE DETECTION] No changes detected - wagons are identical`);
    }

    return headerChanged || wagonsChanged;
  };

  /* ================= SAVE DRAFT ================= */
  const saveDraft = async (showPopup = true) => {
    // Check if there are any changes
    const hasChangesValue = hasChanges();

    console.log(`[SAVE DRAFT] Called with showPopup=${showPopup}, hasChangesValue=${hasChangesValue}`);
    console.log(`[SAVE DRAFT] Current wagons count: ${wagons.length}, originalState exists: ${!!originalState}`);

    if (!hasChangesValue) {
      // No changes - if showPopup is true (Save button), show popup and redirect to Dashboard
      // If showPopup is false (Proceed button), just return true without redirect
      console.log(`[SAVE DRAFT] No changes detected - returning early`);
      if (showPopup) {
        setShowDraftPopup(true);
        // Popup will handle redirect to Dashboard when closed
      }
      return true;
    }

    console.log(`[SAVE DRAFT] Changes detected - proceeding with save`);

    try {
      const wagonsWithHeader = wagons.map(w => {
        // ✅ FIX: Exclude auto-populated fields (loading_start_time, loading_end_time, loaded_bag_count, unloaded_bag_count)
        // Also exclude seal_numbers array and seal_number (if it exists) - we'll send seal_number as a string instead
        // These should only be set by the bag counting system, not by frontend edits
        const { loading_start_time, loading_end_time, loaded_bag_count, unloaded_bag_count, seal_numbers, confirmed_seal_indices, seal_number, ...wagonData } = w;

        // ✅ FIX: Convert empty wagon_to_be_loaded to null (not 0)
        // This prevents loading_status from being incorrectly set to true when both are 0
        // Handle both string and number types
        const wagonToBeLoadedValue = w.wagon_to_be_loaded != null ? String(w.wagon_to_be_loaded) : "";
        const wagonToBeLoaded = wagonToBeLoadedValue && wagonToBeLoadedValue.trim() !== ""
          ? Number(wagonToBeLoadedValue)
          : null;

        // Check if user has manually set this wagon to false
        const isManuallyFalse = manuallyToggledFalseWagons.has(w.tower_number);

        // Get loaded_bag_count for condition check
        const loadedBagCount = Number(w.loaded_bag_count) || 0;

        // ✅ CRITICAL FIX: Convert seal_numbers array to seal_number string
        // Always read from w.seal_numbers (the array), not w.seal_number (the string from DB)
        // This ensures we get the current state of seal numbers, including any user edits
        let sealNumberString = "";
        if (w.seal_numbers && Array.isArray(w.seal_numbers)) {
          // Filter out empty values and join with comma and space
          const nonEmptySeals = w.seal_numbers.filter(s => s != null && String(s).trim() !== "");
          sealNumberString = nonEmptySeals.join(", ");
        } else if (w.seal_number && typeof w.seal_number === 'string') {
          // Fallback: if seal_numbers array doesn't exist but seal_number string does, use it
          // This handles edge cases where the array wasn't properly set
          sealNumberString = w.seal_number.trim();
        }

        // ✅ DEBUG: Log seal number conversion for troubleshooting
        if (w.tower_number) {
          console.log(`[FRONTEND SAVE] Wagon tower_number=${w.tower_number}, seal_numbers array:`, w.seal_numbers, `-> seal_number string: "${sealNumberString}"`);
        }

        // ✅ CRITICAL FIX: Ensure seal_number is always included, even if empty
        // Build payload explicitly to avoid any field conflicts
        const wagonPayload = {
          // Core wagon fields
          wagon_number: w.wagon_number || null,
          wagon_type: w.wagon_type || null,
          cc_weight: w.cc_weight || null,
          sick_box: w.sick_box || null,
          tower_number: w.tower_number,
          // ❌ REMOVED: loaded_bag_count and unloaded_bag_count - these are auto-populated by bag counting system
          stoppage_time: w.stoppage_time || null,
          remarks: w.remarks || null,
          // In single indent mode, use trainHeader values
          // In multiple indent mode, use wagon-level values
          wagon_destination: editOptions.singleIndent
            ? trainHeader.wagon_destination
            : (w.wagon_destination || ""),
          indent_number: editOptions.singleIndent
            ? trainHeader.indent_number
            : (w.indent_number || ""),
          customer_id: editOptions.singleIndent
            ? (trainHeader.customer_id ? Number(trainHeader.customer_id) : null)
            : (w.customer_id ? Number(w.customer_id) : null),
          commodity: w.commodity || null,
          // ✅ CRITICAL: Always include seal_number, even if empty (send null if no seal numbers)
          // Use empty string if sealNumberString is empty, but convert to null for database
          seal_number: sealNumberString && sealNumberString.trim() !== "" ? sealNumberString.trim() : null,
          // ✅ FIX: Use null instead of 0 for empty wagon_to_be_loaded
          wagon_to_be_loaded: wagonToBeLoaded,
        };

        // Always send loading_status_manual_override so the backend INSERT preserves it.
        // When the user has manually set false: loading_status=false, manual_override=true
        // Otherwise: don't override loading_status (backend preserves existing value),
        //            and manual_override=false (allow poller to auto-set true).
        if (isManuallyFalse) {
          wagonPayload.loading_status = false;
          wagonPayload.loading_status_manual_override = true;
          console.log(`[FRONTEND SAVE] Including loading_status=false, manual_override=true for wagon tower_number=${w.tower_number}`);
        } else {
          wagonPayload.loading_status_manual_override = false;
        }

        return wagonPayload;
      });

      // ✅ FIX: Pass indent_number as query parameter if it exists
      // This tells the backend we are saving a specific child record (not consolidating into parent)
      const saveUrl = indentNumber
        ? `${API_BASE}/train/${idToUrlParam(trainId)}/draft?indent_number=${encodeURIComponent(indentNumber)}`
        : `${API_BASE}/train/${idToUrlParam(trainId)}/draft`;

      const res = await fetch(saveUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": "ADMIN",
        },
        body: JSON.stringify({
          header: {
            ...trainHeader,
            // ✅ FIX: Always preserve header.customer_id if present, even in multiple indent mode (child nodes)
            // For parent multiple-indent records this will usually be empty; for child records it will be set
            customer_id: trainHeader.customer_id
              ? Number(trainHeader.customer_id)
              : null,
            siding: trainHeader.siding, // ✅ Include siding in payload
          },
          wagons: wagonsWithHeader,
          editOptions: {
            singleIndent: editOptions.singleIndent,
            wagonTypeHL: editOptions.wagonTypeHL,
          },
        }),
      });

      if (!res.ok) {
        try {
          const errorData = await res.json();
          const errorMessage = errorData.message || errorData.error || `Save failed with status ${res.status}`;
          console.error("Save draft failed:", errorMessage);
          alert(`Failed to save draft: ${errorMessage}`);
        } catch (parseError) {
          console.error("Save draft failed:", res.status, res.statusText);
          alert(`Failed to save draft: ${res.status} ${res.statusText}`);
        }
        return false;
      }

      const responseData = await res.json();

      setIsSaved(true);

      // Update original state after successful save
      setOriginalState({
        trainHeader,
        wagons: getUserEditableFields(wagons),
      });

      // ✅ FIX: Save button should ONLY save data, NOT trigger splitting
      // Do NOT handle trainIdChanged or splitting logic here
      // Splitting will only happen when Proceed button is clicked
      // Ignore any trainIdChanged response from backend during Save
      // (Backend should not be doing splitting on save, but if it does, we ignore it)

      if (showPopup) {
        setShowDraftPopup(true);
      }

      return true;
    } catch (err) {
      console.error("Save draft failed", err);
      const errorMessage = err.message || "An unexpected error occurred while saving";
      alert(`Failed to save draft: ${errorMessage}`);
      return false;
    }
  };



  /* ================= DOWNLOAD EXCEL TEMPLATE ================= */
  const downloadExcelTemplate = async () => {
    try {
      // Choose template based on single / multiple indent mode
      const templatePath = editOptions.singleIndent
        ? "/single_indent.xlsx"
        : "/mulitple_indent.xlsx";
      const downloadName = editOptions.singleIndent
        ? "single_indent.xlsx"
        : "mulitple_indent.xlsx";

      // Fetch template file
      const response = await fetch(templatePath);
      if (!response.ok) {
        throw new Error("Failed to fetch template file");
      }

      const arrayBuffer = await response.arrayBuffer();

      // Read workbook
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      // Fetch customers from backend
      const role = localStorage.getItem("role") || "";
      const username = localStorage.getItem("username") || "";
      const customersResponse = await fetch(`${API_BASE}/customers`, {
        headers: {
          "x-user-role": role,
          "x-username": username,
        },
      });

      if (customersResponse.ok) {
        const customers = await customersResponse.json();

        // Prepare Customers_Master sheet data
        const customersData = [
          ["Customer Name", "Customer ID"], // Header row
          ...customers.map(c => [c.customer_name, c.id]) // Data rows
        ];

        // Create worksheet from data
        const customersSheet = XLSX.utils.aoa_to_sheet(customersData);

        // Remove existing Customers_Master sheet if it exists
        if (workbook.SheetNames.includes("Customers_Master")) {
          delete workbook.Sheets["Customers_Master"];
          const index = workbook.SheetNames.indexOf("Customers_Master");
          workbook.SheetNames.splice(index, 1);
        }

        // Add Customers_Master sheet
        workbook.SheetNames.push("Customers_Master");
        workbook.Sheets["Customers_Master"] = customersSheet;
      }

      // Convert workbook to blob and download
      const excelBlob = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const blob = new Blob([excelBlob], {
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
      alert("Failed to download template file. Please try again.");
    }
  };

  /* ================= VALIDATION ================= */
  const isFormValid = () => {
    // Check header fields (for multiple indent mode)
    if (!editOptions.singleIndent) {
      if (!trainHeader.indent_number || trainHeader.indent_number.trim() === "") {
        return false;
      }
      if (!trainHeader.customer_id || trainHeader.customer_id.trim() === "") {
        return false;
      }
      if (!trainHeader.wagon_destination || trainHeader.wagon_destination.trim() === "") {
        return false;
      }
    }

    // Check header fields (for single indent mode)
    if (editOptions.singleIndent) {
      if (!trainHeader.indent_number || trainHeader.indent_number.trim() === "") {
        return false;
      }
      if (!trainHeader.wagon_destination || trainHeader.wagon_destination.trim() === "") {
        return false;
      }
      if (role === "ADMIN" && (!trainHeader.customer_id || trainHeader.customer_id.trim() === "")) {
        return false;
      }
    }

    // Check all wagons - all fields must be filled except remarks
    if (wagons.length === 0) {
      return false;
    }

    for (const w of wagons) {
      // Check required wagon fields (remarks is optional)
      // Convert all values to string for consistent checking
      const wagonNumber = w.wagon_number != null ? String(w.wagon_number).trim() : "";
      if (wagonNumber === "") return false;

      const wagonType = w.wagon_type != null ? String(w.wagon_type).trim() : "";
      if (wagonType === "") return false;

      // cc_weight: must be a valid number > 0
      const ccWeightStr = w.cc_weight != null ? String(w.cc_weight).trim() : "";
      if (ccWeightStr === "" || ccWeightStr === "0" || isNaN(Number(ccWeightStr))) return false;

      const commodity = w.commodity != null ? String(w.commodity).trim() : "";
      if (commodity === "") return false;

      // Seal numbers: at least one non-empty seal number required
      if (!w.seal_numbers || !Array.isArray(w.seal_numbers) || w.seal_numbers.length === 0 ||
        !w.seal_numbers.some(s => s != null && String(s).trim() !== "")) return false;

      // Stoppage time is now required
      const stoppageTime = w.stoppage_time != null ? String(w.stoppage_time).trim() : "";
      if (stoppageTime === "") return false;

      // Loading Start Date & Time is required (even though auto-populated)
      const loadingStartTime = w.loading_start_time != null ? String(w.loading_start_time).trim() : "";
      if (loadingStartTime === "" || loadingStartTime === "-") return false;

      // Loading End Date & Time is required (even though auto-populated)
      const loadingEndTime = w.loading_end_time != null ? String(w.loading_end_time).trim() : "";
      if (loadingEndTime === "" || loadingEndTime === "-") return false;

      // For multiple indent mode, check wagon-level fields
      if (!editOptions.singleIndent) {
        const indentNumber = w.indent_number != null ? String(w.indent_number).trim() : "";
        if (indentNumber === "") return false;

        const wagonDestination = w.wagon_destination != null ? String(w.wagon_destination).trim() : "";
        if (wagonDestination === "") return false;

        const customerId = w.customer_id != null ? String(w.customer_id).trim() : "";
        if (customerId === "") return false;
      }
    }

    return true;
  };

  /* ================= HELPER: Build Dispatch URL with wagon_details_complete flag ================= */
  const buildDispatchUrl = (trainId, indentNum, isWagonDetailsComplete) => {
    const params = new URLSearchParams();
    if (indentNum) {
      params.append("indent_number", indentNum);
    }
    params.append("wagon_details_complete", isWagonDetailsComplete ? "true" : "false");
    return `/train/${idToUrlParam(trainId)}/dispatch?${params.toString()}`;
  };

  /* ================= PROCEED ================= */
  const proceed = async () => {
    // ✅ Check if multiple indent mode requires at least 2 indent numbers
    // Skip this validation for child records (when indentNumber is present in URL)
    if (!editOptions.singleIndent && !indentNumber) {
      const indentNumbers = [...new Set(wagons.map(w => w.indent_number).filter(Boolean))];
      if (indentNumbers.length < 2) {
        setWarning({ open: true, message: "At least two indent numbers required for multiple indent mode. Please fill at least two different indent numbers in wagons.", title: "Warning" });
        return;
      }
    }

    // ✅ Check if form is valid to pass flag to DispatchPage
    const isWagonDetailsComplete = isFormValid();

    // ✅ FIX: Use the same save logic as Save button, but without showing popup
    // This ensures all the same validation and error handling
    const saveSuccess = await saveDraft(false);
    if (!saveSuccess) {
      // Save failed - show error and don't proceed to next page
      setWarning({ open: true, message: "Failed to save changes. Please fix any errors and try again.", title: "Error" });
      return;
    }

    // ✅ FIX: Add longer delay to ensure backend save completes and database is fully updated
    // This ensures loading times are preserved in the database before DispatchPage loads
    // Increased to 1000ms to give backend enough time to process DELETE, INSERT, and UPDATE operations
    // The backend needs time to:
    // 1. Preserve existing loading times from wagon_records
    // 2. Delete old wagon records
    // 3. Insert new wagon records with preserved loading times
    // 4. Update dispatch_records with calculated loading times
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ✅ FIX: Get the current trainId from URL (may have been updated by saveDraft)
    // After saveDraft, the URL might have been updated if train_id changed
    const currentUrl = window.location.pathname;
    const urlMatch = currentUrl.match(/\/train\/([^/]+)\/edit/);
    const currentTrainId = urlMatch ? urlParamToId(urlMatch[1]) : trainId;

    // ✅ FIX: Show popup in multiple indent mode when clicking Proceed, but skip for child nodes
    // Child nodes are identified by the presence of indentNumber in the URL
    // This ensures user can choose whether to split rake serial numbers or not (only for parent nodes)
    if (!editOptions.singleIndent && !indentNumber) {
      // Only show the popup for parent nodes (when indentNumber is not in URL)
      console.log("Multiple indent mode detected - showing popup to ask about multiple rake serial numbers");
      setShowMultipleRakePopup(true);
      return;
    }

    // For child nodes (indentNumber present), skip popup and proceed directly
    if (!editOptions.singleIndent && indentNumber) {
      console.log("Child node detected - skipping popup and proceeding directly");
      const dispatchUrl = buildDispatchUrl(currentTrainId, indentNumber, isWagonDetailsComplete);
      navigate(dispatchUrl);
      return;
    }

    // Single indent mode - proceed normally without splitting
    // For single indent, no splitting is needed - just navigate to dispatch
    const dispatchUrl = buildDispatchUrl(currentTrainId, indentNumber, isWagonDetailsComplete);
    navigate(dispatchUrl);
  };

  /* ================= HANDLE MULTIPLE RAKE SERIAL RESPONSES ================= */
  const handleMultipleRakeYes = async () => {
    setShowMultipleRakePopup(false);

    try {
      // Get distinct indent numbers from wagons
      const indentNumbers = [...new Set(wagons.map(w => w.indent_number).filter(Boolean))];

      if (indentNumbers.length === 0) {
        setWarning({ open: true, message: "No indent numbers found. Please fill indent numbers in wagons.", title: "Warning" });
        return;
      }

      // Call backend to set flag for sequential serial numbers (they will be assigned when counting starts)
      const res = await fetch(`${API_BASE}/train/${idToUrlParam(trainId)}/generate-multiple-rake-serial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": "ADMIN",
        },
        body: JSON.stringify({
          indentNumbers: indentNumbers,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Failed to set up sequential serial numbers: ${error.message || "Unknown error"}`);
        return;
      }

      // ✅ FIX: Update local state to reflect that question has been answered
      setSerialQuestionAnswered(true);
      setHasSequentialSerials(true);

      // Sequential numbers will be assigned automatically when bag counting starts
      // For now, navigate to dispatch page with current train_id
      // If counting has already started, the train_id will be updated automatically
      // Check if form is valid to pass flag to DispatchPage
      const isWagonDetailsComplete = isFormValid();
      const dispatchUrl = buildDispatchUrl(trainId, indentNumber, isWagonDetailsComplete);
      navigate(dispatchUrl);
    } catch (err) {
      console.error("Error setting up sequential serial numbers:", err);
      alert("Failed to set up sequential serial numbers. Please try again.");
    }
  };

  const handleMultipleRakeNo = async () => {
    setShowMultipleRakePopup(false);

    try {
      // Mark that the serial number question has been answered (even though "No" was selected)
      await fetch(`${API_BASE}/train/${idToUrlParam(trainId)}/mark-serial-handled`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": "ADMIN",
        },
      });

      // ✅ FIX: Update local state to reflect that question has been answered
      setSerialQuestionAnswered(true);
      setHasSequentialSerials(false);
    } catch (err) {
      console.error("Error marking serial handled:", err);
      // Continue anyway - don't block user flow
    }

    // Use same rake serial number - proceed normally
    // Pass indent_number and wagon_details_complete flag
    const isWagonDetailsComplete = isFormValid();
    const dispatchUrl = buildDispatchUrl(trainId, indentNumber, isWagonDetailsComplete);
    navigate(dispatchUrl);
  };

  return (
    <AppShell>
      <div style={{ backgroundColor: "#FFFFFF", minHeight: "100vh", padding: "0" }}>

        {/* ================= HEADER CARD ================= */}
        <div style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "6px",
          padding: "20px",
          margin: "20px 20px 20px",
        }}>
          {/* Download Template & Upload Excel above header (near customer name) */}
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
              id="wagon-excel-upload"
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                try {
                  const data = await file.arrayBuffer();
                  const workbook = XLSX.read(data, { type: "array" });
                  const sheetName = workbook.SheetNames[0];
                  const worksheet = workbook.Sheets[sheetName];

                  // Read as 2D array so we can treat top card and table separately
                  const matrix = XLSX.utils.sheet_to_json(worksheet, {
                    header: 1,
                    defval: "",
                  });

                  if (!matrix.length) {
                    alert("Uploaded file is empty.");
                    return;
                  }

                  const toStr = (v) =>
                    v === undefined || v === null ? "" : String(v);

                  // Normalize function for Excel headers (case-insensitive, handles spaces/underscores/hyphens)
                  const normalizeKey = (str) => {
                    return String(str || "").trim().toLowerCase().replace(/[_\s-]/g, "");
                  };

                  // Helper to check if a row contains a specific normalized key
                  const rowHasKey = (row, key) => {
                    return row.some((cell) => normalizeKey(cell) === normalizeKey(key));
                  };

                  // ===== DETECT FORMAT: Single Indent vs Multiple Indent =====
                  // Single indent: Row 0 has card headers (indent_number, wagon_destination, customer_id) but NOT wagon_number
                  // Multiple indent: Row 0 or 1 has both indent_number AND wagon_number in same row
                  const row0 = matrix[0] || [];
                  const row1 = matrix[1] || [];

                  const hasCardFormat = rowHasKey(row0, "indent_number") &&
                    rowHasKey(row0, "wagon_destination") &&
                    !rowHasKey(row0, "wagon_number");

                  const hasTableFormat = (rowHasKey(row0, "wagon_number") && rowHasKey(row0, "indent_number")) ||
                    (rowHasKey(row1, "wagon_number") && rowHasKey(row1, "indent_number"));

                  let wagonHeaderRowIndex = -1;
                  let wagonHeaderRow = [];
                  let wagonIndex = {};

                  if (hasCardFormat) {
                    // ===== SINGLE INDENT FORMAT =====
                    // Row 0: Card headers (indent_number, wagon_destination, customer_id, customer_name)
                    // Row 1: Card values
                    // Rows 2-3: Empty separator rows
                    // Row 4+: Wagon table headers and data

                    const cardHeaderRow = row0;
                    const cardValueRow = row1;

                    const cardIndex = {};
                    cardHeaderRow.forEach((name, idx) => {
                      if (name && typeof name === "string") {
                        const normalized = normalizeKey(name);
                        if (normalized) {
                          cardIndex[normalized] = idx;
                        }
                      }
                    });

                    setTrainHeader((prev) => {
                      const getCardVal = (key) => {
                        const normalizedKey = normalizeKey(key);
                        const idx = cardIndex[normalizedKey];
                        if (idx === undefined) return prev[key];
                        const raw = cardValueRow[idx];
                        if (raw === "" || raw === null || raw === undefined) return prev[key];
                        return toStr(raw);
                      };

                      return {
                        ...prev,
                        indent_number: getCardVal("indent_number"),
                        wagon_destination: getCardVal("wagon_destination"),
                        customer_id: getCardVal("customer_id"),
                      };
                    });

                    // Find wagon table header row (skip rows 0-1, look for row with "wagon_number")
                    wagonHeaderRowIndex = matrix.findIndex((row, idx) => {
                      if (idx <= 1) return false; // Skip card rows
                      return rowHasKey(row, "wagon_number");
                    });

                  } else if (hasTableFormat) {
                    // ===== MULTIPLE INDENT FORMAT =====
                    // Row 0 or 1: All headers in one row (indent_number, wagon_destination, customer_id, customer_name, wagon_number, etc.)
                    // Row 1 or 2+: Data rows

                    // Determine which row has the headers
                    if (rowHasKey(row0, "wagon_number")) {
                      wagonHeaderRowIndex = 0;
                    } else if (rowHasKey(row1, "wagon_number")) {
                      wagonHeaderRowIndex = 1;
                    } else {
                      alert(
                        'Could not find wagon table header row. ' +
                        'Make sure there is a row with "wagon_number", "wagon_type", etc.'
                      );
                      e.target.value = "";
                      return;
                    }

                    // For multiple indent, don't set trainHeader (each wagon has its own indent_number)
                    // trainHeader will remain as is, and each wagon will have its own indent_number, wagon_destination, customer_id

                  } else {
                    // Unknown format - try to find any row with "wagon_number"
                    wagonHeaderRowIndex = matrix.findIndex((row) => rowHasKey(row, "wagon_number"));

                    if (wagonHeaderRowIndex === -1) {
                      alert(
                        'Could not detect Excel format. ' +
                        'Expected either:\n' +
                        '1. Single indent: Card headers (row 1) + Wagon table (row 5+)\n' +
                        '2. Multiple indent: All headers in one row (row 2) + Data rows'
                      );
                      e.target.value = "";
                      return;
                    }
                  }

                  if (wagonHeaderRowIndex === -1) {
                    alert(
                      'Could not find wagon table header row. ' +
                      'Make sure there is a row with "wagon_number", "wagon_type", etc.'
                    );
                    e.target.value = "";
                    return;
                  }

                  wagonHeaderRow = matrix[wagonHeaderRowIndex];
                  wagonHeaderRow.forEach((name, idx) => {
                    if (name && typeof name === "string") {
                      const normalized = normalizeKey(name);
                      if (normalized) {
                        wagonIndex[normalized] = idx;
                      }
                    }
                  });

                  const getWagonVal = (rowArr, key) => {
                    const normalizedKey = normalizeKey(key);
                    const idx = wagonIndex[normalizedKey];
                    if (idx === undefined) return "";
                    return toStr(rowArr[idx]);
                  };

                  // ===== BUILD WAGON OBJECTS FROM ROWS AFTER WAGON HEADER =====
                  const newWagons = [];
                  for (let r = wagonHeaderRowIndex + 1; r < matrix.length; r++) {
                    const rowArr = matrix[r];
                    // Skip completely empty rows
                    const hasAny = rowArr.some(
                      (v) => v !== "" && v !== null && v !== undefined
                    );
                    if (!hasAny) continue;

                    const base = createEmptyWagon(newWagons.length + 1);

                    const wagon_number = getWagonVal(rowArr, "wagon_number");
                    const wagon_type = getWagonVal(rowArr, "wagon_type");
                    const cc_weight = getWagonVal(rowArr, "cc_weight");
                    const sick_box = getWagonVal(rowArr, "sick_box");
                    const wagon_to_be_loaded = getWagonVal(rowArr, "wagon_to_be_loaded");
                    const commodity = getWagonVal(rowArr, "commodity");

                    // Optional per-row indent fields for multiple-indent mode
                    const indent_number = getWagonVal(rowArr, "indent_number");
                    const wagon_destination = getWagonVal(rowArr, "wagon_destination");
                    const customer_id = getWagonVal(rowArr, "customer_id");

                    newWagons.push({
                      ...base,
                      wagon_number: wagon_number || base.wagon_number,
                      wagon_type: wagon_type || base.wagon_type,
                      cc_weight: cc_weight || base.cc_weight,
                      sick_box: sick_box || base.sick_box,
                      wagon_to_be_loaded: wagon_to_be_loaded || base.wagon_to_be_loaded,
                      commodity: commodity || base.commodity,

                      indent_number:
                        !editOptions.singleIndent && indent_number
                          ? indent_number
                          : base.indent_number,
                      wagon_destination:
                        !editOptions.singleIndent && wagon_destination
                          ? wagon_destination
                          : base.wagon_destination,
                      customer_id:
                        !editOptions.singleIndent && customer_id
                          ? customer_id
                          : base.customer_id,
                    });
                  }

                  if (!newWagons.length) {
                    alert("No wagon rows found under the wagon header.");
                    e.target.value = "";
                    return;
                  }

                  setWagons(newWagons);
                  setIsSaved(false);
                } catch (err) {
                  console.error("Failed to import Excel", err);
                  alert("Failed to read Excel file. Please check the format and try again.");
                } finally {
                  // Reset input so same file can be uploaded again if needed
                  e.target.value = "";
                }
              }}
            />
            <label
              htmlFor="wagon-excel-upload"
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

          <div style={topGridStyles.container}>
            {/* Show these fields only in single indent mode */}
            {editOptions.singleIndent && (
              <>
                <FloatingField
                  label="Rake Serial Number"
                  value={trainId}
                  readOnly
                />

                <BoxedField
                  label="Indent Number"
                  value={trainHeader.indent_number}
                  onChange={(v) =>
                    setTrainHeader({ ...trainHeader, indent_number: v })
                  }
                />

                <BoxedField
                  label="Wagon Destination"
                  value={trainHeader.wagon_destination}
                  onChange={(v) =>
                    setTrainHeader({ ...trainHeader, wagon_destination: v })
                  }
                />

                {role === "ADMIN" && (
                  <BoxedField
                    label="Party / Customer's Name"
                    value={trainHeader.customer_id}
                    onChange={(v) =>
                      setTrainHeader({ ...trainHeader, customer_id: v })
                    }
                    isSelect
                  >
                    <option value="">Select Customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.customer_name}
                      </option>
                    ))}
                  </BoxedField>
                )}
              </>
            )}
          </div>
        </div>


        {/* ================= WAGON TABLE ================= */}
        <div style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "6px",
          padding: "20px",
          margin: "0 20px 20px",
        }}>

          <div
            className="wagon-table-scrollable"
            style={{
              overflowX: "auto",
              overflowY: "auto",
              maxHeight: "calc(100vh - 450px)",
              minHeight: "400px",
              border: "1px solid #e0e0e0",
              borderRadius: "4px",
            }}
          >
            <table style={wagonTableStyles.container}>
              <thead>
                <tr>
                  {/* Conditional columns for multiple indent mode */}
                  {!editOptions.singleIndent && (
                    <>
                      <th style={wagonTableStyles.header}>Indent Number</th>
                      <th style={wagonTableStyles.header}>Wagon Destination</th>
                      {role === "ADMIN" && <th style={wagonTableStyles.header}>Party / Customer's Name</th>}
                    </>
                  )}
                  {/* Standard columns */}
                  {[
                    "Wagon Number",
                    "Wagon Type",
                    "CC Weight (Tons)",
                    "Sick Box",
                    "Bags To Be Loaded",
                    "Commodity",
                    "Tower Number",
                    "Loaded Bag Count",
                    "Unloaded Bag Count",
                    "Loading Start Date & Time",
                    "Loading End Date & Time",
                    "Seal Number",
                    "Stoppage / Downtime",
                    "Remarks",
                    "Loading Completed",
                  ].map((h) => (
                    <th key={h} style={wagonTableStyles.header}>{h}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {wagons.map((w, i) => (
                  <tr key={i} style={wagonTableStyles.row(i)}>
                    {/* Conditional columns for multiple indent mode */}
                    {!editOptions.singleIndent && (
                      <>
                        <td style={wagonTableStyles.cell}>
                          <input
                            value={w.indent_number || ""}
                            onChange={(e) =>
                              updateWagon(i, "indent_number", e.target.value)
                            }
                            style={wagonTableStyles.input}
                          />
                        </td>
                        <td style={wagonTableStyles.cell}>
                          <input
                            value={w.wagon_destination || ""}
                            onChange={(e) =>
                              updateWagon(i, "wagon_destination", e.target.value)
                            }
                            style={wagonTableStyles.input}
                          />
                        </td>
                        {role === "ADMIN" && (
                          <td style={wagonTableStyles.cell}>
                            <select
                              value={w.customer_id || ""}
                              onChange={(e) =>
                                updateWagon(i, "customer_id", e.target.value)
                              }
                              style={wagonTableStyles.select}
                            >
                              <option value="">Select Customer</option>
                              {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.customer_name}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                      </>
                    )}

                    <td style={wagonTableStyles.cell}>
                      <input
                        value={w.wagon_number}
                        onChange={(e) =>
                          updateWagon(i, "wagon_number", e.target.value)
                        }
                        style={wagonTableStyles.input}
                      />
                    </td>

                    <td style={wagonTableStyles.cell}>
                      <select
                        value={w.wagon_type}
                        onChange={(e) =>
                          updateWagon(i, "wagon_type", e.target.value)
                        }
                        style={wagonTableStyles.select}
                      >
                        <option value="">Select</option>
                        {wagonTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={wagonTableStyles.cell}>
                      <input
                        value={w.cc_weight}
                        onChange={(e) =>
                          updateWagon(i, "cc_weight", e.target.value)
                        }
                        style={wagonTableStyles.input}
                      />
                    </td>

                    <td style={wagonTableStyles.cell}>
                      <select
                        value={w.sick_box}
                        onChange={(e) =>
                          updateWagon(i, "sick_box", e.target.value)
                        }
                        style={wagonTableStyles.select}
                      >
                        <option value="">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </td>

                    <td style={wagonTableStyles.cell}>
                      <input
                        value={w.wagon_to_be_loaded}
                        onChange={(e) =>
                          updateWagon(i, "wagon_to_be_loaded", e.target.value)
                        }
                        style={wagonTableStyles.input}
                      />
                    </td>

                    <td style={wagonTableStyles.cell}>
                      <select
                        value={w.commodity}
                        onChange={(e) =>
                          updateWagon(i, "commodity", e.target.value)
                        }
                        style={wagonTableStyles.select}
                      >
                        <option value="">Select</option>
                        {commodities.map((commodity) => (
                          <option key={commodity} value={commodity}>
                            {commodity}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={wagonTableStyles.readOnlyCell}>{w.tower_number}</td>
                    <td style={wagonTableStyles.readOnlyCell}>{w.loaded_bag_count}</td>
                    <td style={wagonTableStyles.readOnlyCell}>{w.unloaded_bag_count}</td>
                    <td style={wagonTableStyles.readOnlyCell}>{formatDateTime(w.loading_start_time)}</td>
                    <td style={wagonTableStyles.readOnlyCell}>{formatDateTime(w.loading_end_time)}</td>

                    <td style={{ ...wagonTableStyles.cell, padding: "8px", position: "relative" }}>
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        paddingBottom: "28px"
                      }}>
                        {w.seal_numbers.map((seal, sealIdx) => {
                          const isConfirmed = w.confirmed_seal_indices && w.confirmed_seal_indices.includes(sealIdx);
                          const isLastEntry = sealIdx === w.seal_numbers.length - 1;

                          return (
                            <div key={sealIdx} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                              <input
                                value={seal}
                                onChange={(e) => updateSealNumber(i, sealIdx, e.target.value)}
                                onBlur={() => handleSealNumberBlur(i, sealIdx)}
                                style={{
                                  ...wagonTableStyles.input,
                                  padding: "6px",
                                  flex: 1,
                                  backgroundColor: isConfirmed ? "#d4edda" : "transparent",
                                }}
                              />
                              {/* Remove/Clear seal number:
                                - If only ONE row: show × only when it has a value (so it doesn't show on empty)
                                - If MULTIPLE rows: always show × so user can remove extra rows (even if empty) */}
                              {(w.seal_numbers.length > 1 || (seal && seal.trim() !== "")) && (
                                <button
                                  onClick={() => removeSealNumber(i, sealIdx)}
                                  style={{
                                    background: "#dc2626",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                    fontSize: "10px",
                                    padding: "3px 6px",
                                    fontWeight: "bold",
                                    minWidth: "20px",
                                    height: "20px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                  title={w.seal_numbers.length <= 1 ? "Clear Seal Number" : "Remove Seal Number"}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{
                        position: "absolute",
                        bottom: "6px",
                        right: "6px",
                        display: "flex",
                        gap: "4px",
                      }}>
                        {(() => {
                          const lastIdx = w.seal_numbers.length - 1;
                          const lastSeal = lastIdx >= 0 ? w.seal_numbers[lastIdx] : "";
                          const lastHasValue = Boolean(lastSeal && lastSeal.trim() !== "");
                          const lastConfirmed =
                            Boolean(w.confirmed_seal_indices && w.confirmed_seal_indices.includes(lastIdx));

                          const plusDisabled = !lastHasValue;

                          return (
                            <>
                              {/* Tick button - disappears after confirm; plus always remains */}
                              {lastHasValue && !lastConfirmed && (
                                <button
                                  onClick={() => confirmSealNumber(i, lastIdx)}
                                  style={{
                                    background: "#9E9E9E",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                    fontSize: "10px",
                                    padding: "3px 6px",
                                    fontWeight: "bold",
                                    minWidth: "20px",
                                    height: "20px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                  title="Confirm Last Entry"
                                >
                                  ✓
                                </button>
                              )}

                              {/* Plus button - always visible, but only enabled if last entry is filled */}
                              <button
                                onClick={() => addSealNumber(i)}
                                disabled={plusDisabled}
                                style={{
                                  background: plusDisabled ? "#9E9E9E" : "#2563eb",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "2px",
                                  cursor: plusDisabled ? "not-allowed" : "pointer",
                                  fontSize: "10px",
                                  padding: "3px 6px",
                                  fontWeight: "bold",
                                  minWidth: "20px",
                                  height: "20px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  opacity: plusDisabled ? 0.5 : 1,
                                }}
                                title={plusDisabled ? "Fill current entry first" : "Add Seal Number"}
                              >
                                +
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </td>

                    <td style={wagonTableStyles.cell}>
                      <input
                        value={w.stoppage_time || ""}
                        onChange={(e) =>
                          updateWagon(i, "stoppage_time", e.target.value)
                        }
                        style={wagonTableStyles.input}
                        placeholder="-"
                      />
                    </td>

                    <td style={wagonTableStyles.cell}>
                      <input
                        value={w.remarks}
                        onChange={(e) =>
                          updateWagon(i, "remarks", e.target.value)
                        }
                        style={wagonTableStyles.input}
                      />
                    </td>

                    {/* TOGGLE */}
                    <td style={{ ...wagonTableStyles.cell, padding: "16px 8px" }}>
                      <div
                        onClick={() => toggleStatus(i)}
                        style={{
                          width: "46px",
                          height: "24px",
                          backgroundColor: w.loading_status ? "#4CAF50" : "#ccc",
                          borderRadius: "24px",
                          position: "relative",
                          cursor: "pointer",
                          transition: "background-color 0.25s ease",
                          margin: "0 auto",
                        }}
                      >
                        <div
                          style={{
                            width: "20px",
                            height: "20px",
                            backgroundColor: "#fff",
                            borderRadius: "50%",
                            position: "absolute",
                            top: "2px",
                            left: w.loading_status ? "24px" : "2px",
                            transition: "left 0.25s ease",
                            boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
                          }}
                        />
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "15px" }}>
            <button
              style={getButtonStyle("add")}
              onClick={addWagon}
            >
              Add Wagon
            </button>
          </div>
        </div>

        {/* ================= FOOTER ================= */}
        <div style={{
          ...buttonGroupStyles.container,
          margin: "30px 20px 20px",
          justifyContent: "flex-end"
        }}>
          <button
            style={getButtonStyle("cancel")}
            onClick={() => navigate("/dashboard")}
          >
            Cancel
          </button>

          <button style={getButtonStyle("save")} onClick={saveDraft}>
            Save
          </button>

          <button
            style={getButtonStyle("proceed")}
            onClick={proceed}
          >
            Proceed
          </button>
        </div>

        <DraftSavePopup
          open={showDraftPopup}
          onClose={() => {
            setShowDraftPopup(false);
            navigate("/dashboard");
          }}
        />
        <MultipleRakeSerialPopup
          open={showMultipleRakePopup}
          onClose={() => setShowMultipleRakePopup(false)}
          onYes={handleMultipleRakeYes}
          onNo={handleMultipleRakeNo}
        />
        <WarningPopup
          open={warning.open}
          onClose={() => setWarning({ open: false, message: "", title: "Warning" })}
          message={warning.message}
          title={warning.title}
        />
        <DeleteConfirmPopup
          open={showToggleWarning}
          onClose={handleToggleWarningNo}
          onYes={handleToggleWarningYes}
          onNo={handleToggleWarningNo}
          message="The loading condition is met (Loaded Bag Count >= Bags To Be Loaded). Do you still want to set Loading Completed to false?"
        />
      </div>
    </AppShell>
  );
}

/* ================= HELPERS ================= */

function HeaderField({ label, value, onChange, readOnly }) {
  return (
    <div style={fieldStyles.container}>
      <label style={fieldStyles.label}>{label}</label>
      <input
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={getInputStyle(readOnly)}
      />
    </div>
  );
}

const proceedButtonDisabled = {
  background: "#9bb5d1",
  color: "#e0e0e0",
  cursor: "not-allowed",
  opacity: 0.6,
};

const infoButtonStyle = {
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  border: "2px solid #0B3A6E",
  backgroundColor: "#fff",
  color: "#0B3A6E",
  fontSize: "18px",
  fontWeight: "bold",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  transition: "all 0.2s",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
};

export default TrainEdit;


const topGridStyles = {
  container: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "20px",
    marginTop: "10px",
  },
};

const floatingField = {
  wrapper: {
    position: "relative",
    background: "#f4f4f4",
    border: "1.5px solid #000",
    borderRadius: "4px",
    padding: "22px 14px 12px",
  },
  label: {
    position: "absolute",
    top: "-10px",
    left: "10px",
    background: "#fff",
    padding: "0 6px",
    fontSize: "13px",
    fontWeight: "600",
  },
  input: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "16px",
    textAlign: "center",
  },
};

const boxedFieldStyles = {
  wrapper: {
    position: "relative",
    border: "1.5px solid #000",
    borderRadius: "3px",
    padding: "22px 18px 14px",
    background: "#fff",
    minWidth: "260px",
  },

  label: {
    position: "absolute",
    top: "-10px",
    left: "14px",
    background: "#fff",
    padding: "0 8px",
    fontSize: "15px",
    fontWeight: "600",
  },

  input: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "#fff",
    fontSize: "16px",
    textAlign: "center",
    fontWeight: "400",
  },

  select: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "#fff",
    fontSize: "16px",
    textAlign: "center",
    fontWeight: "400",
    appearance: "none",
    cursor: "pointer",
  },
};

const wagonTableStyles = {
  container: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderCollapse: "separate",
    borderSpacing: "1px 44.88px",
    tableLayout: "fixed",
  },

  header: {
    backgroundColor: "#0B3A6E",
    color: "white",
    padding: "14px 8px",
    fontSize: "11px",
    textAlign: "center",
    fontWeight: "600",
    border: "0.9px solid #000000",
    verticalAlign: "middle",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },

  row: (index) => ({
    backgroundColor: "#FFFFFF",
  }),

  cell: {
    padding: "0",
    fontSize: "11px",
    textAlign: "center",
    border: "0.9px solid #000000",
    color: "#000000",
    verticalAlign: "middle",
  },

  readOnlyCell: {
    padding: "16px 8px",
    fontSize: "11px",
    textAlign: "center",
    border: "0.9px solid #000000",
    color: "#000000",
    verticalAlign: "middle",
    backgroundColor: "#dbdbdbff",
  },

  input: {
    width: "100%",
    padding: "16px 8px",
    fontSize: "11px",
    border: "none",
    textAlign: "center",
    outline: "none",
    backgroundColor: "transparent",
    boxSizing: "border-box",
  },

  select: {
    width: "100%",
    padding: "16px 8px",
    fontSize: "11px",
    border: "none",
    textAlign: "center",
    outline: "none",
    backgroundColor: "transparent",
    boxSizing: "border-box",
    cursor: "pointer",
    appearance: "none",
  },
};