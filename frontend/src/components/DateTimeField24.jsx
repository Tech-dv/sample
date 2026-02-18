import { useState, useEffect, useRef } from "react";

// Field styles
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

// Date time picker styles
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

export default function DateTimeField24({ label, value, onChange, readOnly, required = false, error }) {
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
    // ✅ FIX: If date is "00/00/0000" or empty, automatically fill with today's date
    const currentDate = localDate || "";
    if (!currentDate || currentDate === "00/00/0000" || !currentDate.includes('/') || currentDate.split('/').length !== 3) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStorage = `${year}-${month}-${day}`;
      const dateDisplayToday = `${day}/${month}/${year}`;
      setLocalDate(dateDisplayToday);
      setSelectedDate(today); // Also update selectedDate for calendar
      setCalendarDate(today); // Also update calendarDate for calendar
      
      // Update the combined value immediately
      const currentTime = localTime || time || "00:00:00";
      const newValue = combineDateTime(dateStorage, currentTime);
      onChange && onChange(newValue);
      
      setTimeout(() => {
        e.target.setSelectionRange(0, 0); // Position cursor at start
      }, 0);
    }
  };

  const handleDateInputClick = () => {
    if (!readOnly) {
      // ✅ FIX: If date is "00/00/0000" or empty, automatically fill with today's date
      const currentDate = localDate || dateDisplay || "";
      if (!currentDate || currentDate === "00/00/0000" || currentDate.trim() === "") {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStorage = `${year}-${month}-${day}`;
        const dateDisplayToday = `${day}/${month}/${year}`;
        setLocalDate(dateDisplayToday);
        setSelectedDate(today); // Also update selectedDate for calendar
        setCalendarDate(today); // Also update calendarDate for calendar
        
        // Update the combined value immediately
        const currentTime = localTime || time || "00:00:00";
        const newValue = combineDateTime(dateStorage, currentTime);
        onChange && onChange(newValue);
      }
      
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
    // Generate array of years: starting from 2026 to 50 years after current year
    const currentYear = new Date().getFullYear();
    const startYear = 2026;
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
      // ✅ FIX: If date is empty or "00/00/0000", set it to today's date before processing time input
      const currentDate = localDate || dateDisplay || "";
      if (!currentDate || currentDate === "00/00/0000" || currentDate.trim() === "") {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStorage = `${year}-${month}-${day}`;
        const dateDisplayToday = `${day}/${month}/${year}`;
        setLocalDate(dateDisplayToday);
      }
      
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
      // ✅ FIX: Use the updated date (may have been set to today's date above)
      const currentDateForCombine = localDate || dateDisplay || "";
      let dateForCombine = date;
      if (!currentDateForCombine || currentDateForCombine === "00/00/0000" || currentDateForCombine.trim() === "") {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        dateForCombine = `${year}-${month}-${day}`;
      }
      if (dateForCombine) {
        const newValue = combineDateTime(dateForCombine, formattedTime);
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
      // ✅ FIX: Use the updated date (may have been set to today's date above)
      const currentDateForCombine = localDate || dateDisplay || "";
      let dateForCombine = date;
      if (!currentDateForCombine || currentDateForCombine === "00/00/0000" || currentDateForCombine.trim() === "") {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        dateForCombine = `${year}-${month}-${day}`;
      }
      if (dateForCombine) {
        const newValue = combineDateTime(dateForCombine, formattedTime);
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
      // ✅ FIX: Use the updated date (may have been set to today's date above)
      const currentDateForCombine = localDate || dateDisplay || "";
      let dateForCombine = date;
      if (!currentDateForCombine || currentDateForCombine === "00/00/0000" || currentDateForCombine.trim() === "") {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        dateForCombine = `${year}-${month}-${day}`;
      }
      if (dateForCombine) {
        const newValue = combineDateTime(dateForCombine, formattedTime);
        onChange && onChange(newValue);
      }
      
      return;
    }
  };

  const handleTimeFocus = (e) => {
    // ✅ FIX: If date is empty or "00/00/0000", set it to today's date
    const currentDate = localDate || dateDisplay || "";
    if (!currentDate || currentDate === "00/00/0000" || currentDate.trim() === "") {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStorage = `${year}-${month}-${day}`;
      const dateDisplayToday = `${day}/${month}/${year}`;
      setLocalDate(dateDisplayToday);
      // Update the combined datetime value with today's date
      const currentTime = localTime || time || "00:00:00";
      const newValue = combineDateTime(dateStorage, currentTime);
      onChange && onChange(newValue);
    }
    
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
