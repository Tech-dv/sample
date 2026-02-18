import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "./AppShell";
import approvedTick from "./assets/approved_tick.png";
import { API_BASE } from "./api";
import { useAutoSave, loadSavedData, clearSavedData } from "./hooks/useAutoSave";
import DraftSavePopup from "./components/DraftSavePopup";
import MultipleRakeSerialPopup from "./components/MultipleRakeSerialPopup";
import CancelPopup from "./components/CancelPopup";
import WarningPopup from "./components/WarningPopup";


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



function ReviewerVerify() {
  const { trainId: encodedTrainId } = useParams();
  const trainId = encodedTrainId ? decodeURIComponent(encodedTrainId) : null;
  const [searchParams] = useSearchParams();
  const indentNumber = searchParams.get('indent_number');
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const reviewerUsername = localStorage.getItem("username"); // Add reviewer username
  const [showDraftPopup, setShowDraftPopup] = useState(false);
  const [showMultipleRakePopup, setShowMultipleRakePopup] = useState(false);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [cancelRemarks, setCancelRemarks] = useState("");
  const [warning, setWarning] = useState({ open: false, message: "", title: "Warning" });

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
    if (role !== "ADMIN" && role !== "REVIEWER") return;

    fetch(`${API_BASE}/customers`, {
      headers: {
        "x-user-role": role,
        "x-reviewer-username": reviewerUsername || "",
      },
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
      headers: {
        "x-user-role": role || "",
        "x-reviewer-username": reviewerUsername || "",
      },
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
      headers: {
        "x-user-role": role || "",
        "x-reviewer-username": reviewerUsername || "",
      },
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
  }, [role, reviewerUsername]);

  /* ================= SAVE STATE ================= */
  const [isSaved, setIsSaved] = useState(false);

  /* ================= TRAIN HEADER ================= */
  const [trainHeader, setTrainHeader] = useState({
    indent_number: "",
    customer_id: "",
    wagon_destination: "", // ✅ fetched only
  });


  /* ================= WAGONS ================= */
  const [wagons, setWagons] = useState([]);

  // ✅ FIX: Track wagons that have been manually toggled (to preserve manual status on save)
  const [manuallyToggledWagons, setManuallyToggledWagons] = useState(new Set());

  /* ================= AUTO-SAVE FORM DATA ================= */
  const autoSaveKey = `reviewer-train-edit-form-${trainId}${indentNumber ? `-${indentNumber}` : ''}`;
  // Auto-save both header and wagons data
  const autoSaveData = {
    trainHeader,
    wagons,
    editOptions,
  };
  useAutoSave(autoSaveKey, autoSaveData, 1500); // Save after 1.5 seconds of inactivity

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
        // Load saved form data from localStorage
        const savedFormData = loadSavedData(autoSaveKey);

        // Build URL with indent_number query parameter if provided
        const url = indentNumber
          ? `${API_BASE}/reviewer/train/${encodeURIComponent(trainId)}?indent_number=${encodeURIComponent(indentNumber)}`
          : `${API_BASE}/reviewer/train/${encodeURIComponent(trainId)}`;

        const res = await fetch(url, {
          headers: {
            "x-user-role": role,
            "x-reviewer-username": reviewerUsername || "",
          },
        });
        if (!res.ok) return;

        const data = await res.json();

        // Load edit options from database or localStorage (fallback)
        const storedOptions = localStorage.getItem('editOptions');
        const dbOptions = {
          singleIndent: data.header.single_indent !== undefined ? data.header.single_indent : true,
          wagonTypeHL: data.header.hl_only !== undefined ? data.header.hl_only : false
        };

        // Use DB values if available, otherwise use localStorage, otherwise defaults
        const finalOptions = data.header.indent_number
          ? dbOptions  // If indent filled, use DB values
          : (storedOptions ? JSON.parse(storedOptions) : dbOptions);  // Otherwise try localStorage

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
        localStorage.removeItem('editOptions');

        const apiHeader = {
          indent_number: data.header.indent_number || "",
          customer_id: data.header.customer_id
            ? String(data.header.customer_id)
            : "",
          commodity: data.header.commodity || "",
          wagon_destination: data.header.wagon_destination || "",
        };

        let apiWagons;
        const manuallyToggledSet = new Set();

        if (data.wagons?.length) {
          apiWagons = data.wagons.map((w, i) => {
            const sealNumbers = w.seal_number
              ? w.seal_number.split(",").map(s => s.trim()).filter(Boolean)
              : [""];

            // If seal numbers exist in database, they were confirmed (saved), so mark all as confirmed
            // If only one empty seal number, don't mark it as confirmed
            const confirmedIndices = sealNumbers.length > 0 && sealNumbers[0] !== ""
              ? sealNumbers.map((_, idx) => idx).filter(idx => sealNumbers[idx] && sealNumbers[idx].trim() !== "")
              : [];

            // ✅ CRITICAL FIX: Remove seal_number from the object to avoid conflicts
            // We only use seal_numbers array, not seal_number string from database
            const { seal_number: _, ...wagonWithoutSealNumber } = w;

            const dbLoadingStatus = Boolean(w.loading_status);

            // ✅ FIX: Check if loading_status from DB doesn't match calculated value
            // If it doesn't match, it was manually set - track it
            const wagonToBeLoaded = w.wagon_to_be_loaded != null && w.wagon_to_be_loaded !== ""
              ? Number(w.wagon_to_be_loaded)
              : null;
            const loadedBagCount = Number(w.loaded_bag_count) || 0;

            const calculatedStatus = wagonToBeLoaded != null
              ? (loadedBagCount >= wagonToBeLoaded && loadedBagCount > 0)
              : false;

            // If DB status is true but calculated is false, it was manually set
            if (dbLoadingStatus && !calculatedStatus) {
              manuallyToggledSet.add(i + 1); // tower_number
            }

            return {
              ...wagonWithoutSealNumber, // Use wagon without seal_number to avoid conflicts
              // If wagonTypeHL option is true, set wagon_type to "HL", otherwise use existing value
              wagon_type: finalOptions.wagonTypeHL ? "HL" : (w.wagon_type || ""),
              sick_box: w.sick_box ? "Yes" : "No",
              loading_status: dbLoadingStatus,
              tower_number: i + 1,
              seal_numbers: sealNumbers.length > 0 ? sealNumbers : [""],
              confirmed_seal_indices: confirmedIndices, // Restore confirmed seal indices from saved data
            };
          });

          // ✅ FIX: Set manually toggled wagons from database
          setManuallyToggledWagons(manuallyToggledSet);
        } else {
          // No wagons found - create empty wagon with correct indent_number from header
          const emptyWagon = {
            wagon_number: "",
            wagon_type: finalOptions.wagonTypeHL ? "HL" : "",
            cc_weight: "",
            sick_box: "",
            wagon_to_be_loaded: "",
            commodity: "",
            tower_number: 1,
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
          };
          apiWagons = [emptyWagon];
        }

        // Merge with saved data if exists (saved data takes priority for user input)
        // But only if the saved data has actual meaningful content (not just empty fields)
        const hasMeaningfulSavedData = savedFormData &&
          savedFormData.wagons &&
          savedFormData.wagons.length > 0 &&
          savedFormData.wagons.some(w =>
            w.wagon_number || w.loaded_bag_count > 0 || w.unloaded_bag_count > 0
          );

        if (hasMeaningfulSavedData && savedFormData.wagons.length === apiWagons.length) {
          console.log("Found saved form data from previous session, merging with API data");

          // Use saved header if available
          const finalHeader = savedFormData.trainHeader || apiHeader;
          setTrainHeader(finalHeader);

          // Merge saved user-edited fields with fresh API data
          // Always use fresh API data for auto-populated fields (loaded_bag_count, unloaded_bag_count, loading times, etc.)
          const mergedWagons = apiWagons.map((apiWagon, index) => {
            const savedWagon = savedFormData.wagons[index];
            if (!savedWagon) return apiWagon;

            // Merge: Use saved values for user-editable fields, API values for auto-populated fields
            return {
              ...apiWagon, // Start with fresh API data (includes auto-populated fields)
              // Override only user-editable fields from saved data
              wagon_number: savedWagon.wagon_number !== undefined ? savedWagon.wagon_number : apiWagon.wagon_number,
              wagon_type: savedWagon.wagon_type !== undefined ? savedWagon.wagon_type : apiWagon.wagon_type,
              cc_weight: savedWagon.cc_weight !== undefined ? savedWagon.cc_weight : apiWagon.cc_weight,
              sick_box: savedWagon.sick_box !== undefined ? savedWagon.sick_box : apiWagon.sick_box,
              wagon_to_be_loaded: savedWagon.wagon_to_be_loaded !== undefined ? savedWagon.wagon_to_be_loaded : apiWagon.wagon_to_be_loaded,
              commodity: savedWagon.commodity !== undefined ? savedWagon.commodity : apiWagon.commodity,
              seal_numbers: savedWagon.seal_numbers && savedWagon.seal_numbers.length > 0 && savedWagon.seal_numbers[0] !== ""
                ? savedWagon.seal_numbers
                : apiWagon.seal_numbers,
              // Preserve confirmed_seal_indices from saved data, or use API data, or mark all non-empty as confirmed
              confirmed_seal_indices: savedWagon.confirmed_seal_indices !== undefined && savedWagon.confirmed_seal_indices.length > 0
                ? savedWagon.confirmed_seal_indices
                : (apiWagon.confirmed_seal_indices && apiWagon.confirmed_seal_indices.length > 0
                  ? apiWagon.confirmed_seal_indices
                  : (() => {
                    const finalSealNumbers = savedWagon.seal_numbers && savedWagon.seal_numbers.length > 0 && savedWagon.seal_numbers[0] !== ""
                      ? savedWagon.seal_numbers
                      : apiWagon.seal_numbers;
                    // Mark all non-empty seal numbers as confirmed
                    return finalSealNumbers.map((_, idx) => idx).filter(idx => finalSealNumbers[idx] && finalSealNumbers[idx].trim() !== "");
                  })()),
              stoppage_time: savedWagon.stoppage_time !== undefined ? savedWagon.stoppage_time : apiWagon.stoppage_time,
              remarks: savedWagon.remarks !== undefined ? savedWagon.remarks : apiWagon.remarks,
              // Multiple indent mode fields
              indent_number: savedWagon.indent_number !== undefined ? savedWagon.indent_number : apiWagon.indent_number,
              wagon_destination: savedWagon.wagon_destination !== undefined ? savedWagon.wagon_destination : apiWagon.wagon_destination,
              customer_id: savedWagon.customer_id !== undefined ? savedWagon.customer_id : apiWagon.customer_id,
              // Keep API values for auto-populated fields (loaded_bag_count, unloaded_bag_count, loading times, loading_status)
              // These are already in apiWagon from the spread above
            };
          });

          setWagons(mergedWagons);
        } else {
          // No meaningful saved data - use API data (fresh from database)
          console.log("Using fresh data from database");
          setTrainHeader(apiHeader);
          setWagons(apiWagons);

          // Clear any stale autosave data
          if (savedFormData) {
            console.log("Clearing stale autosave data");
            clearSavedData(autoSaveKey);
          }
        }
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

  const updateWagon = (index, field, value) => {
    // Fields that always cascade to rows below
    let cascadeFields = [
      "wagon_type",
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
      // always update current row
      if (i === index) {
        return { ...w, [field]: value };
      }

      // copy value to rows BELOW (only for cascade fields)
      if (cascadeFields.includes(field) && i > index) {
        return { ...w, [field]: value };
      }

      return w;
    });

    setWagons(updated);
    setIsSaved(false);
  };
  const toggleStatus = async (index) => {
    const updated = [...wagons];
    const wagon = updated[index];

    const newStatus = !wagon.loading_status;
    wagon.loading_status = newStatus;

    setWagons(updated);
    setIsSaved(false);

    // ✅ FIX: Track that this wagon was manually toggled
    setManuallyToggledWagons(prev => {
      const newSet = new Set(prev);
      if (newStatus) {
        // User manually set to true - track it
        newSet.add(wagon.tower_number);
      } else {
        // User manually set to false - remove from tracking (will be recalculated)
        newSet.delete(wagon.tower_number);
      }
      return newSet;
    });

    try {
      await fetch(
        `${API_BASE}/wagon/${encodeURIComponent(trainId)}/${wagon.tower_number}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": role,
            "x-reviewer-username": reviewerUsername || "",
          },
          body: JSON.stringify({
            loading_status: newStatus,
          }),
        }
      );
    } catch (err) {
      console.error("Failed to toggle wagon status", err);
    }
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

    // ✅ FIX: Rebuild manuallyToggledWagons set based on current wagon states
    const newManuallyToggledSet = new Set();
    withTower.forEach(w => {
      // Handle both string and number types
      const wagonToBeLoadedValue = w.wagon_to_be_loaded != null ? String(w.wagon_to_be_loaded) : "";
      const wagonToBeLoaded = wagonToBeLoadedValue && wagonToBeLoadedValue.trim() !== ""
        ? Number(wagonToBeLoadedValue)
        : null;
      const loadedBagCount = Number(w.loaded_bag_count) || 0;
      const calculatedStatus = wagonToBeLoaded != null
        ? (loadedBagCount >= wagonToBeLoaded && loadedBagCount > 0)
        : false;

      // If current status is true but calculated is false, it was manually set
      if (w.loading_status && !calculatedStatus) {
        newManuallyToggledSet.add(w.tower_number);
      }
    });
    setManuallyToggledWagons(newManuallyToggledSet);

    setWagons(withTower);
    setIsSaved(false);
  };

  /* ================= DELETE WAGON ================= */
  const deleteWagon = (index) => {
    if (wagons.length === 1) {
      setWarning({ open: true, message: "At least one wagon is required", title: "Warning" });
      return;
    }

    const updated = wagons.filter((_, i) => i !== index);

    const withTower = updated.map((w, i) => ({
      ...w,
      tower_number: i + 1,
    }));

    // ✅ FIX: Rebuild manuallyToggledWagons set based on current wagon states
    const newManuallyToggledSet = new Set();
    withTower.forEach(w => {
      // Handle both string and number types
      const wagonToBeLoadedValue = w.wagon_to_be_loaded != null ? String(w.wagon_to_be_loaded) : "";
      const wagonToBeLoaded = wagonToBeLoadedValue && wagonToBeLoadedValue.trim() !== ""
        ? Number(wagonToBeLoadedValue)
        : null;
      const loadedBagCount = Number(w.loaded_bag_count) || 0;
      const calculatedStatus = wagonToBeLoaded != null
        ? (loadedBagCount >= wagonToBeLoaded && loadedBagCount > 0)
        : false;

      // If current status is true but calculated is false, it was manually set
      if (w.loading_status && !calculatedStatus) {
        newManuallyToggledSet.add(w.tower_number);
      }
    });
    setManuallyToggledWagons(newManuallyToggledSet);

    setWagons(withTower);
    setIsSaved(false);
  };

  /* ================= SAVE DRAFT ================= */
  const saveDraft = async (showPopup = true) => {
    try {
      const wagonsWithHeader = wagons.map(w => {
        // ✅ FIX: Convert empty wagon_to_be_loaded to null (not 0)
        // This prevents loading_status from being incorrectly set to true when both are 0
        // Handle both string and number types
        const wagonToBeLoadedValue = w.wagon_to_be_loaded != null ? String(w.wagon_to_be_loaded) : "";
        const wagonToBeLoaded = wagonToBeLoadedValue && wagonToBeLoadedValue.trim() !== ""
          ? Number(wagonToBeLoadedValue)
          : null;

        // ✅ FIX: If wagon was manually toggled to true, preserve that status
        // Otherwise, let backend calculate it based on bag counts
        const isManuallyToggled = manuallyToggledWagons.has(w.tower_number);
        
        // ✅ CRITICAL: Get loaded_bag_count for condition check (needed to determine if we should send loading_status)
        // Even though we don't send bag counts, we need them to check if condition is met
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

        // ✅ CRITICAL FIX: Always include loading_status when condition is met or manually toggled
        // Calculate if condition is met: loadedBagCount >= wagonToBeLoaded
        const conditionMet = wagonToBeLoaded != null && loadedBagCount >= wagonToBeLoaded;
        
        // Always include loading_status if:
        // 1. Condition is met (loadedBagCount >= wagonToBeLoaded) - send the current status (should be true)
        // 2. Wagon was manually toggled - send the user's explicit choice
        // This ensures the status is saved correctly when bags are loaded and condition is met
        if (conditionMet || isManuallyToggled) {
          wagonPayload.loading_status = w.loading_status;
          console.log(`[REVIEWER SAVE] Including loading_status=${w.loading_status} for wagon tower_number=${w.tower_number}, conditionMet=${conditionMet}, isManuallyToggled=${isManuallyToggled}, loadedBagCount=${loadedBagCount}, wagonToBeLoaded=${wagonToBeLoaded}`);
        } else {
          console.log(`[REVIEWER SAVE] NOT including loading_status for wagon tower_number=${w.tower_number}, conditionMet=${conditionMet}, isManuallyToggled=${isManuallyToggled}, loadedBagCount=${loadedBagCount}, wagonToBeLoaded=${wagonToBeLoaded}`);
        }

        return wagonPayload;
      });

      const res = await fetch(`${API_BASE}/train/${encodeURIComponent(trainId)}/draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
          "x-reviewer-username": reviewerUsername || "",
        },
        body: JSON.stringify({
          header: {
            ...trainHeader,
            // ✅ FIX: Preserve customer_id if it exists, regardless of indent mode
            // Only set to null if it's actually empty/undefined
            customer_id: trainHeader.customer_id && 
              (typeof trainHeader.customer_id === 'string' ? trainHeader.customer_id.trim() !== "" : trainHeader.customer_id)
              ? Number(trainHeader.customer_id)
              : null,
          },
          wagons: wagonsWithHeader,
          editOptions: {
            singleIndent: editOptions.singleIndent,
            wagonTypeHL: editOptions.wagonTypeHL,
          },
        }),
      });

      if (!res.ok) return false;

      setIsSaved(true);

      // Clear auto-saved data on successful save
      clearSavedData(autoSaveKey);

      if (showPopup) {
        setShowDraftPopup(true);
      }

      return true;
    } catch (err) {
      console.error("Save draft failed", err);
      return false;
    }
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
    
    // ✅ Check if all wagons for each indent number have wagon numbers filled
    // This validation applies to both parent and child records in multiple indent mode
    if (!editOptions.singleIndent) {
      const indentNumbers = [...new Set(wagons.map(w => w.indent_number).filter(Boolean))];
      const incompleteIndentNumbers = [];
      for (const indentNum of indentNumbers) {
        const wagonsForIndent = wagons.filter(w => w.indent_number === indentNum);
        const hasIncompleteWagons = wagonsForIndent.some(w => {
          const wagonNumber = w.wagon_number != null ? String(w.wagon_number).trim() : "";
          // Only check if wagon number is missing
          return wagonNumber === "";
        });
        
        if (hasIncompleteWagons) {
          incompleteIndentNumbers.push(indentNum);
        }
      }
      
      if (incompleteIndentNumbers.length > 0) {
        const indentList = incompleteIndentNumbers.join(", ");
        setWarning({ 
          open: true, 
          message: `Please fill wagon numbers for the following indent number(s): ${indentList}`, 
          title: "Warning" 
        });
        return;
      }
    }
    
    const ok = await saveDraft(false);
    if (!ok) return;

    // If multiple indent mode, check if already split or question answered
    if (!editOptions.singleIndent) {
      // ✅ FIX: Skip popup for child nodes (when indentNumber is present in URL)
      if (indentNumber) {
        console.log("Child node detected - skipping popup and proceeding directly");
        navigate(`/reviewer/train/${encodeURIComponent(trainId)}/dispatch${indentNumber ? `?indent_number=${encodeURIComponent(indentNumber)}` : ''}`);
        return;
      }
      
      // ✅ FIX: If question has already been answered (Yes or No), skip popup
      if (serialQuestionAnswered) {
        // If answered "Yes" (hasSequentialSerials = true), check for sequential train IDs
        if (hasSequentialSerials) {
          console.log("Train already split into sequential serials, skipping popup");
          navigate(`/reviewer/train/${encodeURIComponent(trainId)}/dispatch${indentNumber ? `?indent_number=${encodeURIComponent(indentNumber)}` : ''}`);
          return;
        } else {
          // Answered "No" - proceed without sequential numbers
          console.log("Multiple rake serial question answered 'No', skipping popup");
          navigate(`/reviewer/train/${encodeURIComponent(trainId)}/dispatch${indentNumber ? `?indent_number=${encodeURIComponent(indentNumber)}` : ''}`);
          return;
        }
      }

      // Question not answered yet - show popup (only for parent nodes)
      setShowMultipleRakePopup(true);
      return;
    }

    // Single indent mode - proceed normally
    navigate(`/reviewer/train/${encodeURIComponent(trainId)}/dispatch${indentNumber ? `?indent_number=${encodeURIComponent(indentNumber)}` : ''}`);
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

      // Call backend to generate sequential serial numbers
      const res = await fetch(`${API_BASE}/train/${encodeURIComponent(trainId)}/generate-multiple-rake-serial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
          "x-reviewer-username": reviewerUsername || "",
        },
        body: JSON.stringify({
          indentNumbers: indentNumbers,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Failed to generate serial numbers: ${error.message || "Unknown error"}`);
        return;
      }

      const data = await res.json();

      // ✅ FIX: Update local state to reflect that question has been answered
      setSerialQuestionAnswered(true);
      setHasSequentialSerials(true);

      // Navigate to dispatch page with the first serial number (the one with loading records)
      const firstIndent = indentNumber || null;
      navigate(`/reviewer/train/${encodeURIComponent(data.firstSerialNumber)}/dispatch${firstIndent ? `?indent_number=${encodeURIComponent(firstIndent)}` : ''}`);
    } catch (err) {
      console.error("Error generating multiple rake serial numbers:", err);
      alert("Failed to generate serial numbers. Please try again.");
    }
  };

  const handleMultipleRakeNo = async () => {
    setShowMultipleRakePopup(false);

    try {
      // Mark that the serial number question has been answered (even though "No" was selected)
      await fetch(`${API_BASE}/train/${encodeURIComponent(trainId)}/mark-serial-handled`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
          "x-reviewer-username": reviewerUsername || "",
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
    navigate(`/reviewer/train/${encodeURIComponent(trainId)}/dispatch${indentNumber ? `?indent_number=${encodeURIComponent(indentNumber)}` : ''}`);
  };

  /* ================= CANCEL INDENT HANDLER ================= */
  const handleCancelIndent = async (remarks) => {
    if (!remarks || !remarks.trim()) {
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/reviewer/tasks/${trainId}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": role,
            "x-reviewer-username": reviewerUsername || "",
          },
          body: JSON.stringify({
            indent_number: indentNumber,
            remarks: remarks,
          }),
        }
      );

      if (res.ok) {
        // Refresh activity timeline after cancellation (if on a page that displays it)
        // Note: ReviewerVerify doesn't display activity timeline, but we track it for consistency
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

                {(role === "ADMIN" || role === "REVIEWER") && (
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
                      {(role === "ADMIN" || role === "REVIEWER") && <th style={wagonTableStyles.header}>Party / Customer's Name</th>}
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
                        {(role === "ADMIN" || role === "REVIEWER") && (
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

                    <td style={wagonTableStyles.readOnlyCell}>{w.stoppage_time || "-"}</td>

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
              ➕ Add Wagon
            </button>
          </div>
        </div>

        {/* ================= FOOTER ================= */}
        <div style={{
          ...buttonGroupStyles.container,
          margin: "30px 20px 20px",
          justifyContent: "space-between"
        }}>
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

          {/* Right side: Cancel, Save, Proceed buttons */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              style={getButtonStyle("cancel")}
              onClick={() => navigate("/dashboard")}
            >
              Cancel
            </button>

            <button style={getButtonStyle("save")} onClick={saveDraft}>
              Save
            </button>

            <button style={getButtonStyle("proceed")} onClick={proceed}>
              Proceed
            </button>
          </div>
        </div>
        <DraftSavePopup
          open={showDraftPopup}
          onClose={() => setShowDraftPopup(false)}
        />
        <MultipleRakeSerialPopup
          open={showMultipleRakePopup}
          onClose={() => setShowMultipleRakePopup(false)}
          onYes={handleMultipleRakeYes}
          onNo={handleMultipleRakeNo}
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
        <WarningPopup
          open={warning.open}
          onClose={() => setWarning({ open: false, message: "", title: "Warning" })}
          message={warning.message}
          title={warning.title}
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

export default ReviewerVerify;


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