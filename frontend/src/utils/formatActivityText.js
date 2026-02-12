/**
 * Formats activity timeline text to be more user-friendly
 * Converts technical format like:
 * "Reviewer made changes: Wagons: Wagon 1 (Commodity: "Urea granuals" → "DAP"; Customer Name: "PPL" → "CIL")"
 * 
 * To a more readable format like:
 * "Reviewer made changes:
 *   • Wagon 1:
 *     - Commodity: Urea granuals → DAP
 *     - Customer Name: PPL → CIL"
 */
export function formatActivityText(text) {
  if (!text) return text;

  // Check if this is a "Reviewer made changes" entry
  if (text.includes("Reviewer made changes:")) {
    try {
      // Split by " | " to separate different sections (Header, Wagons)
      const sections = text.split(" | ");
      const formattedSections = [];

      sections.forEach((section) => {
        // Check if it's a Header section
        if (section.includes("Header:")) {
          const headerPart = section.replace("Reviewer made changes:", "").trim();
          const headerContent = headerPart.replace("Header:", "").trim();
          
          // Parse header changes: "Field: "old" → "new"; Field2: "old" → "new""
          const headerChanges = parseFieldChanges(headerContent);
          if (headerChanges.length > 0) {
            // Only add "Reviewer made changes:" header if not already added
            if (!formattedSections.some(s => s.includes("Reviewer made changes:"))) {
              formattedSections.push("Reviewer made changes:");
            }
            // Show header field changes directly as bullet points (no "Header:" label)
            headerChanges.forEach(change => {
              // Keep "(empty)" as is, don't convert to "empty"
              const oldVal = change.oldValue || "(empty)";
              const newVal = change.newValue || "(empty)";
              formattedSections.push(`  • ${change.field}: ${oldVal} → ${newVal}`);
            });
          }
        }
        // Check if it's a Wagons section
        else if (section.includes("Wagons:")) {
          const wagonsPart = section.includes("Reviewer made changes:")
            ? section.replace("Reviewer made changes:", "").trim()
            : section.trim();
          const wagonsContent = wagonsPart.replace("Wagons:", "").trim();
          
          // Parse wagon changes: "Wagon 1 (Field: "old" → "new"; Field2: "old" → "new") | Wagon 2 (...)"
          const wagonGroups = parseWagonChanges(wagonsContent);
          
          if (wagonGroups.length > 0) {
            // Only add "Reviewer made changes:" header if not already added
            if (!formattedSections.some(s => s.includes("Reviewer made changes:"))) {
              formattedSections.push("Reviewer made changes:");
            }
            formattedSections.push("  Wagons:");
            
            wagonGroups.forEach(wagon => {
              formattedSections.push(`    • ${wagon.wagon}:`);
              wagon.changes.forEach(change => {
                const oldVal = change.oldValue === "(empty)" ? "empty" : change.oldValue;
                const newVal = change.newValue === "(empty)" ? "empty" : change.newValue;
                formattedSections.push(`      - ${change.field}: ${oldVal} → ${newVal}`);
              });
            });
          }
        }
      });

      // If we successfully formatted, return formatted text, otherwise return original
      if (formattedSections.length > 0) {
        return formattedSections.join("\n");
      }
    } catch (err) {
      console.error("Error formatting activity text:", err);
      // Fall through to return original text
    }
  }

  // Return original text if not a "Reviewer made changes" entry or if parsing failed
  return text;
}

/**
 * Parse field changes from format: 'Field: "old" → "new"; Field2: "old" → "new"'
 */
function parseFieldChanges(content) {
  const changes = [];
  if (!content) return changes;

  // Split by semicolon to get individual field changes
  const fieldChanges = content.split(";").map(s => s.trim()).filter(Boolean);
  
  fieldChanges.forEach(changeStr => {
    // Match pattern: Field: "old" → "new"
    const match = changeStr.match(/^(.+?):\s*"([^"]*)"\s*→\s*"([^"]*)"$/);
    if (match) {
      changes.push({
        field: match[1].trim(),
        oldValue: match[2] || "(empty)",
        newValue: match[3] || "(empty)"
      });
    }
  });

  return changes;
}

/**
 * Parse wagon changes from format: 'Wagon 1 (Field: "old" → "new"; Field2: "old" → "new") | Wagon 2 (...)'
 */
function parseWagonChanges(content) {
  const wagonGroups = [];
  if (!content) return wagonGroups;

  // Split by " | " to separate different wagons
  const wagonParts = content.split(" | ").map(s => s.trim()).filter(Boolean);
  
  wagonParts.forEach(wagonPart => {
    // Match pattern: Wagon N (Field: "old" → "new"; Field2: "old" → "new")
    const match = wagonPart.match(/^Wagon\s+(\d+)\s*\((.+)\)$/);
    if (match) {
      const wagonNumber = match[1];
      const changesContent = match[2];
      const changes = parseFieldChanges(changesContent);
      
      if (changes.length > 0) {
        wagonGroups.push({
          wagon: `Wagon ${wagonNumber}`,
          changes: changes
        });
      }
    }
  });

  return wagonGroups;
}
