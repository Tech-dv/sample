import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "./AppShell";
import { API_BASE } from "./api";
import { checkSessionOnLoad } from "./utils/sessionUtils";
import EditOptionsPopup from "./components/EditOptionsPopup";
import IconButton from "./components/IconButton";
import WarningPopup from "./components/WarningPopup";
import Speedometer from "./components/Speedometer";


const ROWS_PER_PAGE = 5;
const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    const date = new Date(value);
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


function Dashboard() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  // Debug on mount
  console.log("Dashboard component mounted");
  console.log("Role from localStorage:", role);
  console.log("API_BASE:", API_BASE);

  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [alertCounts, setAlertCounts] = useState({
    "SPUR-8": 0,
    "SPUR-9": 0,
  });
  
  /* ================= EDIT POPUP STATE ================= */
  const [showEditPopup, setShowEditPopup] = useState(false);
  const [selectedTrainId, setSelectedTrainId] = useState(null);

  /* ================= FILTER STATE ================= */
  const [filters, setFilters] = useState({
    train_id: "",
    indent_number: "",
    customer_name: "",
    siding: "",
    wagon_destination: "",
    commodity: "",
    status: "",
    loading_start_date: "",
    loading_completion_date: "",
  });

  /* ================= FETCH ALERT COUNTS ================= */
  const fetchAlertCounts = async () => {
    try {
      const role = localStorage.getItem("role");
      if (!role) return;

      // TODO: Replace with actual alerts API endpoint when available
      // For now, we'll fetch cameras and count inactive ones
      // In the future, this should be: GET /alerts/count?spur=SPUR-8
      
      // Fetch cameras for both spurs to count inactive ones
      const [spur8Res, spur9Res] = await Promise.all([
        fetch(`${API_BASE}/cameras?siding=SPUR-8`, {
          headers: { "x-user-role": role },
        }),
        fetch(`${API_BASE}/cameras?siding=SPUR-9`, {
          headers: { "x-user-role": role },
        }),
      ]);

      if (spur8Res.ok && spur9Res.ok) {
        const spur8Cameras = await spur8Res.json();
        const spur9Cameras = await spur9Res.json();
        
        // Count inactive cameras (for now)
        // TODO: When alerts API is ready, fetch all alert types:
        // const [spur8Alerts, spur9Alerts] = await Promise.all([
        //   fetch(`${API_BASE}/alerts/count?spur=SPUR-8`),
        //   fetch(`${API_BASE}/alerts/count?spur=SPUR-9`),
        // ]);
        // This will include inactive, shaking, and blur alerts
        
        const spur8Inactive = spur8Cameras.filter(cam => !cam.status).length;
        const spur9Inactive = spur9Cameras.filter(cam => !cam.status).length;
        
        // TODO: Add counts for shaking and blur alerts when API is available
        // For now, only counting inactive cameras
        setAlertCounts({
          "SPUR-8": spur8Inactive, // TODO: Add + shakingCount + blurCount
          "SPUR-9": spur9Inactive, // TODO: Add + shakingCount + blurCount
        });
      }
    } catch (err) {
      console.debug("[DASHBOARD] Failed to fetch alert counts (non-critical):", err);
    }
  };

  /* ================= CHECK SEQUENTIAL ASSIGNMENTS ================= */
  const checkSequentialAssignments = async () => {
    try {
      const role = localStorage.getItem("role");
      if (!role) return;

      const res = await fetch(`${API_BASE}/train/check-sequential-assignments?since_seconds=30`, {
        headers: {
          "x-user-role": role,
        },
      });

      if (!res.ok) {
        // Silently fail - this is a polling endpoint, errors are not critical
        return;
      }

      const data = await res.json();
      
      if (data.assignments && data.assignments.length > 0) {
        console.log(`[DASHBOARD] Detected ${data.assignments.length} new sequential train_id assignment(s)`);
        
        // Set refresh flag to trigger dashboard refresh
        localStorage.setItem('dashboardNeedsRefresh', Date.now().toString());
        
        // Dispatch event for immediate refresh if Dashboard is mounted
        window.dispatchEvent(new CustomEvent('trainIdUpdated', { 
          detail: { 
            updatedTrainIds: data.assignments.reduce((acc, a) => {
              acc[a.indent_number] = a.train_id;
              return acc;
            }, {})
          } 
        }));
      }
    } catch (err) {
      // Silently fail - this is a polling endpoint, errors are not critical
      console.debug("[DASHBOARD] Sequential assignments check failed (non-critical):", err);
    }
  };

  /* ================= FETCH DASHBOARD ================= */
  const fetchDashboardData = async () => {
    try {
      // Check if refresh flag exists (set when train_id changes)
      const needsRefresh = localStorage.getItem('dashboardNeedsRefresh');
      if (needsRefresh) {
        console.log("[DASHBOARD] Refresh flag detected, forcing refresh...");
        localStorage.removeItem('dashboardNeedsRefresh');
      }
      
      const role = localStorage.getItem("role");
      const customerId = localStorage.getItem("customerId");

      console.log("=== Fetching dashboard data ===");
      console.log("Role:", role);
      console.log("API_BASE:", API_BASE);
      console.log("Request URL:", `${API_BASE}/dashboard-data`);

      const username = localStorage.getItem("username");

      const headers = {
        "x-user-role": role,
        ...(role === "CUSTOMER" && {
          "x-customer-id": customerId,
        }),
      };

      // For SUPER_ADMIN, include username so backend can filter revoked records per user
      if (role === "SUPER_ADMIN" && username) {
        headers["x-username"] = username;
      }

      const res = await fetch(`${API_BASE}/dashboard-data`, {
        headers,
      });

      console.log("Response status:", res.status);
      console.log("Response ok:", res.ok);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Error response:", errorText);
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      console.log("Dashboard data received:", data);
      console.log("Summary:", data.summary);
      console.log("Records count:", data.records?.length || 0);
      
      // Set summary with defaults if not provided
      setSummary(data.summary || {});
      setRecords(data.records || []);
      console.log("=== Dashboard data loaded successfully ===");
    } catch (err) {
      console.error("=== Dashboard fetch FAILED ===");
      console.error("Error:", err);
      console.error("Error message:", err.message);
      console.error("Error stack:", err.stack);
      
      alert(`Failed to load dashboard: ${err.message}\nCheck console for details.`);
      
      // Set empty defaults so the page can still render
      setSummary({});
      setRecords([]);
    }
  };


  useEffect(() => {
    if (!role) {
      navigate("/");
      return;
    }

    // Check session validity on mount
    if (!checkSessionOnLoad()) {
      navigate("/");
      return;
    }

    // Check if refresh is needed immediately on mount
    const needsRefresh = localStorage.getItem('dashboardNeedsRefresh');
    if (needsRefresh) {
      console.log("[DASHBOARD] Refresh needed on mount, refreshing immediately...");
      localStorage.removeItem('dashboardNeedsRefresh');
      fetchDashboardData();
    } else {
      fetchDashboardData();
    }
    
    // Fetch alert counts
    fetchAlertCounts();
    
    // Set up polling interval that checks for refresh flag and sequential assignments
    const interval = setInterval(async () => {
      // First check for sequential assignments (triggered by external system)
      await checkSequentialAssignments();
      
      // Then check for refresh flag
      const flag = localStorage.getItem('dashboardNeedsRefresh');
      if (flag) {
        console.log("[DASHBOARD] Refresh flag detected in poll, refreshing...");
        localStorage.removeItem('dashboardNeedsRefresh');
        fetchDashboardData();
      } else {
        fetchDashboardData();
      }
      
      // Refresh alert counts
      fetchAlertCounts();
    }, 5000);
    
    // Listen for train_id updates from TrainEdit page
    const handleTrainIdUpdate = () => {
      console.log("[DASHBOARD] Train ID updated event received, refreshing...");
      fetchDashboardData();
    };
    
    window.addEventListener('trainIdUpdated', handleTrainIdUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('trainIdUpdated', handleTrainIdUpdate);
    };
  }, [role, navigate]);

  if (summary === null) return <p>Loading dashboard...</p>;

  /* ================= ROLE FILTER + BAG COUNT FILTER ================= */
  // Only show rakes where bag count has started (total_bags_loaded > 0)
  const visibleRecords = records.filter((row) => {
    const hasBagCountStarted = (row.total_bags_loaded || 0) > 0;
    return hasBagCountStarted;
  });

  /* ================= CUSTOMER SPEEDOMETER CALCULATIONS ================= */
  // Calculate totals for speedometer charts (for CUSTOMER role only)
  const calculateCustomerTotals = () => {
    if (role !== "CUSTOMER") return null;

    let totalBagsLoaded = 0;
    let totalBagsToBeLoaded = 0;
    let totalWagonsLoaded = 0;
    let totalWagonsToBeLoaded = 0;

    visibleRecords.forEach((row) => {
      // Bags
      totalBagsLoaded += Number(row.total_bags_loaded || 0);
      totalBagsToBeLoaded += Number(row.total_bags_to_be_loaded || 0);
      
      // Wagons
      totalWagonsLoaded += Number(row.total_wagons_loaded || 0);
      totalWagonsToBeLoaded += Number(row.number_of_indent_wagons || 0);
    });

    return {
      bags: {
        loaded: totalBagsLoaded,
        total: totalBagsToBeLoaded || totalBagsLoaded, // Use loaded as total if to_be_loaded is null
      },
      wagons: {
        loaded: totalWagonsLoaded,
        total: totalWagonsToBeLoaded || totalWagonsLoaded, // Use loaded as total if to_be_loaded is null
      },
    };
  };

  const customerTotals = calculateCustomerTotals();


  /* ================= COLUMN FILTER ================= */
  const filteredRecords = visibleRecords.filter((row) => {
    let statusDisplay;
    if (row.status === "APPROVED") {
      statusDisplay = "Rake Loading Completed";
    } else if (row.status === "CANCELLED") {
      statusDisplay = "Cancelled Indent";
    } else {
      statusDisplay = "Rake Loading In Progress";
    }
    
    // Date filter for Rake Loading Start Date & Time
    let startDateMatches = true;
    if (filters.loading_start_date) {
      const startDate = row.rake_loading_start_datetime 
        ? new Date(row.rake_loading_start_datetime)
        : null;
      
      if (startDate) {
        const filterDate = new Date(filters.loading_start_date);
        filterDate.setHours(0, 0, 0, 0);
        const startDateOnly = new Date(startDate);
        startDateOnly.setHours(0, 0, 0, 0);
        
        startDateMatches = startDateOnly.getTime() === filterDate.getTime();
      } else {
        startDateMatches = false; // If no date, exclude from filtered results
      }
    }
    
    // Date filter for Rake Loading Completion Date & Time
    let completionDateMatches = true;
    if (filters.loading_completion_date) {
      const completionDate = row.rake_loading_end_actual 
        ? new Date(row.rake_loading_end_actual)
        : null;
      
      if (completionDate) {
        const filterDate = new Date(filters.loading_completion_date);
        filterDate.setHours(0, 0, 0, 0);
        const completionDateOnly = new Date(completionDate);
        completionDateOnly.setHours(0, 0, 0, 0);
        
        completionDateMatches = completionDateOnly.getTime() === filterDate.getTime();
      } else {
        completionDateMatches = false; // If no date, exclude from filtered results
      }
    }
    
    const dateMatches = startDateMatches && completionDateMatches;
    
    return (
      dateMatches &&
      (!filters.train_id ||
        row.train_id?.toLowerCase().includes(filters.train_id)) &&
      (!filters.indent_number ||
        row.indent_number?.toLowerCase().includes(filters.indent_number)) &&
      (!filters.customer_name ||
        row.customer_name?.toLowerCase() === filters.customer_name) &&
      (!filters.siding ||
        row.siding?.toLowerCase() === filters.siding) &&
      (!filters.wagon_destination ||
        row.wagon_destination?.toLowerCase() === filters.wagon_destination) &&
      (!filters.commodity ||
        row.commodity?.toLowerCase() === filters.commodity) &&
      (!filters.status ||
        statusDisplay === filters.status)
    );
  });

  /* ================= PAGINATION ================= */
  const totalPages = Math.ceil(filteredRecords.length / ROWS_PER_PAGE);
  const startIndex = (page - 1) * ROWS_PER_PAGE;
  const endIndex = Math.min(
    startIndex + ROWS_PER_PAGE,
    filteredRecords.length
  );

  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  /* ================= UNIQUE VALUES ================= */
  const getUniqueValues = (key) => {
    const values = visibleRecords
      .map((r) => r[key])
      .filter(Boolean)
      .map((v) => v.toString().toLowerCase());

    return [...new Set(values)];
  };

  /* ================= RESET FILTERS ================= */
  const resetFilters = () => {
    setFilters({
      train_id: "",
      indent_number: "",
      customer_name: "", 
      siding: "",
      wagon_destination: "",
      commodity: "",
      status: "",
      loading_start_date: "",
      loading_completion_date: "",
    });
    setPage(1);
  };

  /* ================= EDIT HANDLERS ================= */
  const handleEditClick = async (trainId, indentNumber = null) => {
    setSelectedTrainId(trainId);
    
    // If indentNumber is provided, it means we're editing a specific indent row
    // In this case, skip popup and go directly to edit
    if (indentNumber) {
      navigate(`/train/${encodeURIComponent(trainId)}/edit?indent_number=${encodeURIComponent(indentNumber)}`);
      return;
    }
    
    // Check if indent_number has been filled OR multiple_indent_confirmed flag is set
    // (indicates user already made their choice)
    try {
      const res = await fetch(`${API_BASE}/train/${encodeURIComponent(trainId)}/edit`);
      
      if (res.ok) {
        const data = await res.json();
        
        // If indent_number is filled OR multiple_indent_confirmed flag is set, user already made their choice - skip popup
        if (data.header.indent_number || data.header.multiple_indent_confirmed) {
          // Navigate without indent_number (will get first available row)
          navigate(`/train/${encodeURIComponent(trainId)}/edit`);
          return;
        }
      }
    } catch (err) {
      console.error("Error checking train data:", err);
    }
    
    // No indent_number filled and flag not set - show popup
    setShowEditPopup(true);
  };

  const handleEditProceed = (options) => {
    setShowEditPopup(false);
    // Store options in localStorage or pass as query params
    if (selectedTrainId) {
      localStorage.setItem(`editOptions:${selectedTrainId}`, JSON.stringify(options));
    } else {
      // Fallback (shouldn't happen, but keeps behavior safe)
      localStorage.setItem('editOptions', JSON.stringify(options));
    }
    navigate(`/train/${encodeURIComponent(selectedTrainId)}/edit`);
  };


  return (
    <AppShell>
      <div style={styles.mainContent}>
        {/* ================= SUMMARY ================= */}
        <div style={styles.summaryWrapper}>
          {role === "CUSTOMER" ? (
            <div style={styles.speedometerContainer}>
              <Speedometer
                loaded={customerTotals?.bags.loaded || 0}
                total={customerTotals?.bags.total || 0}
                label="Bags Loaded"
                balanceLabel="Balance Bags To Be Loaded"
                totalLabel="Total Number of bags to be loaded"
                balanceTotalLabel="Balance Bags To Be Loaded"
              />
              <Speedometer
                loaded={customerTotals?.wagons.loaded || 0}
                total={customerTotals?.wagons.total || 0}
                label="Wagons Loaded"
                balanceLabel="Balance Wagons To Be Loaded"
                totalLabel="Total Number of wagons to be loaded"
                balanceTotalLabel="Balance Wagons To Be Loaded"
              />
            </div>
          ) : (
            <>
              <div style={styles.summaryRow}>
                <SummaryCard
                  title="Total Wagons Processed For Spur 8"
                  value={`${summary.spurSummary["SPUR-8"].wagons.completed} / ${summary.spurSummary["SPUR-8"].wagons.total}`}
                />
                <SummaryCard
                  title="Active Cameras For Spur 8"
                  value={`${summary.spurSummary["SPUR-8"].cameras.active} / ${summary.spurSummary["SPUR-8"].cameras.total}`}
                  onClick={() => navigate("/cameras/SPUR-8")}
                />
                <SummaryCard 
                  title="Active Alerts For Spur 8" 
                  value={alertCounts["SPUR-8"]} 
                />
              </div>

              <div style={styles.summaryRow}>
                <SummaryCard
                  title="Total Wagons Processed For Spur 9"
                  value={`${summary.spurSummary["SPUR-9"].wagons.completed} / ${summary.spurSummary["SPUR-9"].wagons.total}`}
                />
                <SummaryCard
                  title="Active Cameras For Spur 9"
                  value={`${summary.spurSummary["SPUR-9"].cameras.active} / ${summary.spurSummary["SPUR-9"].cameras.total}`}
                  onClick={() => navigate("/cameras/SPUR-9")}
                />
                <SummaryCard 
                  title="Active Alerts For Spur 9" 
                  value={alertCounts["SPUR-9"]} 
                />
              </div>
            </>
          )}
        </div>





        {/* ================= FILTER ACTION BAR ================= */}
        <div style={styles.filterBar}>
          <button style={styles.resetBtn} onClick={resetFilters}>
            Reset Filters
          </button>
        </div>

        {/* ================= TABLE ================= */}
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              {/* ================= COLUMN HEADERS ================= */}
              <tr>
                {role === "CUSTOMER" ? (
                  <>
                    <th style={styles.th}>Source</th>
                    <th style={styles.th}>Indent Number</th>
                    <th style={styles.th}>Rake Loading Start Date & Time</th>
                    <th style={styles.th}>Number Of Wagons Loaded</th>
                    <th style={styles.th}>Number Of Indent Wagons</th>
                    <th style={styles.th}>Number Of Bags Loaded</th>
                    <th style={styles.th}>Commodity</th>
                    <th style={styles.th}>Siding</th>
                    <th style={styles.th}>Destination</th>
                    <th style={styles.th}>Rake Loading Completion Date & Time</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Action</th>
                  </>
                ) : (
                  <>
                    <th style={styles.th}>Rake Serial Number</th>
                    <th style={styles.th}>Indent Number</th>
                    <th style={styles.th}>Siding</th>
                    <th style={styles.th}>Party/Customer's Name</th>
                    <th style={styles.th}>Destination</th>
                    <th style={styles.th}>Commodity</th>
                    <th style={styles.th}>Rake Loading Start Date & Time</th>
                    <th style={styles.th}>Rake Loading Completion Date & Time</th>
                    <th style={styles.th}>Number of Bags Loaded</th>
                    <th style={styles.th}>Number of Bags To Be Loaded</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Action</th>
                  </>
                )}
              </tr>

              {/* ================= FILTER ROW ================= */}
              <tr>
                <th style={styles.filterTh}>
                  <input
                    placeholder="Search"
                    value={filters.train_id}
                    onChange={(e) =>
                      setFilters({ ...filters, train_id: e.target.value.toLowerCase() })
                    }
                    style={styles.filterInput}
                  />
                </th>

                <th style={styles.filterTh}>
                  <input
                    placeholder="Search"
                    value={filters.indent_number}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        indent_number: e.target.value.toLowerCase(),
                      })
                    }
                    style={styles.filterInput}
                  />
                </th>

                <th style={styles.filterTh}>
                  <select
                    value={filters.siding}
                    onChange={(e) =>
                      setFilters({ ...filters, siding: e.target.value })
                    }
                    style={styles.filterInput}
                  >
                    <option value="">All</option>
                    {getUniqueValues("siding").map((v) => (
                      <option key={v} value={v}>{v.toUpperCase()}</option>
                    ))}
                  </select>
                </th>

                {role !== "CUSTOMER" && (
                  <th style={styles.filterTh}>
                    <select
                      value={filters.customer_name}
                      onChange={(e) =>
                        setFilters({ ...filters, customer_name: e.target.value })
                      }
                      style={styles.filterInput}
                    >
                      <option value="">All</option>
                      {getUniqueValues("customer_name").map((v) => (
                        <option key={v} value={v}>{v.toUpperCase()}</option>
                      ))}
                    </select>
                  </th>
                )}

                <th style={styles.filterTh}>
                  <select
                    value={filters.wagon_destination}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        wagon_destination: e.target.value,
                      })
                    }
                    style={styles.filterInput}
                  >
                    <option value="">All</option>
                    {getUniqueValues("wagon_destination").map((v) => (
                      <option key={v} value={v}>{v.toUpperCase()}</option>
                    ))}
                  </select>
                </th>

                <th style={styles.filterTh}>
                  <select
                    value={filters.commodity}
                    onChange={(e) =>
                      setFilters({ ...filters, commodity: e.target.value })
                    }
                    style={styles.filterInput}
                  >
                    <option value="">All</option>
                    {getUniqueValues("commodity").map((v) => (
                      <option key={v} value={v}>{v.toUpperCase()}</option>
                    ))}
                  </select>
                </th>

                {/* Rake Loading Start Date & Time filter */}
                <th style={styles.filterTh}>
                  <input
                    type="date"
                    value={filters.loading_start_date}
                    onChange={(e) => {
                      setFilters({ ...filters, loading_start_date: e.target.value });
                      setPage(1);
                    }}
                    style={styles.filterInput}
                  />
                </th>

                {/* Rake Loading Completion Date & Time filter */}
                <th style={styles.filterTh}>
                  <input
                    type="date"
                    value={filters.loading_completion_date}
                    onChange={(e) => {
                      setFilters({ ...filters, loading_completion_date: e.target.value });
                      setPage(1);
                    }}
                    style={styles.filterInput}
                  />
                </th>

                {/* Empty filter cells */}
                <th style={styles.filterTh}></th>
                <th style={styles.filterTh}></th>
                {role !== "CUSTOMER" && (
                  <th style={styles.filterTh}>
                    <select
                      value={filters.status}
                      onChange={(e) =>
                        setFilters({ ...filters, status: e.target.value })
                      }
                      style={styles.filterInput}
                    >
                    <option value="">All</option>
                    <option value="Rake Loading Completed">Rake Loading Completed</option>
                    <option value="Rake Loading In Progress">Rake Loading In Progress</option>
                    {role !== "SUPER_ADMIN" && (
                    <option value="Cancelled Indent">Cancelled Indent</option>
                    )}
                    </select>
                  </th>
                )}
                <th style={styles.filterTh}></th>
              </tr>
            </thead>

            {/* ================= TABLE BODY ================= */}
            <tbody>
              {paginatedRecords.map((row, index) => {
                let statusDisplay;
                if (row.status === "APPROVED") {
                  statusDisplay = "Rake Loading Completed";
                } else if (row.status === "CANCELLED") {
                  statusDisplay = "Cancelled Indent";
                } else {
                  statusDisplay = "Rake Loading In Progress";
                }

                return (
                  <tr
                    key={`${row.train_id}-${row.indent_number || index}`}
                    style={{
                      backgroundColor: "#dbdbdbff"
                    }}
                  >
                    {role === "CUSTOMER" ? (
                      <>
                        <td style={styles.td}>{row.siding || "-"}</td>
                        <td style={styles.td}>{row.indent_number || "-"}</td>
                        <td style={styles.td}>
                          {formatDateTime(row.rake_loading_start_datetime)}
                        </td>
                        <td style={styles.td}>{row.total_wagons_loaded || 0}</td>
                        <td style={styles.td}>{row.number_of_indent_wagons || 0}</td>
                        <td style={styles.td}>{row.total_bags_loaded || 0}</td>
                        <td style={styles.td}>{row.commodity || "-"}</td>
                        <td style={styles.td}>{row.siding || "-"}</td>
                        <td style={styles.td}>{row.wagon_destination || "-"}</td>
                        <td style={styles.td}>
                          {formatDateTime(row.rake_loading_end_actual)}
                        </td>
                        <td style={{ ...styles.td, background: "#dbdbdbff", fontWeight: "700" }}>
                          {statusDisplay}
                        </td>
                        <td style={styles.actionTd}>
                          <IconButton
                            label="View"
                            onClick={() => {
                              const url = row.indent_number
                                ? `/view/${encodeURIComponent(row.train_id)}?indent_number=${encodeURIComponent(row.indent_number)}`
                                : `/view/${encodeURIComponent(row.train_id)}`;
                              navigate(url);
                            }}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={styles.td}>{row.train_id}</td>
                        <td style={styles.td}>{row.indent_number || "-"}</td>
                        <td style={styles.td}>{row.siding || "-"}</td>
                        <td style={styles.td}>{row.customer_name || "-"}</td>
                        <td style={styles.td}>{row.wagon_destination || "-"}</td>
                        <td style={styles.td}>{row.commodity || "-"}</td>
                        <td style={styles.td}>
                          {formatDateTime(row.rake_loading_start_datetime)}
                        </td>
                        <td style={styles.td}>
                          {formatDateTime(row.rake_loading_end_actual)}
                        </td>
                        <td style={styles.td}>{row.total_bags_loaded}</td>
                        <td style={styles.td}>{row.total_bags_to_be_loaded ?? "-"}</td>
                        <td style={{ ...styles.td, background: "#dbdbdbff", fontWeight: "700" }}>
                          {statusDisplay}
                        </td>
                        <td style={styles.actionTd}>
                          <IconButton
                            label="View"
                            onClick={() => {
                              const url = row.indent_number
                                ? `/view/${encodeURIComponent(row.train_id)}?indent_number=${encodeURIComponent(row.indent_number)}`
                                : `/view/${encodeURIComponent(row.train_id)}`;
                              navigate(url);
                            }}
                          />

                          {(role === "ADMIN" || role === "SUPER_ADMIN") && (
                            (() => {
                              const isUnassigned =
                                !row.assigned_reviewer ||
                                String(row.assigned_reviewer).trim() === "";
                              const isRevokedBySuperAdmin = !!row.revoked_by_superadmin;

                              let canEdit = false;
                              // ✅ Only enable edit if bag count has started for at least one wagon
                              const hasBagCountStarted = (row.total_bags_loaded || 0) > 0;
                              
                              if (role === "ADMIN") {
                                // Admin can edit drafts, rejected, or in-progress
                                // BUT NOT rows that were revoked by a Super Admin.
                                // BUT NOT rows that are assigned to a reviewer (once assigned, admin loses edit access)
                                // ✅ FIX: Explicitly exclude PENDING_APPROVAL and APPROVED statuses
                                // ✅ FIX: Prevent editing when task is assigned to a reviewer
                                // ✅ Only enable edit if bag count has started
                                canEdit =
                                  hasBagCountStarted &&
                                  !isRevokedBySuperAdmin &&
                                  isUnassigned && // ✅ FIX: Only allow edit if task is NOT assigned to a reviewer
                                  row.status !== "PENDING_APPROVAL" &&
                                  row.status !== "APPROVED" &&
                                  (
                                    row.status === "DRAFT" ||
                                    row.status === "REJECTED" ||
                                    row.status === "LOADING_IN_PROGRESS"
                                  );
                              } else if (role === "SUPER_ADMIN") {
                                // SuperAdmin can edit ONLY in-progress rows they see (i.e. ones they revoked)
                                // Approved rows and pending approval rows remain view-only.
                                // ✅ FIX: Explicitly exclude PENDING_APPROVAL and APPROVED statuses
                                // ✅ Only enable edit if bag count has started
                                canEdit = hasBagCountStarted && row.status === "LOADING_IN_PROGRESS";
                              }

                              return (
                                canEdit && (
                                  <IconButton
                                    label="Edit"
                                    onClick={() =>
                                      handleEditClick(row.train_id, row.indent_number)
                                    }
                                  />
                                )
                              );
                            })()
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>


        {/* ================= PAGINATION ================= */}
        {filteredRecords.length > 0 && totalPages > 1 && (
          <div style={styles.paginationWrapper}>
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
              style={{
                ...styles.paginationArrow,
                opacity: page === 1 ? 0.3 : 1,
              }}
                >
              ◀
                </button>

            <div style={styles.pageInfo}>Page {page}</div>

                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
              style={{
                ...styles.paginationArrow,
                opacity: page === totalPages ? 0.3 : 1,
              }}
                >
              ▶
                </button>
          </div>
        )}

      </div>

      <EditOptionsPopup
        open={showEditPopup}
        onClose={() => setShowEditPopup(false)}
        onProceed={handleEditProceed}
      />
    </AppShell>
  );
}

/* ================= COMPONENTS ================= */

function SummaryCard({ title, value, onClick }) {
  return (
    <div
      style={{
        ...styles.card,
        cursor: onClick ? "pointer" : "default"
      }}
      onClick={onClick}
    >
      <div style={styles.cardTitle}>
        {title} = <span style={styles.cardValue}>{value}</span>
      </div>
    </div>
  );
}





/* ================= STYLES ================= */

const styles = {
  mainContent: { 
    padding: "24px",
    backgroundColor: "#ffffffff",
    minHeight: "100vh"
  },

  summaryWrapper: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    marginBottom: "32px",
  },

  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "20px",
  },

  speedometerContainer: {
    display: "flex",
    gap: "60px",
    justifyContent: "center",
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: "32px",
    width: "100%",
  },

  card: {
    backgroundColor: "#dbdbdbff",
    padding: "20px",
    borderRadius: "2px",
  },

  cardTitle: {
    fontSize: "18px",
    fontWeight: 700,
    marginBottom: "0px",
    color: "#000000",
  },

  cardValue: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#000000",
    display: "inline",
  },

  filterBar: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: "10px",
    gap: "16px",
  },

  resetBtn: {
    padding: "10px 16px",
    border: "1px solid #808080",
    background: "#dbdbdbff",
    cursor: "pointer",
    fontSize: "14px",
    borderRadius: "4px",
    fontWeight: "600",
  },

  tableContainer: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    // border: "0.48px solid #000000",
  },

  table: {
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "separate",
    borderSpacing: "8px 16px", // column-gap row-gap
  },


  th: {
    backgroundColor: "#0B3A6E",
    color: "white",
    padding: "12px 8px",
    fontSize: "11px",
    textAlign: "center",
    fontWeight: "600",
    // border: "0.48px solid #000000",
  },

  filterTh: {
    backgroundColor: "#FFFFFF",
  },

  td: {
    padding: "16px 8px",
    fontSize: "11px",
    textAlign: "center",
    // border: "0.48px solid #000000",
    color: "#000000",
  },

  filterRowTd: {
    padding: "0",               
    height: "56px",               
    textAlign: "center",
    verticalAlign: "middle",
  },

  filterInput: {
    width: "100%",
    height: "100%",                
    padding: "9px 6px",
    fontSize: "11px",
    outline: "none",
    backgroundColor: "#FFFFFF",
    textAlign: "center",
    boxSizing: "border-box",
    border: "0.48px solid #000000",
  },


  actionTd: {
    padding: "20px 8px",
    display: "flex",
    justifyContent: "center",
    gap: "20px",
    alignItems: "center",
  },

  iconButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: "14px",
    paddingLeft: "5px",   
  },



  paginationWrapper: {
    marginTop: "24px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "150px",
    fontSize: "16px",
  },

  paginationArrow: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "24px",
    padding: "8px",
    color: "#000",
  },

  pageInfo: {
    fontSize: "16px",
    fontWeight: 500,
    color: "#000",
  },


};


export default Dashboard;
