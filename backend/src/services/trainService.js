const pool = require("../config/database");

/* =====================================================
   HELPER: Generate Train ID in format: financial_year/month/sequence
   Format: YYYY-YY/MM/001 (e.g., 2024-25/01/001)
   Financial year in India: April to March (April 2024 - March 2025 = 2024-25)
===================================================== */
async function generateTrainId() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12 (January = 1, December = 12)

  // Determine financial year
  // If month is April (4) to December (12): currentYear-nextYear (e.g., 2024-25)
  // If month is January (1) to March (3): previousYear-currentYear (e.g., 2023-24)
  let financialYear;
  if (currentMonth >= 4) {
    // April to December: 2024-25
    const nextYear = (currentYear % 100) + 1;
    financialYear = `${currentYear}-${String(nextYear).padStart(2, '0')}`;
  } else {
    // January to March: 2023-24
    const prevYear = currentYear - 1;
    const currentYearShort = currentYear % 100;
    financialYear = `${prevYear}-${String(currentYearShort).padStart(2, '0')}`;
  }

  // Format month as 2 digits (01, 02, ..., 12)
  const monthStr = String(currentMonth).padStart(2, '0');

  // Find next available sequence number for this financial year/month
  // Pattern: financial_year/month/001, financial_year/month/002, etc.
  const pattern = `${financialYear}/${monthStr}/%`;

  // Check train_session for existing sequences (both train_id and rake_serial_number)
  const existingTrains = await pool.query(
    `SELECT rake_serial_number AS train_id, rake_serial_number FROM train_session 
     WHERE rake_serial_number LIKE $1`,
    [pattern]
  );

  // Also check dashboard_records for rake_serial_number values
  // This is CRITICAL because when indents start counting, they get unique rake_serial_numbers
  // and we need to consider those when generating new train IDs
  // Example: If TRAIN-002 has indents with rake_serial_numbers 001, 002, 003,
  // then new TRAIN-003 should get 004 (not 002)
  const existingDashboardRecords = await pool.query(
    `SELECT DISTINCT rake_serial_number FROM dashboard_records 
     WHERE rake_serial_number LIKE $1 AND rake_serial_number IS NOT NULL`,
    [pattern]
  );

  // Extract sequence numbers from train_session (train_id and rake_serial_number)
  const trainSessionNumbers = existingTrains.rows
    .flatMap(row => {
      const numbers = [];
      // Check train_id
      if (row.train_id) {
      const match = row.train_id.match(/\/\d+\/(\d+)$/);
        if (match) numbers.push(parseInt(match[1], 10));
      }
      // Check rake_serial_number
      if (row.rake_serial_number) {
        const match = row.rake_serial_number.match(/\/\d+\/(\d+)$/);
        if (match) numbers.push(parseInt(match[1], 10));
      }
      return numbers;
    })
    .filter(num => num !== null);

  // Extract sequence numbers from dashboard_records (rake_serial_number)
  const dashboardNumbers = existingDashboardRecords.rows
    .map(row => {
      if (row.rake_serial_number) {
        const match = row.rake_serial_number.match(/\/\d+\/(\d+)$/);
      return match ? parseInt(match[1], 10) : null;
      }
      return null;
    })
    .filter(num => num !== null);

  // Combine all sequence numbers and find maximum
  const allSequenceNumbers = [...trainSessionNumbers, ...dashboardNumbers];
  const maxSequence = allSequenceNumbers.length > 0 ? Math.max(...allSequenceNumbers) : 0;

  // Find next available sequence number
  const nextSequence = maxSequence + 1;

  // Format sequence as 3 digits (001, 002, 003, etc.)
  const sequenceStr = String(nextSequence).padStart(3, '0');

  return `${financialYear}/${monthStr}/${sequenceStr}`;
}

/* =====================================================
   HELPER: Generate next unique rake serial number based on current one
   Takes a current rake serial number and finds the next available unique one
   by incrementing the sequence number until it finds one that's not used
===================================================== */
async function generateNextUniqueRakeSerialNumber(currentRakeSerialNumber) {
  // Parse the current rake serial number: format is YYYY-YY/MM/XXX
  const match = currentRakeSerialNumber.match(/^(\d{4}-\d{2})\/(\d{2})\/(\d+)$/);
  
  if (!match) {
    // If format doesn't match, fall back to generateTrainId()
    console.log(`[RAKE SERIAL] Invalid format for ${currentRakeSerialNumber}, using generateTrainId()`);
    return await generateTrainId();
  }

  const financialYear = match[1]; // e.g., "2025-26"
  const month = match[2]; // e.g., "02"
  const currentSequence = parseInt(match[3], 10); // e.g., 1

  // Start checking from currentSequence + 1
  let nextSequence = currentSequence + 1;
  let maxAttempts = 1000; // Safety limit
  let attempts = 0;

  while (attempts < maxAttempts) {
    const sequenceStr = String(nextSequence).padStart(3, '0');
    const candidateRakeSerial = `${financialYear}/${month}/${sequenceStr}`;

    // Check if this rake serial number is already used
    // Check both train_session and dashboard_records
    const trainSessionCheck = await pool.query(
      "SELECT 1 FROM train_session WHERE rake_serial_number = $1 LIMIT 1",
      [candidateRakeSerial]
    );

    const dashboardCheck = await pool.query(
      "SELECT 1 FROM dashboard_records WHERE rake_serial_number = $1 LIMIT 1",
      [candidateRakeSerial]
    );

    // If not found in either table, this is unique
    if (trainSessionCheck.rows.length === 0 && dashboardCheck.rows.length === 0) {
      console.log(`[RAKE SERIAL] Found unique rake serial number: ${candidateRakeSerial} (after ${attempts + 1} attempts)`);
      return candidateRakeSerial;
    }

    // This number is used, try next
    nextSequence++;
    attempts++;
  }

  // If we exhausted attempts, fall back to generateTrainId()
  console.log(`[RAKE SERIAL] Exhausted attempts to find unique number, using generateTrainId()`);
  return await generateTrainId();
}

module.exports = {
  generateTrainId,
  generateNextUniqueRakeSerialNumber,
};
