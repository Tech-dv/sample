import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "./AppShell";
import { cardStyles, getButtonStyle } from "./styles";
import { API_BASE } from "./api";
import { formatActivityText } from "./utils/formatActivityText";
import WarningPopup from "./components/WarningPopup";
import sackVideo from "./assets/sack.mp4";
import trainVideo from "./assets/train_video.mp4";


const REFRESH_INTERVAL = 5000;

function ViewTrain() {
  const { trainId: encodedTrainId } = useParams();
  const trainId = encodedTrainId ? decodeURIComponent(encodedTrainId) : null;
  const [searchParams] = useSearchParams();
  const indentNumber = searchParams.get('indent_number');
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("WAGON");
  const [activities, setActivities] = useState([]);
  const [warning, setWarning] = useState({ open: false, message: "", title: "Warning" });
  
  // Video feed popup state
  const [showVideoPopup, setShowVideoPopup] = useState(false);
  const [videoType, setVideoType] = useState("raw"); // "raw" or "live"
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);

  const role = localStorage.getItem("role");
  const isCustomer = role === "CUSTOMER";
  const isAdmin = role === "ADMIN";
  const isSuperAdmin = role === "SUPER_ADMIN";

  /* ================= REVOKE HANDLER ================= */
  const handleRevoke = async () => {
    const confirmRevoke = window.confirm(
      "Are you sure you want to revoke this submission? This will remove the task from the submissions list."
    );

    if (!confirmRevoke) return;

    try {
      const url = indentNumber
        ? `${API_BASE}/train/${encodeURIComponent(trainId)}/revoke?indent_number=${encodeURIComponent(indentNumber)}`
        : `${API_BASE}/train/${encodeURIComponent(trainId)}/revoke`;

      const username = localStorage.getItem("username");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
        },
        body: JSON.stringify({
          indent_number: indentNumber || null,
          username: username, // Send username for activity timeline
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to revoke");
      }

      const result = await res.json();
      setWarning({ open: true, message: result.message, title: "Information" });

      // After revoke, take user directly to the appropriate edit screen
      // without needing to go back and click Edit again.
      if (activeTab === "WAGON") {
        // Go to TrainEdit (wagon details)
        const editUrl = indentNumber
          ? `/train/${encodeURIComponent(trainId)}/edit?indent_number=${encodeURIComponent(indentNumber)}`
          : `/train/${encodeURIComponent(trainId)}/edit`;
        navigate(editUrl);
      } else if (activeTab === "RAKE") {
        // Go to DispatchPage (rake details)
        const dispatchUrl = indentNumber
          ? `/train/${encodeURIComponent(trainId)}/dispatch?indent_number=${encodeURIComponent(indentNumber)}`
          : `/train/${encodeURIComponent(trainId)}/dispatch`;
        navigate(dispatchUrl);
      } else {
        // Fallback: refresh data if some other tab
        fetchTrainData();
        fetchActivityTimeline();
      }
    } catch (err) {
      console.error("Revoke error:", err);
      setWarning({ open: true, message: `Failed to revoke: ${err.message}`, title: "Error" });
    }
  };

  /* ================= FETCH TRAIN ================= */
  const fetchTrainData = async () => {
    try {
      const customerId = localStorage.getItem("customerId");

      // Build URL with indent_number query parameter if provided
      const url = indentNumber
        ? `${API_BASE}/train/${encodeURIComponent(trainId)}/view?indent_number=${encodeURIComponent(indentNumber)}`
        : `${API_BASE}/train/${encodeURIComponent(trainId)}/view`;

      const res = await fetch(
        url,
        {
          headers: {
            "x-user-role": role,
            ...(role === "CUSTOMER" && {
              "x-customer-id": customerId,
            }),
          },
        }
      );

      if (!res.ok) throw new Error("Access denied");

      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch train data", err);
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

  /* ================= AUTO REFRESH ================= */
  useEffect(() => {
    fetchTrainData();
    fetchActivityTimeline();
    const interval = setInterval(() => {
      fetchTrainData();
      fetchActivityTimeline();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [trainId, indentNumber, role]);

  /* ================= VIDEO HANDLERS ================= */
  const handleViewClick = () => {
    setVideoType("raw"); // Default to raw
    setShowVideoPopup(true);
  };

  const handleCloseVideoPopup = () => {
    setShowVideoPopup(false);
  };

  const handleDownloadClick = () => {
    setShowDownloadPopup(true);
  };

  const handleCloseDownloadPopup = () => {
    setShowDownloadPopup(false);
  };

  const handleDownloadRawVideo = () => {
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = sackVideo;
    link.download = 'raw_video.mp4';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowDownloadPopup(false);
  };

  if (!data) return <p>Loading...</p>;

  const { header, wagons, dispatch } = data;
  const isAssignedToReviewer =
    header &&
    header.assigned_reviewer &&
    String(header.assigned_reviewer).trim() !== "";

  const canAdminRevoke =
    isAdmin &&
    header &&
    header.status === "PENDING_APPROVAL" &&
    !isAssignedToReviewer;

  const canSuperAdminRevoke =
    isSuperAdmin && header && header.status === "APPROVED";

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

  return (
    <AppShell>
      <div style={{ backgroundColor: "#FFFFFF", minHeight: "100vh", padding: "0" }}>

        {/* ================= TAB BUTTONS ================= */}
        <div style={tabStyles.container}>
          <button
            style={{
              ...tabStyles.button,
              ...(activeTab === "WAGON" ? tabStyles.activeButton : {}),
            }}
            onClick={() => setActiveTab("WAGON")}
          >
            Wagon Details
          </button>

        <button
            style={{
              ...tabStyles.button,
              ...(activeTab === "RAKE" ? tabStyles.activeButton : {}),
            }}
          onClick={() => setActiveTab("RAKE")}
        >
          Rake Details
        </button>

        <button
            style={{
              ...tabStyles.button,
              ...(activeTab === "VIDEO" ? tabStyles.activeButton : {}),
            }}
          onClick={() => setActiveTab("VIDEO")}
        >
            Video Feeds
        </button>
      </div>

        {/* ================= WAGON DETAILS ================= */}
        {activeTab === "WAGON" && (
        <>
          {/* Train Information Card */}
          <div style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "6px",
            padding: "20px",
            margin: "0 20px 20px",
          }}>
            <div style={topGridStyles.container}>
              <ReadOnlyField
                label="Rake Serial Number"
                value={header.rake_serial_number || header.train_id || "-"}
              />

              <ReadOnlyField
                label="Indent Number"
                value={header.indent_number || "-"}
              />

              <ReadOnlyField
                label="Wagon Destination"
                value={header.wagon_destination || "-"}
              />

              {!isCustomer && (
                <ReadOnlyField
                  label="Party / Customer's Name"
                  value={header.customer_name || "-"}
                />
          )}
        </div>
          </div>

          {/* Wagon Table */}
          <div style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "6px",
            padding: "20px",
            margin: "0 20px 20px",
          }}>
          <div style={{ overflowX: "auto" }}>
            <table style={wagonTableStyles.container}>
              <thead>
                <tr>
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
                {wagons.map((w, i) => {
                  const sealNumbers = w.seal_number 
                    ? w.seal_number.split(",").map(s => s.trim()).filter(Boolean)
                    : ["-"];
                  
                  return (
                    <tr key={i} style={wagonTableStyles.row(i)}>
                      <td style={wagonTableStyles.readOnlyCell}>
                        {w.wagon_number || "-"}
                      </td>

                      <td style={wagonTableStyles.readOnlyCell}>
                        {w.wagon_type || "-"}
                      </td>

                      <td style={wagonTableStyles.readOnlyCell}>
                        {w.cc_weight || "-"}
                      </td>

                      <td style={wagonTableStyles.readOnlyCell}>
                        {w.sick_box ? "Yes" : "No"}
                      </td>

                      <td style={wagonTableStyles.readOnlyCell}>
                        {w.wagon_to_be_loaded || "-"}
                      </td>

                      <td style={wagonTableStyles.readOnlyCell}>
                        {w.commodity || "-"}
                      </td>

                      <td style={wagonTableStyles.readOnlyCell}>{w.tower_number}</td>
                      <td style={wagonTableStyles.readOnlyCell}>{w.loaded_bag_count}</td>
                      <td style={wagonTableStyles.readOnlyCell}>{w.unloaded_bag_count}</td>
                      <td style={wagonTableStyles.readOnlyCell}>{formatDateTime(w.loading_start_time)}</td>
                      <td style={wagonTableStyles.readOnlyCell}>{formatDateTime(w.loading_end_time)}</td>

                      <td style={{...wagonTableStyles.readOnlyCell, padding: "8px", position: "relative"}}>
                        <div style={{ 
                          display: "flex", 
                          flexDirection: "column", 
                          gap: "4px",
                          paddingBottom: sealNumbers.length > 1 ? "28px" : "0"
                        }}>
                          {sealNumbers.map((seal, sealIdx) => (
                            <div
                              key={sealIdx}
                              style={{
                                padding: "6px",
                                fontSize: "11px",
                                textAlign: "center",
                                color: "#000000",
                              }}
                            >
                              {seal}
                            </div>
                          ))}
                        </div>
                      </td>

                      <td style={wagonTableStyles.readOnlyCell}>{w.stoppage_time || "-"}</td>

                      <td style={wagonTableStyles.readOnlyCell}>
                        {w.remarks || "-"}
                      </td>

                      <td style={wagonTableStyles.readOnlyCell}>
                        <div
                          style={{
                            width: "46px",
                            height: "24px",
                            backgroundColor: w.loading_status ? "#4CAF50" : "#ccc",
                            borderRadius: "24px",
                            position: "relative",
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
                              boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
                            }}
                          />
                        </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        </>
        )}

        {/* ================= RAKE DISPATCH DETAILS ================= */}
        {activeTab === "RAKE" && (
          <div style={rakePageStyles.container}>
            <div style={rakePageStyles.topSection}>
              {/* Left: Main Form Area */}
              <div style={rakePageStyles.formContainer}>
                <div style={rakePageStyles.grid}>
                  <DispatchField label="Source" value="KSLK" />
                  <DispatchField label="Rake Serial Number" value={header.rake_serial_number || header.train_id || "-"} />
                  <DispatchField label="Siding" value={header.siding || "-"} />

                  <DispatchField label="Number of Indent Wagons" value={dispatch?.indent_wagon_count || "-"} />
                  <DispatchField label="Vessel Name" value={dispatch?.vessel_name || "-"} />
                  <DispatchField label="Type Of Rake" value={dispatch?.rake_type || "-"} />

                  <DispatchField label="Rake Placement Date & Time" value={formatDateTime(dispatch?.rake_placement_datetime)} />
                  <DispatchField label="Rake Clearance Time" value={formatDateTime(dispatch?.rake_clearance_datetime)} />
                  <DispatchField label="Rake Idle time" value={dispatch?.rake_idle_time || "-"} />

                  <DispatchField label="Rake Loading Start Date & Time" value={formatDateTime(dispatch?.rake_loading_start_datetime)} />
                  <DispatchField label="Rake Loading End Date & Time Actual" value={formatDateTime(dispatch?.rake_loading_end_actual)} />
                  <DispatchField label="Rake Loading End Date & Time Railway" value={formatDateTime(dispatch?.rake_loading_end_railway)} />

                  <DispatchField label="Door Closing Date & Time" value={formatDateTime(dispatch?.door_closing_datetime)} />
                  <DispatchField label="Rake Haul Out Date & Time" value={formatDateTime(dispatch?.rake_haul_out_datetime)} />
                </div>
              </div>

              {/* Right: Activity Timeline */}
              <div style={activityTimelineStyles.container}>
                <div style={activityTimelineStyles.header}>Activity Timeline</div>
                <div style={activityTimelineStyles.content}>
                  {activities.length > 0 ? (
                    activities.map((dateGroup, index) => (
                      <div key={index} style={activityTimelineStyles.dateGroup}>
                        <div style={activityTimelineStyles.date}>{dateGroup.date}</div>
                        <div style={activityTimelineStyles.activitiesList}>
                          {dateGroup.activities.map((activity, actIndex) => {
                            // ✅ FIX: Hide REVIEWER_EDITED activities (these are rake/dispatch changes, shown only in Excel)
                            if (activity.activity_type === 'REVIEWER_EDITED') {
                              return null; // Hide rake/dispatch changes from timeline
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

                              return (
                                <div key={actIndex} style={activityTimelineStyles.activityItem}>
                                  <span style={activityTimelineStyles.bullet}>•</span>
                                  <div style={{ flex: 1 }}>
                                    <div style={activityTimelineStyles.text}>
                                      Reviewer made changes in wagon: {formatTime(activity.timestamp)}
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            
                            const formattedText = formatActivityText(activity.text);
                            const isReviewedAndApproved = activity.text && activity.text.includes('reviewed and approved');
                            
                            return (
                              <div key={actIndex}>
                                <div style={activityTimelineStyles.activityItem}>
                                  <span style={activityTimelineStyles.bullet}>•</span>
                                  <span style={activityTimelineStyles.text}>{formattedText}</span>
                                </div>
                                {isReviewedAndApproved && (
                                  <div style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
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
                                          setWarning({ open: true, message: "Failed to download Excel file. Please try again.", title: "Error" });
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
                    <div style={activityTimelineStyles.item}>
                      <div style={activityTimelineStyles.date}>-</div>
                      <div style={activityTimelineStyles.text}>
                        No activity recorded yet.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Last row with 4 columns */}
            <div style={rakePageStyles.lastRow}>
              <DispatchField label="Loading Start Officer" value={dispatch?.loading_start_officer || "-"} />
              <DispatchField label="Loading Completion Officer" value={dispatch?.loading_completion_officer || "-"} />
              <DispatchField label="Remarks(Operations)" value={dispatch?.remarks || "-"} />
              <DispatchField label="RR Number" value={dispatch?.rr_number || "-"} />
          </div>
        </div>
      )}

      {/* ================= VIDEO FEED ================= */}
      {activeTab === "VIDEO" && (
        <div style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "6px",
          padding: "20px",
          margin: "0 20px 20px",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={wagonTableStyles.container}>
            <thead>
              <tr>
                  <th style={wagonTableStyles.header}>Wagon Number</th>
                  <th style={wagonTableStyles.header}>Camera Number</th>
                  <th style={wagonTableStyles.header}>Tower Number</th>
                  <th style={wagonTableStyles.header}>Video Feed</th>
              </tr>
            </thead>
            <tbody>
              {wagons.map((w, i) => (
                  <tr key={i} style={wagonTableStyles.row(i)}>
                    <td style={wagonTableStyles.readOnlyCell}>
                      {w.wagon_number || "-"}
                    </td>
                    <td style={wagonTableStyles.readOnlyCell}>
                      -
                    </td>
                    <td style={wagonTableStyles.readOnlyCell}>
                      {w.tower_number}
                    </td>
                    <td style={{...wagonTableStyles.readOnlyCell, display: "flex", gap: "8px", justifyContent: "center", padding: "10px"}}>
                      <button 
                        style={getButtonStyle("action")}
                        onClick={handleViewClick}
                      >
                        ▶ View
                      </button>
                      <button 
                        style={getButtonStyle("action")}
                        onClick={handleDownloadClick}
                      >
                      ⬇ Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

        {/* ================= FOOTER ================= */}
        <div style={{ display: "flex", justifyContent: "space-between", margin: "30px 20px 20px", gap: "10px" }}>
          {/* Left side: Revoke button (ADMIN before assignment, SUPER_ADMIN for approved) */}
          <div>
            {activeTab !== "VIDEO" && (canAdminRevoke || canSuperAdminRevoke) && (
              <button
                style={getButtonStyle("delete")}
                onClick={handleRevoke}
              >
                ⚠ Revoke
              </button>
            )}
          </div>

          {/* Right side: Close and Next buttons */}
          <div style={{ display: "flex", gap: "10px" }}>
          <button
            style={getButtonStyle("cancel")}
            onClick={() => navigate("/dashboard")}
          >
            Close
          </button>
          
          {/* Show Next button only for Wagon Details and Rake Details tabs */}
          {activeTab !== "VIDEO" && (
      <button
              style={getButtonStyle("proceed")}
              onClick={() => {
                if (activeTab === "WAGON") {
                  setActiveTab("RAKE");
                } else if (activeTab === "RAKE") {
                  setActiveTab("VIDEO");
                }
              }}
      >
              Next
      </button>
          )}
          </div>
        </div>

      </div>
      <WarningPopup
        open={warning.open}
        onClose={() => setWarning({ open: false, message: "", title: "Warning" })}
        message={warning.message}
        title={warning.title}
      />

      {/* Video Popup */}
      {showVideoPopup && (
        <VideoPopup
          open={showVideoPopup}
          onClose={handleCloseVideoPopup}
          videoType={videoType}
          onVideoTypeChange={setVideoType}
          rawVideoSrc={sackVideo}
          liveVideoSrc={trainVideo}
        />
      )}

      {/* Download Popup */}
      {showDownloadPopup && (
        <DownloadPopup
          open={showDownloadPopup}
          onClose={handleCloseDownloadPopup}
          onDownloadRaw={handleDownloadRawVideo}
        />
      )}
    </AppShell>
  );
}

/* ================= VIDEO POPUP COMPONENT ================= */
function VideoPopup({ open, onClose, videoType, onVideoTypeChange, rawVideoSrc, liveVideoSrc }) {
  const videoRef = useRef(null);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (videoRef.current && videoType === "live") {
      const video = videoRef.current;
      
      // Prevent any seeking on live video - force forward progression only
      const handleSeeking = () => {
        // Reset to last valid time if user tries to seek backward
        if (video.currentTime < lastTimeRef.current) {
          video.currentTime = lastTimeRef.current;
        }
      };

      const handleTimeUpdate = () => {
        // Update last valid time only if moving forward
        if (video.currentTime >= lastTimeRef.current) {
          lastTimeRef.current = video.currentTime;
        } else {
          // If somehow time went backward, reset it
          video.currentTime = lastTimeRef.current;
        }
      };

      // Prevent seeking via mouse drag on progress bar
      const handleSeeked = () => {
        if (video.currentTime < lastTimeRef.current) {
          video.currentTime = lastTimeRef.current;
        }
      };

      video.addEventListener("seeking", handleSeeking);
      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("timeupdate", handleTimeUpdate);

      return () => {
        video.removeEventListener("seeking", handleSeeking);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("timeupdate", handleTimeUpdate);
      };
    }
  }, [videoType]);

  useEffect(() => {
    // Reset when switching video types and auto-play live video
    lastTimeRef.current = 0;
    if (videoRef.current) {
      if (videoType === "live") {
        // Auto-play live video when switched to live
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(err => {
          console.error("Auto-play failed:", err);
        });
      } else {
        videoRef.current.currentTime = 0;
      }
    }
  }, [videoType]);

  if (!open) return null;

  const currentVideoSrc = videoType === "raw" ? rawVideoSrc : liveVideoSrc;
  const isLive = videoType === "live";

  return (
    <div style={videoPopupStyles.overlay} onClick={onClose}>
      <div style={videoPopupStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={videoPopupStyles.header}>
          <div style={videoPopupStyles.navContainer}>
            <button
              style={{
                ...videoPopupStyles.navButton,
                ...(videoType === "raw" ? videoPopupStyles.navButtonActive : {}),
              }}
              onClick={() => onVideoTypeChange("raw")}
            >
              Analytics
            </button>
            <button
              style={{
                ...videoPopupStyles.navButton,
                ...(videoType === "live" ? videoPopupStyles.navButtonActive : {}),
              }}
              onClick={() => onVideoTypeChange("live")}
            >
              Live
            </button>
          </div>
          <button
            style={videoPopupStyles.closeButton}
            onClick={onClose}
            onMouseOver={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.2)"}
            onMouseOut={(e) => e.target.style.backgroundColor = "transparent"}
            title="Close"
          >
            ×
          </button>
        </div>
        <div style={videoPopupStyles.videoContainer}>
          <video
            ref={videoRef}
            key={videoType} // Force re-render when switching types
            controls={!isLive}
            controlsList={isLive ? "nodownload nofullscreen noremoteplayback" : undefined}
            disablePictureInPicture={isLive}
            autoPlay
            style={videoPopupStyles.video}
            src={currentVideoSrc}
            onLoadedMetadata={() => {
              if (videoRef.current && isLive) {
                // For live video, start from beginning and auto-play
                videoRef.current.currentTime = 0;
                lastTimeRef.current = 0;
                videoRef.current.play().catch(err => {
                  console.error("Auto-play failed:", err);
                });
              }
            }}
            onContextMenu={(e) => {
              // Disable right-click context menu on live video
              if (isLive) {
                e.preventDefault();
              }
            }}
            onDoubleClick={() => {
              // Toggle fullscreen on double-click for live video
              if (isLive && videoRef.current) {
                const video = videoRef.current;
                
                // Check if already in fullscreen
                const isFullscreen = 
                  document.fullscreenElement ||
                  document.webkitFullscreenElement ||
                  document.mozFullScreenElement ||
                  document.msFullscreenElement;
                
                if (isFullscreen) {
                  // Exit fullscreen
                  if (document.exitFullscreen) {
                    document.exitFullscreen();
                  } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                  } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                  } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                  }
                } else {
                  // Enter fullscreen
                  if (video.requestFullscreen) {
                    video.requestFullscreen().catch(err => {
                      console.error("Fullscreen request failed:", err);
                    });
                  } else if (video.webkitRequestFullscreen) {
                    // Safari support
                    video.webkitRequestFullscreen();
                  } else if (video.mozRequestFullScreen) {
                    // Firefox support
                    video.mozRequestFullScreen();
                  } else if (video.msRequestFullscreen) {
                    // IE/Edge support
                    video.msRequestFullscreen();
                  }
                }
              }
            }}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    </div>
  );
}

/* ================= DOWNLOAD POPUP COMPONENT ================= */
function DownloadPopup({ open, onClose, onDownloadRaw }) {
  if (!open) return null;

  return (
    <div style={downloadPopupStyles.overlay} onClick={onClose}>
      <div style={downloadPopupStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={downloadPopupStyles.header}>
          Download Video
          <button
            style={downloadPopupStyles.closeButton}
            onClick={onClose}
            onMouseOver={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.2)"}
            onMouseOut={(e) => e.target.style.backgroundColor = "transparent"}
            title="Close"
          >
            ×
          </button>
        </div>
        <div style={downloadPopupStyles.body}>
          <button
            style={downloadPopupStyles.downloadButton}
            onClick={onDownloadRaw}
            onMouseOver={(e) => e.target.style.backgroundColor = "#45a049"}
            onMouseOut={(e) => e.target.style.backgroundColor = "#4CAF50"}
          >
            ⬇ Download Analytics Video
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= READ-ONLY FIELD (LIKE TRAINEDIT) ================= */
function ReadOnlyField({ label, value }) {
  return (
    <div style={floatingField.wrapper}>
      <div style={floatingField.label}>{label}</div>
      <div style={floatingField.value}>{value}</div>
    </div>
  );
}

/* ================= DISPATCH FIELD (EXACTLY LIKE DISPATCHPAGE - READ-ONLY) ================= */
function DispatchField({ label, value }) {
  return (
    <fieldset style={dispatchFieldStyles.fieldset}>
      <legend style={dispatchFieldStyles.legend}>{label}</legend>
      <input
        type="text"
        value={value || "-"}
        readOnly
        style={dispatchFieldStyles.input}
      />
    </fieldset>
  );
}

/* ================= STYLES ================= */

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
  value: {
    width: "100%",
    fontSize: "16px",
    textAlign: "center",
    color: "#000",
    fontWeight: "400",
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
    backgroundColor: "#cccccc",
  },

  readOnlyInput: {
    width: "100%",
    padding: "16px 8px",
    fontSize: "11px",
    textAlign: "center",
    backgroundColor: "transparent",
    boxSizing: "border-box",
    color: "#000000",
  },
};

const dispatchGridStyles = {
  container: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "18px 20px",
  },
};

const rakePageStyles = {
  container: {
    padding: "30px 40px",
    background: "#ffffff",
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
};

const dispatchFieldStyles = {
  fieldset: {
    border: "1px solid #333",
    borderRadius: "4px",
    padding: "14px 12px 10px",
    margin: 0,
    position: "relative",
    background: "#f4f4f4",
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
    background: "#f4f4f4",
  },
};

const activityTimelineStyles = {
  container: {
    width: "320px",
    background: "#ffffff",
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

const tabStyles = {
  container: {
    display: "flex",
    gap: "10px",
    margin: "20px 20px 20px",
    borderBottom: "2px solid #e0e0e0",
    paddingBottom: "0",
  },
  button: {
    padding: "12px 24px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    color: "#666",
    borderBottom: "3px solid transparent",
    transition: "all 0.3s ease",
    position: "relative",
    bottom: "-2px",
  },
  activeButton: {
    color: "#0B3A6E",
    borderBottom: "3px solid #0B3A6E",
    fontWeight: "600",
  },
};

const videoPopupStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    overflow: "hidden",
    width: "90%",
    maxWidth: "1200px",
    maxHeight: "90vh",
    boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    backgroundColor: "#0B3A6E",
    color: "white",
    padding: "20px",
    fontSize: "20px",
    fontWeight: "700",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navContainer: {
    display: "flex",
    gap: "10px",
  },
  navButton: {
    padding: "8px 20px",
    backgroundColor: "rgba(255,255,255,0.2)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  navButtonActive: {
    backgroundColor: "rgba(255,255,255,0.9)",
    color: "#0B3A6E",
    border: "1px solid rgba(255,255,255,0.9)",
  },
  closeButton: {
    backgroundColor: "transparent",
    border: "none",
    color: "white",
    fontSize: "28px",
    fontWeight: "700",
    cursor: "pointer",
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    transition: "background-color 0.2s",
    lineHeight: "1",
    padding: 0,
  },
  videoContainer: {
    padding: "20px",
    backgroundColor: "#000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "400px",
  },
  video: {
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    maxHeight: "70vh",
  },
};

const downloadPopupStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    overflow: "hidden",
    width: "450px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
  },
  header: {
    backgroundColor: "#0B3A6E",
    color: "white",
    padding: "20px",
    fontSize: "18px",
    fontWeight: "700",
    textAlign: "center",
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: "10px",
    right: "10px",
    backgroundColor: "transparent",
    border: "none",
    color: "white",
    fontSize: "24px",
    fontWeight: "700",
    cursor: "pointer",
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    transition: "background-color 0.2s",
    lineHeight: "1",
    padding: 0,
  },
  body: {
    padding: "30px 20px",
    textAlign: "center",
  },
  downloadButton: {
    padding: "12px 30px",
    backgroundColor: "#4CAF50",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
    transition: "background-color 0.2s",
  },
};

export default ViewTrain;
