import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppShell from "./AppShell";
import {getButtonStyle } from "./styles";
import { API_BASE } from "./api";




function CameraList() {
  const { spur } = useParams();
  const navigate = useNavigate();



  const [cameras, setCameras] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const fetchCameras = async () => {
    const query = new URLSearchParams({
      siding: spur,
      search,
      status,
    }).toString();

    const res = await fetch(`${API_BASE}/cameras?${query}`);
    const data = await res.json();
    setCameras(data);
  };

  useEffect(() => {
    fetchCameras();
  }, [spur, search, status]);

  return (
    <AppShell>
      <div style={styles.mainContent}>
        {/* ===== PAGE HEADER ===== */}
        <div style={styles.header}>
          <h2 style={styles.title}>{spur} – Camera Status</h2>
        </div>

        {/* ===== FILTER BAR ===== */}
        <div style={styles.filterBar}>
          <input
            placeholder="Search by Camera Name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={styles.select}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* ===== TABLE ===== */}
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Camera Name</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>

            <tbody>
              {cameras.length === 0 && (
                <tr>
                  <td colSpan="2" style={styles.noData}>
                    No cameras found
                  </td>
                </tr>
              )}

              {cameras.map((cam, index) => (
                <tr
                  key={cam.id}
                  style={{
                    backgroundColor:
                      index % 2 === 0 ? "#F9F9F9" : "#EFEFEF",
                  }}
                >
                  <td style={styles.td}>{cam.camera_name}</td>
                  <td style={{...styles.td, ...styles.statusCell}}>
                    <span
                      style={{
                        ...styles.statusBadge,
                        backgroundColor: cam.status
                          ? "#DFF5E1"
                          : "#FDE2E2",
                        color: cam.status ? "#1B7F3B" : "#B3261E",
                      }}
                    >
                      {cam.status ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button
              style={{ ...getButtonStyle("cancel"), marginTop: "20px" }}
              onClick={() => navigate(-1)}
            >
              Back
        </button>
    </AppShell>
  );
}

/* ================= STYLES ================= */

const styles = {
  mainContent: {
    padding: "24px",
  },

  header: {
    marginBottom: "20px",
  },

  title: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#0B3A6E",
  },

  filterBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "14px",
  },

  searchInput: {
    width: "260px",
    padding: "8px",
    fontSize: "13px",
    border: "1px solid #CCC",
    borderRadius: "4px",
  },

  select: {
    width: "180px",
    padding: "8px",
    fontSize: "13px",
    border: "1px solid #CCC",
    borderRadius: "4px",
  },

  tableWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: "4px",
    overflow: "hidden",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
  },

  th: {
    backgroundColor: "#0B3A6E",
    color: "#FFFFFF",
    padding: "12px",
    fontSize: "13px",
    textAlign: "left",
  },

  td: {
    padding: "10px",
    fontSize: "13px",
    borderRight: "1px solid #E0E0E0",
    verticalAlign: "middle",
  },

  statusCell: {
    textAlign: "left",
    width: "150px",
  },

  statusBadge: {
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: 700,
    display: "inline-block",
    minWidth: "80px",
    textAlign: "center",
  },

  noData: {
    padding: "20px",
    textAlign: "center",
    fontSize: "13px",
    color: "#777",
  },


};

export default CameraList;
