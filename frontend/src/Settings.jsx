import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "./AppShell";
import { getButtonStyle } from "./styles";
import { API_BASE } from "./api";
import { checkSessionOnLoad } from "./utils/sessionUtils";
import DeleteConfirmPopup from "./components/DeleteConfirmPopup";

function Settings() {
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");
  const navigate = useNavigate();

  // Redirect if not reviewer
  useEffect(() => {
    if (!checkSessionOnLoad()) {
      navigate("/");
      return;
    }
    if (role !== "REVIEWER") {
      navigate("/dashboard");
    }
  }, [role, navigate]);

  // Unified user creation state
  const [userType, setUserType] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [userMessage, setUserMessage] = useState(null);
  const [userError, setUserError] = useState(null);

  // Dropdown options state
  const [commodities, setCommodities] = useState([]);
  const [wagonTypes, setWagonTypes] = useState([]);
  const [rakeTypes, setRakeTypes] = useState([]);
  const [newCommodity, setNewCommodity] = useState("");
  const [newWagonType, setNewWagonType] = useState("");
  const [newRakeType, setNewRakeType] = useState("");
  const [dropdownMessage, setDropdownMessage] = useState(null);
  const [dropdownError, setDropdownError] = useState(null);

  // Delete confirmation popup state
  const [deletePopup, setDeletePopup] = useState({
    open: false,
    id: null,
    type: null,
    name: null,
  });

  // Manage users state
  const [allUsers, setAllUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userManageMessage, setUserManageMessage] = useState(null);
  const [userManageError, setUserManageError] = useState(null);
  
  // Filter and pagination state
  const [usernameFilter, setUsernameFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  // Fetch dropdown options and users on mount
  useEffect(() => {
    if (role === "REVIEWER") {
      fetchDropdownOptions();
      fetchAllUsers();
    }
  }, [role]);

  const fetchDropdownOptions = async () => {
    try {
      const [commoditiesRes, wagonTypesRes, rakeTypesRes] = await Promise.all([
        fetch(`${API_BASE}/dropdown-options?type=commodity`, {
          headers: { "x-user-role": role || "" },
        }),
        fetch(`${API_BASE}/dropdown-options?type=wagon_type`, {
          headers: { "x-user-role": role || "" },
        }),
        fetch(`${API_BASE}/dropdown-options?type=rake_type`, {
          headers: { "x-user-role": role || "" },
        }),
      ]);

      if (commoditiesRes.ok) {
        const data = await commoditiesRes.json();
        setCommodities(data);
      } else {
        console.error("Failed to fetch commodities:", commoditiesRes.status, await commoditiesRes.text().catch(() => ""));
      }
      
      if (wagonTypesRes.ok) {
        const data = await wagonTypesRes.json();
        setWagonTypes(data);
      } else {
        console.error("Failed to fetch wagon types:", wagonTypesRes.status, await wagonTypesRes.text().catch(() => ""));
      }
      
      if (rakeTypesRes.ok) {
        const data = await rakeTypesRes.json();
        setRakeTypes(data);
      } else {
        console.error("Failed to fetch rake types:", rakeTypesRes.status, await rakeTypesRes.text().catch(() => ""));
      }
    } catch (err) {
      console.error("Failed to fetch dropdown options:", err);
      setDropdownError("Failed to load dropdown options. Please refresh the page.");
    }
  };

  const handleCreateDropdownOption = async (type, value, setValue) => {
    setDropdownMessage(null);
    setDropdownError(null);

    if (!value || !value.trim()) {
      setDropdownError(`Please enter a ${type.replace('_', ' ')} value.`);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/dropdown-options`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role || "",
          "x-username": username || "",
        },
        body: JSON.stringify({
          option_type: type,
          option_value: value.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDropdownError(data.message || `Failed to create ${type.replace('_', ' ')}.`);
      } else {
        setDropdownMessage(`${type.replace('_', ' ')} "${value.trim()}" created successfully.`);
        setValue("");
        fetchDropdownOptions(); // Refresh the list
      }
    } catch (err) {
      console.error(`Create ${type} error:`, err);
      setDropdownError(`Failed to create ${type.replace('_', ' ')}. Please try again.`);
    }
  };

  const handleDeleteDropdownOption = (id, type, name) => {
    setDeletePopup({
      open: true,
      id,
      type,
      name,
    });
  };

  const confirmDelete = async () => {
    const { id, type } = deletePopup;
    
    try {
      const res = await fetch(`${API_BASE}/dropdown-options/${id}`, {
        method: "DELETE",
        headers: {
          "x-user-role": role || "",
          "x-username": username || "",
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDropdownError(data.message || `Failed to delete ${type.replace('_', ' ')}.`);
      } else {
        setDropdownMessage(`${type.replace('_', ' ')} deleted successfully.`);
        fetchDropdownOptions(); // Refresh the list
      }
    } catch (err) {
      console.error(`Delete ${type} error:`, err);
      setDropdownError(`Failed to delete ${type.replace('_', ' ')}. Please try again.`);
    } finally {
      setDeletePopup({ open: false, id: null, type: null, name: null });
    }
  };

  const cancelDelete = () => {
    setDeletePopup({ open: false, id: null, type: null, name: null });
  };

  // Fetch all users
  const fetchAllUsers = async () => {
    setIsLoadingUsers(true);
    setUserManageError(null);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: {
          "x-user-role": role || "",
          "x-username": username || "",
        },
      });

      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setUserManageError(errorData.message || "Failed to load users");
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setUserManageError("Failed to load users. Please try again.");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Update user status
  const handleUpdateUserStatus = async (userId, newStatus) => {
    setUserManageMessage(null);
    setUserManageError(null);

    try {
      const res = await fetch(`${API_BASE}/users/${userId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role || "",
          "x-username": username || "",
        },
        body: JSON.stringify({ is_active: newStatus }),
      });

      if (res.ok) {
        const data = await res.json();
        setUserManageMessage(data.message || `User ${newStatus ? "activated" : "deactivated"} successfully.`);
        fetchAllUsers(); // Refresh the list
      } else {
        const errorData = await res.json().catch(() => ({}));
        setUserManageError(errorData.message || "Failed to update user status");
      }
    } catch (err) {
      console.error("Failed to update user status:", err);
      setUserManageError("Failed to update user status. Please try again.");
    }
  };

  const getRoleDisplayName = (role) => {
    switch (role) {
      case "SUPER_ADMIN":
        return "Super Admin";
      case "ADMIN":
        return "Admin";
      case "REVIEWER":
        return "Reviewer";
      case "CUSTOMER":
        return "Customer";
      default:
        return role;
    }
  };

  // Filter users based on search and filters
  const getFilteredUsers = () => {
    return allUsers.filter((user) => {
      const matchesUsername = !usernameFilter || 
        user.username.toLowerCase().includes(usernameFilter.toLowerCase());
      const matchesRole = !roleFilter || user.role === roleFilter;
      const matchesStatus = !statusFilter || 
        (statusFilter === "active" && user.is_active) ||
        (statusFilter === "inactive" && !user.is_active);
      
      return matchesUsername && matchesRole && matchesStatus;
    });
  };

  // Pagination logic
  const filteredUsers = getFilteredUsers();
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [usernameFilter, roleFilter, statusFilter]);

  // Don't render if not reviewer
  if (role !== "REVIEWER") {
    return null;
  }

  const handleCreateUser = async () => {
    setUserMessage(null);
    setUserError(null);

    if (!userType) {
      setUserError("Please select a user type.");
      return;
    }

    if (!newUsername.trim() || !newPassword.trim()) {
      setUserError("Please enter both username and password.");
      return;
    }

    setIsSubmittingUser(true);
    try {
      let endpoint;
      let body;
      
      // Determine endpoint and request body based on user type
      if (userType === "customer") {
        endpoint = `${API_BASE}/customers`;
        body = {
          customer_name: newUsername.trim(),
          password: newPassword.trim(),
        };
      } else {
        // For reviewer, admin, superadmin
        endpoint = `${API_BASE}/users/${userType}`;
        body = {
          username: newUsername.trim(),
          password: newPassword.trim(),
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role || "",
          "x-username": username || "",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setUserError(data.message || `Failed to create ${userType}.`);
      } else {
        if (userType === "customer") {
          setUserMessage(
            `Customer "${data.customer?.customer_name}" created with code ${data.customer?.customer_code}.`
          );
        } else {
          const userTypeLabel = userType === "reviewer" ? "Reviewer" : 
                                userType === "admin" ? "Admin" : "Super Admin";
          setUserMessage(`${userTypeLabel} "${newUsername.trim()}" created successfully.`);
        }
        // Reset form
        setUserType("");
        setNewUsername("");
        setNewPassword("");
        // Refresh users list
        fetchAllUsers();
      }
    } catch (err) {
      console.error(`Create ${userType} error:`, err);
      setUserError(`Failed to create ${userType}. Please try again.`);
    } finally {
      setIsSubmittingUser(false);
    }
  };

  return (
    <AppShell>
      <div style={styles.mainContent}>
        <div style={styles.headerSection}>
          <div style={styles.headerTop}>
            <h2 style={styles.title}>Settings</h2>
            <button
              style={styles.backButton}
              onClick={() => navigate("/dashboard")}
            >
              ← Back to Dashboard
            </button>
          </div>
          <p style={styles.subtitle}>Manage user accounts and system settings</p>
        </div>

        {/* User Creation Section */}
        <div style={styles.sectionContainer}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>User Management</h3>
          </div>
          <div style={styles.userCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>Create New User</span>
            </div>

          <div style={styles.fieldGroup}>
            <label style={styles.fieldLabel}>Type of User</label>
            <select
              value={userType}
              onChange={(e) => setUserType(e.target.value)}
              style={styles.input}
            >
              <option value="">Select User Type</option>
              <option value="customer">Customer</option>
              <option value="reviewer">Reviewer</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Super Admin</option>
            </select>
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.fieldLabel}>
              {userType === "customer" ? "Customer Name" : "Username"}
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              style={styles.input}
              placeholder={
                userType === "customer" 
                  ? "e.g., IPL" 
                  : userType === "reviewer"
                  ? "e.g., reviewer"
                  : userType === "admin"
                  ? "e.g., admin"
                  : userType === "superadmin"
                  ? "e.g., superadmin"
                  : "Enter username"
              }
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.fieldLabel}>Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={styles.input}
              placeholder="Enter password"
            />
          </div>

            {userError && <div style={styles.alertError}>{userError}</div>}
            {userMessage && <div style={styles.alertSuccess}>{userMessage}</div>}

            <button
              style={{
                ...styles.primaryButton,
                marginTop: "16px",
                opacity: isSubmittingUser || !userType ? 0.6 : 1,
                cursor: isSubmittingUser || !userType ? "not-allowed" : "pointer",
              }}
              onClick={handleCreateUser}
              disabled={isSubmittingUser || !userType}
            >
              {isSubmittingUser 
                ? "Creating..." 
                : userType 
                  ? `Create ${userType === "customer" ? "Customer" : userType === "reviewer" ? "Reviewer" : userType === "admin" ? "Admin" : "Super Admin"}` 
                  : "Create User"}
            </button>
          </div>

          {/* Manage Users Section */}
          <div style={{ ...styles.userCard, marginTop: "24px" }}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>Manage Users</span>
              {allUsers.length > 0 && (
                <span style={styles.userCount}>
                  {filteredUsers.length} of {allUsers.length} users
                </span>
              )}
            </div>

            {userManageError && <div style={styles.alertError}>{userManageError}</div>}
            {userManageMessage && <div style={styles.alertSuccess}>{userManageMessage}</div>}

            {/* Filters */}
            {allUsers.length > 0 && (
              <div style={styles.filtersContainer}>
                <div style={styles.filterRow}>
                  <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Search Username</label>
                    <input
                      type="text"
                      value={usernameFilter}
                      onChange={(e) => setUsernameFilter(e.target.value)}
                      style={styles.filterInput}
                      placeholder="Search by username..."
                    />
                  </div>
                  <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Filter by Role</label>
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value="">All Roles</option>
                      <option value="SUPER_ADMIN">Super Admin</option>
                      <option value="ADMIN">Admin</option>
                      <option value="REVIEWER">Reviewer</option>
                      <option value="CUSTOMER">Customer</option>
                    </select>
                  </div>
                  <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Filter by Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value="">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  {(usernameFilter || roleFilter || statusFilter) && (
                    <button
                      style={styles.clearFiltersButton}
                      onClick={() => {
                        setUsernameFilter("");
                        setRoleFilter("");
                        setStatusFilter("");
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            )}

            {isLoadingUsers ? (
              <div style={{ textAlign: "center", padding: "20px", color: "#6b7280" }}>
                Loading users...
              </div>
            ) : (
              <div style={styles.usersTableContainer}>
                {filteredUsers.length === 0 ? (
                  <div style={styles.emptyState}>
                    {allUsers.length === 0 
                      ? "No users found" 
                      : "No users match your filters"}
                  </div>
                ) : (
                  <>
                    <table style={styles.usersTable}>
                      <thead>
                        <tr>
                          <th style={styles.tableHeader}>Username</th>
                          <th style={styles.tableHeader}>Role</th>
                          <th style={styles.tableHeader}>Status</th>
                          <th style={styles.tableHeader}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedUsers.map((user) => (
                          <tr key={user.id} style={styles.tableRow}>
                            <td style={styles.tableCell}>{user.username}</td>
                            <td style={styles.tableCell}>{getRoleDisplayName(user.role)}</td>
                            <td style={styles.tableCell}>
                              <span
                                style={{
                                  ...styles.statusBadge,
                                  backgroundColor: user.is_active ? "#d1fae5" : "#fee2e2",
                                  color: user.is_active ? "#065f46" : "#991b1b",
                                }}
                              >
                                {user.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td style={styles.tableCell}>
                              <button
                                style={{
                                  ...styles.toggleButton,
                                  backgroundColor: user.is_active ? "#dc2626" : "#16a34a",
                                }}
                                onClick={() => handleUpdateUserStatus(user.id, !user.is_active)}
                              >
                                {user.is_active ? "Deactivate" : "Activate"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div style={styles.paginationContainer}>
                        <button
                          style={{
                            ...styles.paginationButton,
                            opacity: currentPage === 1 ? 0.5 : 1,
                            cursor: currentPage === 1 ? "not-allowed" : "pointer",
                          }}
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                        >
                          ← Previous
                        </button>
                        <span style={styles.paginationInfo}>
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          style={{
                            ...styles.paginationButton,
                            opacity: currentPage === totalPages ? 0.5 : 1,
                            cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                          }}
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dropdown Options Management Section */}
        <div style={styles.sectionContainer}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Dropdown Options Management</h3>
          </div>
          
          {dropdownError && <div style={styles.alertError}>{dropdownError}</div>}
          {dropdownMessage && <div style={styles.alertSuccess}>{dropdownMessage}</div>}

          <div style={styles.optionsGrid}>
            {/* Manage Commodities */}
            <div style={styles.optionCard}>
              <div style={styles.optionCardHeader}>
                <span style={styles.optionTitle}>Commodities</span>
              </div>
              
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Add New Commodity</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={newCommodity}
                    onChange={(e) => setNewCommodity(e.target.value)}
                    style={styles.input}
                    placeholder="e.g., Wheat"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateDropdownOption("commodity", newCommodity, setNewCommodity);
                      }
                    }}
                  />
                  <button
                    style={styles.addButton}
                    onClick={() => handleCreateDropdownOption("commodity", newCommodity, setNewCommodity)}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div style={styles.listContainer}>
                <div style={styles.listLabel}>Existing Items:</div>
                {commodities.length === 0 ? (
                  <div style={styles.emptyState}>No commodities added yet</div>
                ) : (
                  <div style={styles.list}>
                    {commodities.map((item) => (
                      <div key={item.id} style={styles.listItem}>
                        <span style={styles.listItemText}>{item.option_value}</span>
                        <button
                          onClick={() => handleDeleteDropdownOption(item.id, "commodity", item.option_value)}
                          style={styles.deleteButton}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Manage Wagon Types */}
            <div style={styles.optionCard}>
              <div style={styles.optionCardHeader}>
                <span style={styles.optionTitle}>Wagon Types</span>
              </div>
              
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Add New Wagon Type</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={newWagonType}
                    onChange={(e) => setNewWagonType(e.target.value)}
                    style={styles.input}
                    placeholder="e.g., HL"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateDropdownOption("wagon_type", newWagonType, setNewWagonType);
                      }
                    }}
                  />
                  <button
                    style={styles.addButton}
                    onClick={() => handleCreateDropdownOption("wagon_type", newWagonType, setNewWagonType)}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div style={styles.listContainer}>
                <div style={styles.listLabel}>Existing Items:</div>
                {wagonTypes.length === 0 ? (
                  <div style={styles.emptyState}>No wagon types added yet</div>
                ) : (
                  <div style={styles.list}>
                    {wagonTypes.map((item) => (
                      <div key={item.id} style={styles.listItem}>
                        <span style={styles.listItemText}>{item.option_value}</span>
                        <button
                          onClick={() => handleDeleteDropdownOption(item.id, "wagon_type", item.option_value)}
                          style={styles.deleteButton}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Manage Rake Types */}
            <div style={styles.optionCard}>
              <div style={styles.optionCardHeader}>
                <span style={styles.optionTitle}>Rake Types</span>
              </div>
              
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Add New Rake Type</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={newRakeType}
                    onChange={(e) => setNewRakeType(e.target.value)}
                    style={styles.input}
                    placeholder="e.g., Full rake"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateDropdownOption("rake_type", newRakeType, setNewRakeType);
                      }
                    }}
                  />
                  <button
                    style={styles.addButton}
                    onClick={() => handleCreateDropdownOption("rake_type", newRakeType, setNewRakeType)}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div style={styles.listContainer}>
                <div style={styles.listLabel}>Existing Items:</div>
                {rakeTypes.length === 0 ? (
                  <div style={styles.emptyState}>No rake types added yet</div>
                ) : (
                  <div style={styles.list}>
                    {rakeTypes.map((item) => (
                      <div key={item.id} style={styles.listItem}>
                        <span style={styles.listItemText}>{item.option_value}</span>
                        <button
                          onClick={() => handleDeleteDropdownOption(item.id, "rake_type", item.option_value)}
                          style={styles.deleteButton}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DeleteConfirmPopup
          open={deletePopup.open}
          onClose={cancelDelete}
          onYes={confirmDelete}
          onNo={cancelDelete}
          message={deletePopup.name ? `Are you sure you want to delete this ${deletePopup.type?.replace('_', ' ')}: "${deletePopup.name}"?` : `Are you sure you want to delete this ${deletePopup.type?.replace('_', ' ')}?`}
        />
      </div>
    </AppShell>
  );
}

const styles = {
  mainContent: {
    padding: "32px",
    maxWidth: "1400px",
    margin: "0 auto",
    backgroundColor: "#FFFFFF",
    minHeight: "100vh",
  },

  headerSection: {
    marginBottom: "32px",
  },

  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },

  title: {
    fontSize: "32px",
    fontWeight: 700,
    color: "#0B3A6E",
    marginBottom: "0",
    letterSpacing: "-0.5px",
  },

  subtitle: {
    fontSize: "16px",
    color: "#6b7280",
    marginBottom: "0",
  },

  sectionContainer: {
    marginBottom: "40px",
    backgroundColor: "#FFFFFF",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    border: "1px solid #e5e7eb",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "24px",
    paddingBottom: "16px",
    borderBottom: "2px solid #e5e7eb",
  },

  sectionTitle: {
    fontSize: "22px",
    fontWeight: 600,
    color: "#0B3A6E",
    margin: "0",
  },

  userCard: {
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    padding: "24px",
    border: "1px solid #e5e7eb",
  },

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "20px",
  },

  cardTitle: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#0B3A6E",
  },

  fieldGroup: {
    marginBottom: "18px",
  },

  fieldLabel: {
    fontSize: "14px",
    fontWeight: 500,
    color: "#374151",
    marginBottom: "8px",
    display: "block",
  },

  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "15px",
    boxSizing: "border-box",
    transition: "all 0.2s",
    backgroundColor: "#FFFFFF",
  },

  primaryButton: {
    width: "100%",
    padding: "12px 24px",
    borderRadius: "6px",
    border: "none",
    fontSize: "15px",
    fontWeight: 600,
    backgroundColor: "#0B3A6E",
    color: "#FFFFFF",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 2px 4px rgba(11, 58, 110, 0.2)",
  },

  alertError: {
    marginTop: "12px",
    padding: "12px 16px",
    fontSize: "14px",
    color: "#dc2626",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
  },

  alertSuccess: {
    marginTop: "12px",
    padding: "12px 16px",
    fontSize: "14px",
    color: "#16a34a",
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "6px",
  },

  optionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "24px",
  },

  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: "8px",
    padding: "20px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    transition: "all 0.2s",
  },

  optionCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "18px",
    paddingBottom: "12px",
    borderBottom: "1px solid #e5e7eb",
  },

  optionTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#0B3A6E",
  },

  addButton: {
    padding: "10px 20px",
    whiteSpace: "nowrap",
    borderRadius: "6px",
    border: "none",
    fontSize: "14px",
    fontWeight: 600,
    backgroundColor: "#0B3A6E",
    color: "#FFFFFF",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 1px 3px rgba(11, 58, 110, 0.2)",
  },

  listContainer: {
    marginTop: "16px",
    maxHeight: "280px",
    overflowY: "auto",
    paddingRight: "4px",
  },

  listLabel: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#6b7280",
    marginBottom: "10px",
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    backgroundColor: "#f9fafb",
    borderRadius: "6px",
    border: "1px solid #e5e7eb",
    transition: "all 0.2s",
  },

  listItemText: {
    fontSize: "14px",
    color: "#374151",
    fontWeight: 500,
  },

  deleteButton: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
    padding: "4px 8px",
    borderRadius: "4px",
    transition: "all 0.2s",
    opacity: 0.7,
  },

  emptyState: {
    fontSize: "13px",
    color: "#9ca3af",
    marginTop: "12px",
    fontStyle: "italic",
    textAlign: "center",
    padding: "16px",
  },

  backButton: {
    padding: "10px 20px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: "#FFFFFF",
    color: "#374151",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },

  usersTableContainer: {
    marginTop: "16px",
    overflowX: "auto",
  },

  usersTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
  },

  tableHeader: {
    padding: "12px",
    textAlign: "left",
    backgroundColor: "#f9fafb",
    borderBottom: "2px solid #e5e7eb",
    fontWeight: 600,
    color: "#374151",
    fontSize: "13px",
  },

  tableRow: {
    borderBottom: "1px solid #e5e7eb",
    transition: "background-color 0.2s",
  },

  tableCell: {
    padding: "12px",
    color: "#374151",
  },

  statusBadge: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: 600,
  },

  toggleButton: {
    padding: "6px 16px",
    borderRadius: "6px",
    border: "none",
    fontSize: "13px",
    fontWeight: 500,
    color: "#FFFFFF",
    cursor: "pointer",
    transition: "all 0.2s",
  },

  userCount: {
    fontSize: "13px",
    color: "#6b7280",
    fontWeight: 500,
    marginLeft: "auto",
  },

  filtersContainer: {
    marginTop: "20px",
    marginBottom: "20px",
    padding: "16px",
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },

  filterRow: {
    display: "flex",
    gap: "16px",
    alignItems: "flex-end",
    flexWrap: "wrap",
  },

  filterGroup: {
    flex: "1",
    minWidth: "150px",
  },

  filterLabel: {
    fontSize: "12px",
    fontWeight: 500,
    color: "#374151",
    marginBottom: "6px",
    display: "block",
  },

  filterInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    boxSizing: "border-box",
    backgroundColor: "#FFFFFF",
  },

  filterSelect: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    boxSizing: "border-box",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },

  clearFiltersButton: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: "#FFFFFF",
    color: "#374151",
    cursor: "pointer",
    transition: "all 0.2s",
    whiteSpace: "nowrap",
    height: "fit-content",
  },

  paginationContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
    marginTop: "20px",
    paddingTop: "16px",
    borderTop: "1px solid #e5e7eb",
  },

  paginationButton: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: "#FFFFFF",
    color: "#374151",
    cursor: "pointer",
    transition: "all 0.2s",
  },

  paginationInfo: {
    fontSize: "14px",
    color: "#6b7280",
    fontWeight: 500,
  },
};

export default Settings;
