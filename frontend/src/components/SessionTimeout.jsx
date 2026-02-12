import { useSessionTimeout } from '../hooks/useSessionTimeout';

/**
 * Session Timeout Component
 * Shows warning modal and handles automatic logout
 */
function SessionTimeout({ children }) {
  const { showWarning, timeRemaining, handleExtendSession, handleLogout } = useSessionTimeout();

  return (
    <>
      {children}
      {showWarning && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h2 style={titleStyle}>Session Expiring Soon</h2>
            <p style={messageStyle}>
              Your session will expire in {timeRemaining} second{timeRemaining !== 1 ? 's' : ''} due to inactivity.
            </p>
            <p style={subMessageStyle}>
              Click "Stay Logged In" to continue your session.
            </p>
            <div style={buttonContainerStyle}>
              <button
                style={extendButtonStyle}
                onClick={handleExtendSession}
              >
                Stay Logged In
              </button>
              <button
                style={logoutButtonStyle}
                onClick={handleLogout}
              >
                Logout Now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ================= STYLES ================= */

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const modalStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '450px',
  width: '90%',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
  textAlign: 'center',
};

const titleStyle = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#0B3A6E',
  marginBottom: '16px',
};

const messageStyle = {
  fontSize: '16px',
  color: '#333',
  marginBottom: '8px',
  lineHeight: '1.5',
};

const subMessageStyle = {
  fontSize: '14px',
  color: '#666',
  marginBottom: '24px',
  lineHeight: '1.5',
};

const buttonContainerStyle = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'center',
};

const extendButtonStyle = {
  padding: '12px 24px',
  backgroundColor: '#0B3A6E',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
};

const logoutButtonStyle = {
  padding: '12px 24px',
  backgroundColor: '#dc2626',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
};

export default SessionTimeout;

