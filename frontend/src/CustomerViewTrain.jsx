import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "./AppShell";
import { API_BASE } from "./api";
import sackVideo from "./assets/sack.mp4";
import trainVideo from "./assets/train_video.mp4";
import { idToUrlParam, urlParamToId } from "./utils/trainIdUtils";

const REFRESH_INTERVAL = 5000;

function CustomerViewTrain() {
  const { trainId: encodedTrainId } = useParams();
  const trainId = encodedTrainId ? urlParamToId(encodedTrainId) : null;
  const [searchParams] = useSearchParams();
  const indentNumber = searchParams.get("indent_number");
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("rake"); // "rake" or "video"
  const [currentWagonIndex, setCurrentWagonIndex] = useState(0); // for Rake Details per-wagon navigation

  // Video feed popup state
  const [showVideoPopup, setShowVideoPopup] = useState(false);
  const [videoType, setVideoType] = useState("raw");
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);

  const role = localStorage.getItem("role");

  /* ================= FETCH TRAIN ================= */
  const fetchTrainData = async () => {
    try {
      const customerId = localStorage.getItem("customerId");
      const url = indentNumber
        ? `${API_BASE}/train/${idToUrlParam(trainId)}/view?indent_number=${encodeURIComponent(indentNumber)}`
        : `${API_BASE}/train/${idToUrlParam(trainId)}/view`;

      const res = await fetch(url, {
        headers: {
          "x-user-role": role,
          "x-customer-id": customerId,
        },
      });

      if (!res.ok) throw new Error("Access denied");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch train data", err);
    }
  };

  /* ================= AUTO REFRESH ================= */
  useEffect(() => {
    fetchTrainData();
    const interval = setInterval(fetchTrainData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [trainId, indentNumber, role]);

  /* ================= VIDEO HANDLERS ================= */
  const handleViewClick = () => {
    setVideoType("raw");
    setShowVideoPopup(true);
  };

  const handleCloseVideoPopup = () => setShowVideoPopup(false);

  const handleDownloadClick = () => setShowDownloadPopup(true);

  const handleCloseDownloadPopup = () => setShowDownloadPopup(false);

  const handleDownloadRawVideo = () => {
    const link = document.createElement("a");
    link.href = sackVideo;
    link.download = "raw_video.mp4";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowDownloadPopup(false);
  };

  /* ================= FORMAT ================= */
  const formatDateTime = (value) => {
    if (!value) return "";
    try {
      const date = new Date(value);
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${month}/${day}/${year}\n${hours}:${minutes}`;
    } catch (e) {
      return "";
    }
  };

  if (!data) return <p style={{ textAlign: "center", marginTop: "60px", fontSize: "16px" }}>Loading...</p>;

  const { header, wagons, dispatch } = data;
  const isCompleted = header.status === "APPROVED";

  /* ================= SEARCH FILTER ================= */
  const term = searchTerm.toLowerCase().trim();
  const filteredWagons = term
    ? wagons.filter((w) => {
      const indent = (header.indent_number || "").toLowerCase();
      const wagonNum = (w.wagon_number || "").toLowerCase();
      const commodity = (w.commodity || "").toLowerCase();
      return indent.includes(term) || wagonNum.includes(term) || commodity.includes(term);
    })
    : wagons;

  /* ========== IN-PROGRESS VIEW (no tabs) ========== */
  if (!isCompleted) {
    return (
      <AppShell>
        <div style={styles.page}>
          {/* Search Bar */}
          <div style={styles.searchRow}>
            <div style={styles.searchBox}>
              <input
                type="text"
                placeholder="Search by Indent/Wagon Number/Commodity"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
              <span style={styles.searchIcon}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
            </div>
          </div>

          {/* Wagon Cards */}
          <div style={styles.cardsScroll}>
            {filteredWagons.map((w, i) => (
              <WagonCardWithVideo
                key={i}
                indentNumber={header.indent_number}
                numberOfIndentWagons={wagons.length}
                wagonNumber={w.wagon_number}
                commodity={w.commodity}
                loadingStartDateTime={formatDateTime(w.loading_start_time)}
                onViewVideo={handleViewClick}
                onDownloadVideo={handleDownloadClick}
              />
            ))}
            {filteredWagons.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px", color: "#888", fontSize: "14px" }}>
                No wagons found matching your search.
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <button style={styles.closeBtn} onClick={() => navigate("/dashboard")}>Close</button>
          </div>
        </div>

        {/* Popups */}
        {showVideoPopup && (
          <VideoPopup open={showVideoPopup} onClose={handleCloseVideoPopup} videoType={videoType} onVideoTypeChange={setVideoType} rawVideoSrc={sackVideo} liveVideoSrc={trainVideo} />
        )}
        {showDownloadPopup && (
          <DownloadPopup open={showDownloadPopup} onClose={handleCloseDownloadPopup} onDownloadRaw={handleDownloadRawVideo} />
        )}
      </AppShell>
    );
  }

  /* ========== Current wagon for Rake Details per-wagon view ========== */
  const currentWagon = wagons[currentWagonIndex] || {};

  const handleNextWagon = () => {
    if (currentWagonIndex < wagons.length - 1) {
      setCurrentWagonIndex(currentWagonIndex + 1);
    }
  };

  const handlePrevWagon = () => {
    if (currentWagonIndex > 0) {
      setCurrentWagonIndex(currentWagonIndex - 1);
    }
  };

  /* ========== COMPLETED VIEW (with Rake Details / Video Feeds tabs) ========== */
  return (
    <AppShell>
      <div style={styles.page}>
        {/* ========== TAB BAR ========== */}
        <div style={styles.tabRow}>
          <div style={styles.tabContainer}>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === "rake" ? styles.tabBtnActive : {}) }}
              onClick={() => setActiveTab("rake")}
            >
              Rake Details
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === "video" ? styles.tabBtnActive : {}) }}
              onClick={() => setActiveTab("video")}
            >
              Video Feeds
            </button>
          </div>

          {/* Search – only shown on Video Feeds tab */}
          {activeTab === "video" && (
            <div style={styles.searchBox}>
              <input
                type="text"
                placeholder="Search by Indent/Wagon Number/Commodity"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
              <span style={styles.searchIcon}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
            </div>
          )}
        </div>

        {/* ========== TAB CONTENT ========== */}
        <div style={styles.cardsScroll}>
          {/* ---- RAKE DETAILS TAB ---- */}
          {activeTab === "rake" && (
            <RakeDetailGrid
              source="KSLK"
              numberOfIndentWagons={dispatch?.indent_wagon_count || wagons.length || "-"}
              vesselName={dispatch?.vessel_name || "-"}
              rakePlacementDateTime={formatDateTime(dispatch?.rake_placement_datetime)}
              bagsToBeLoaded={currentWagon.wagon_to_be_loaded || "-"}
              rakeLoadingStartDateTime={formatDateTime(dispatch?.rake_loading_start_datetime)}
              rakeLoadingEndDateTime={formatDateTime(dispatch?.rake_loading_end_actual)}
              doorClosingDateTime={formatDateTime(dispatch?.door_closing_datetime)}
              loadedBagCount={currentWagon.loaded_bag_count ?? "-"}
              unloadedBagCount={currentWagon.unloaded_bag_count ?? "-"}
              sealNumber={currentWagon.seal_number || "-"}
              rrNumber={dispatch?.rr_number || "-"}
            />
          )}

          {/* ---- VIDEO FEEDS TAB ---- */}
          {activeTab === "video" &&
            filteredWagons.map((w, i) => (
              <WagonCardWithVideo
                key={i}
                indentNumber={header.indent_number}
                numberOfIndentWagons={wagons.length}
                wagonNumber={w.wagon_number}
                commodity={w.commodity}
                loadingStartDateTime={formatDateTime(w.loading_start_time)}
                onViewVideo={handleViewClick}
                onDownloadVideo={handleDownloadClick}
              />
            ))}

          {activeTab === "video" && filteredWagons.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: "#888", fontSize: "14px" }}>
              No wagons found matching your search.
            </div>
          )}
        </div>

        {/* ========== FOOTER ========== */}
        <div style={styles.footer}>
          <button style={styles.closeBtn} onClick={() => navigate("/dashboard")}>Close</button>
          {activeTab === "rake" && wagons.length > 1 && (
            <button
              style={styles.nextBtn}
              onClick={currentWagonIndex < wagons.length - 1 ? handleNextWagon : handlePrevWagon}
            >
              {currentWagonIndex < wagons.length - 1 ? "Next" : "Previous"}
            </button>
          )}
        </div>
      </div>

      {/* Popups */}
      {showVideoPopup && (
        <VideoPopup open={showVideoPopup} onClose={handleCloseVideoPopup} videoType={videoType} onVideoTypeChange={setVideoType} rawVideoSrc={sackVideo} liveVideoSrc={trainVideo} />
      )}
      {showDownloadPopup && (
        <DownloadPopup open={showDownloadPopup} onClose={handleCloseDownloadPopup} onDownloadRaw={handleDownloadRawVideo} />
      )}
    </AppShell>
  );
}

/* ================= RAKE DETAIL GRID (Completed – 3-row × 4-col summary matching design) ================= */
function RakeDetailGrid({
  source,
  numberOfIndentWagons,
  vesselName,
  rakePlacementDateTime,
  bagsToBeLoaded,
  rakeLoadingStartDateTime,
  rakeLoadingEndDateTime,
  doorClosingDateTime,
  loadedBagCount,
  unloadedBagCount,
  sealNumber,
  rrNumber,
}) {
  const cell = rakeGridStyles.cell;
  const lbl = rakeGridStyles.label;
  const val = rakeGridStyles.value;
  const valDateTime = { ...val, whiteSpace: "pre-line", lineHeight: "1.3" };

  return (
    <div style={rakeGridStyles.grid}>
      {/* ---- Row 1 ---- */}
      <div style={cell}>
        <span style={lbl}>Source</span>
        <div style={val}>{source || "-"}</div>
      </div>
      <div style={cell}>
        <span style={lbl}>Number of Indent Wagons</span>
        <div style={val}>{numberOfIndentWagons || "-"}</div>
      </div>
      <div style={cell}>
        <span style={lbl}>Vessel Name</span>
        <div style={val}>{vesselName || "-"}</div>
      </div>
      <div style={cell}>
        <span style={lbl}>Rake Placement Date & Time</span>
        <div style={valDateTime}>{rakePlacementDateTime || ""}</div>
      </div>

      {/* ---- Row 2 ---- */}
      <div style={cell}>
        <span style={lbl}>Bags To Be Loaded</span>
        <div style={val}>{bagsToBeLoaded || "-"}</div>
      </div>
      <div style={cell}>
        <span style={lbl}>Rake Loading Start Date & Time</span>
        <div style={valDateTime}>{rakeLoadingStartDateTime || ""}</div>
      </div>
      <div style={cell}>
        <span style={lbl}>Rake Loading End Date & Time</span>
        <div style={valDateTime}>{rakeLoadingEndDateTime || ""}</div>
      </div>
      <div style={cell}>
        <span style={lbl}>Door Closing Date & Time</span>
        <div style={valDateTime}>{doorClosingDateTime || ""}</div>
      </div>

      {/* ---- Row 3 ---- */}
      <div style={cell}>
        <span style={lbl}>Loaded Bag Count</span>
        <div style={val}>{loadedBagCount ?? "-"}</div>
      </div>
      <div style={cell}>
        <span style={lbl}>Unloaded Bag Count</span>
        <div style={val}>{unloadedBagCount ?? "-"}</div>
      </div>
      <div style={cell}>
        <span style={lbl}>Seal Number</span>
        <div style={val}>{sealNumber || "-"}</div>
      </div>
      <div style={cell}>
        <span style={lbl}>RR Number</span>
        <div style={val}>{rrNumber || "-"}</div>
      </div>
    </div>
  );
}

/* ================= WAGON CARD WITH VIDEO (In-progress / Video Feeds tab) ================= */
function WagonCardWithVideo({
  indentNumber,
  numberOfIndentWagons,
  wagonNumber,
  commodity,
  loadingStartDateTime,
  onViewVideo,
  onDownloadVideo,
}) {
  return (
    <div style={cardStyles.row}>
      <div style={cardStyles.field}>
        <span style={cardStyles.label}>Indent Number</span>
        <div style={cardStyles.value}>{indentNumber || "-"}</div>
      </div>
      <div style={cardStyles.field}>
        <span style={cardStyles.label}>Number of Indent Wagons</span>
        <div style={cardStyles.value}>{numberOfIndentWagons || ""}</div>
      </div>
      <div style={cardStyles.field}>
        <span style={cardStyles.label}>Wagon Number</span>
        <div style={cardStyles.value}>{wagonNumber || "-"}</div>
      </div>
      <div style={cardStyles.field}>
        <span style={cardStyles.label}>Commodity</span>
        <div style={cardStyles.value}>{commodity || "-"}</div>
      </div>
      <div style={cardStyles.field}>
        <span style={cardStyles.label}>Loading Start Date & Time</span>
        <div style={{ ...cardStyles.value, whiteSpace: "pre-line", lineHeight: "1.3" }}>
          {loadingStartDateTime || ""}
        </div>
      </div>
      <div style={cardStyles.videoField}>
        <div style={cardStyles.videoHeader}>Video Feed</div>
        <div style={cardStyles.videoBody}>
          <button style={cardStyles.videoBtn} onClick={onViewVideo} title="View Video">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#333">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button style={cardStyles.videoBtn} onClick={onDownloadVideo} title="Download Video">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= VIDEO POPUP COMPONENT ================= */
function VideoPopup({ open, onClose, videoType, onVideoTypeChange, rawVideoSrc, liveVideoSrc }) {
  const videoRef = useRef(null);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (videoRef.current && videoType === "live") {
      const video = videoRef.current;

      const handleSeeking = () => {
        if (video.currentTime < lastTimeRef.current) {
          video.currentTime = lastTimeRef.current;
        }
      };

      const handleTimeUpdate = () => {
        if (video.currentTime >= lastTimeRef.current) {
          lastTimeRef.current = video.currentTime;
        } else {
          video.currentTime = lastTimeRef.current;
        }
      };

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
    lastTimeRef.current = 0;
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      if (videoType === "live") {
        videoRef.current.play().catch((err) => console.error("Auto-play failed:", err));
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
              style={{ ...videoPopupStyles.navButton, ...(videoType === "raw" ? videoPopupStyles.navButtonActive : {}) }}
              onClick={() => onVideoTypeChange("raw")}
            >
              Analytics
            </button>
            <button
              style={{ ...videoPopupStyles.navButton, ...(videoType === "live" ? videoPopupStyles.navButtonActive : {}) }}
              onClick={() => onVideoTypeChange("live")}
            >
              Live
            </button>
          </div>
          <button
            style={videoPopupStyles.closeButton}
            onClick={onClose}
            onMouseOver={(e) => (e.target.style.backgroundColor = "rgba(255,255,255,0.2)")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "transparent")}
            title="Close"
          >
            ×
          </button>
        </div>
        <div style={videoPopupStyles.videoContainer}>
          <video
            ref={videoRef}
            key={videoType}
            controls={!isLive}
            controlsList={isLive ? "nodownload nofullscreen noremoteplayback" : undefined}
            disablePictureInPicture={isLive}
            autoPlay
            style={videoPopupStyles.video}
            src={currentVideoSrc}
            onLoadedMetadata={() => {
              if (videoRef.current && isLive) {
                videoRef.current.currentTime = 0;
                lastTimeRef.current = 0;
                videoRef.current.play().catch((err) => console.error("Auto-play failed:", err));
              }
            }}
            onContextMenu={(e) => {
              if (isLive) e.preventDefault();
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
            onMouseOver={(e) => (e.target.style.backgroundColor = "rgba(255,255,255,0.2)")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "transparent")}
            title="Close"
          >
            ×
          </button>
        </div>
        <div style={downloadPopupStyles.body}>
          <button
            style={downloadPopupStyles.downloadButton}
            onClick={onDownloadRaw}
            onMouseOver={(e) => (e.target.style.backgroundColor = "#45a049")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "#4CAF50")}
          >
            ⬇ Download Analytics Video
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   STYLES
   ================================================================ */

const styles = {
  page: {
    backgroundColor: "#FFFFFF",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },

  /* ---------- Tab Bar + Search (completed state) ---------- */
  tabRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "28px 32px 16px",
  },
  tabContainer: {
    display: "flex",
    gap: "0",
  },
  tabBtn: {
    padding: "10px 28px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    border: "1px solid #0B3A6E",
    backgroundColor: "#fff",
    color: "#0B3A6E",
    transition: "all 0.2s",
  },
  tabBtnActive: {
    backgroundColor: "#0B3A6E",
    color: "#fff",
  },

  /* ---------- Search Bar (in-progress state – right-aligned) ---------- */
  searchRow: {
    display: "flex",
    justifyContent: "flex-end",
    padding: "28px 32px 16px",
  },
  searchBox: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchInput: {
    width: "380px",
    padding: "12px 48px 12px 16px",
    fontSize: "14px",
    border: "1.5px solid #333",
    borderRadius: "0",
    outline: "none",
    fontFamily: "inherit",
    backgroundColor: "#fff",
  },
  searchIcon: {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
  },

  /* ---------- Scrollable Cards Area ---------- */
  cardsScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 32px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "28px",
  },

  /* ---------- Footer ---------- */
  footer: {
    backgroundColor: "#b0b0b0",
    padding: "18px 32px",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "12px",
    marginTop: "auto",
  },
  closeBtn: {
    padding: "10px 40px",
    backgroundColor: "#7a7a7a",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
    letterSpacing: "0.3px",
  },
  nextBtn: {
    padding: "10px 40px",
    backgroundColor: "#0B3A6E",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
    letterSpacing: "0.3px",
  },
};

/* ---------- Wagon Card Row Styles ---------- */
const cardStyles = {
  row: {
    display: "flex",
    alignItems: "stretch",
    gap: "12px",
    flexWrap: "nowrap",
  },

  /* Each bordered field box – light gray to indicate non-editable */
  field: {
    position: "relative",
    border: "1px solid #999",
    borderRadius: "0",
    padding: "22px 12px 10px",
    minWidth: "130px",
    flex: "1 1 0",
    backgroundColor: "#f0f0f0",
  },
  label: {
    position: "absolute",
    top: "-9px",
    left: "8px",
    backgroundColor: "#f0f0f0",
    padding: "0 4px",
    fontSize: "11px",
    color: "#333",
    fontWeight: "400",
    whiteSpace: "nowrap",
  },
  value: {
    fontSize: "13px",
    color: "#333",
    textAlign: "center",
    fontWeight: "400",
    minHeight: "18px",
  },

  /* Video Feed box */
  videoField: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid #999",
    borderRadius: "0",
    overflow: "hidden",
    minWidth: "130px",
    flex: "0 0 130px",
    backgroundColor: "#fff",
  },
  videoHeader: {
    backgroundColor: "#0B3A6E",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "600",
    textAlign: "center",
    padding: "5px 8px",
  },
  videoBody: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 14px",
    flex: 1,
  },
  videoBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};

/* ---------- Rake Detail Grid Styles (4-col × 3-row) ---------- */
const rakeGridStyles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "28px 24px",
    padding: "8px 0",
  },
  cell: {
    position: "relative",
    border: "1px solid #999",
    borderRadius: "0",
    padding: "24px 14px 14px",
    backgroundColor: "#f0f0f0",
    minHeight: "70px",
  },
  label: {
    position: "absolute",
    top: "-9px",
    left: "10px",
    backgroundColor: "#fff",
    padding: "0 4px",
    fontSize: "12px",
    color: "#333",
    fontWeight: "400",
    whiteSpace: "nowrap",
  },
  value: {
    fontSize: "14px",
    color: "#333",
    textAlign: "center",
    fontWeight: "400",
    minHeight: "18px",
  },
};

/* ---------- Video Popup Styles ---------- */
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

/* ---------- Download Popup Styles ---------- */
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

export default CustomerViewTrain;
