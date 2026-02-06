import fs from 'fs';
import path from 'path';

/**
 * Update SpellIcon.dbc with new icon entries
 * Assigns next available ID and updates file path mappings
 */
export function addIconToSpellIconDbc(dbcPath, iconFilename) {
  try {
    if (!fs.existsSync(dbcPath)) {
      console.warn(`DBC file not found: ${dbcPath}`);
      return null;
    }

    const buffer = fs.readFileSync(dbcPath);
    const view = new DataView(buffer);
    let offset = 0;

    // Read header
    const signature = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    offset += 4;

    if (signature !== 'WDBC') {
      console.warn('Invalid DBC signature');
      return null;
    }

    const fieldCount = view.getUint32(offset, true);
    offset += 4;
    const recordCount = view.getUint32(offset, true);
    offset += 4;
    const fieldSize = view.getUint32(offset, true);
    offset += 4;
    const stringBlockSizeOld = view.getUint32(offset, true);
    offset += 4;

    // Find highest ID currently in DBC
    const recordsStart = offset;
    const stringBlockStart = recordsStart + recordCount * fieldSize;
    let maxId = -1;

    for (let i = 0; i < recordCount; i++) {
      const recordOffset = recordsStart + i * fieldSize;
      const id = view.getUint32(recordOffset, true);
      if (id > maxId) {
        maxId = id;
      }
    }

    const newId = maxId + 1;

    // Read old string block
    const stringBlockOld = buffer.slice(stringBlockStart, stringBlockStart + stringBlockSizeOld);
    const stringBlockText = new TextDecoder().decode(stringBlockOld);

    // Build new string with icon path
    const newStringBlockText = stringBlockText + iconFilename + '\0';
    const newStringBlockSize = new TextEncoder().encode(newStringBlockText).length;
    const pathOffset = stringBlockSizeOld - 1; // Offset in new block where icon path starts

    // Create new DBC buffer
    const newRecordCount = recordCount + 1;
    const newFieldSize = fieldSize;
    const newHeaderSize = 20;
    const newRecordsSize = newRecordCount * newFieldSize;
    const newTotalSize = newHeaderSize + newRecordsSize + newStringBlockSize;

    const newBuffer = new Uint8Array(newTotalSize);
    const newView = new DataView(newBuffer.buffer);

    // Write header
    let writeOffset = 0;
    newBuffer[writeOffset++] = 87; // W
    newBuffer[writeOffset++] = 68; // D
    newBuffer[writeOffset++] = 66; // B
    newBuffer[writeOffset++] = 67; // C
    newView.setUint32(writeOffset, fieldCount, true);
    writeOffset += 4;
    newView.setUint32(writeOffset, newRecordCount, true);
    writeOffset += 4;
    newView.setUint32(writeOffset, newFieldSize, true);
    writeOffset += 4;
    newView.setUint32(writeOffset, newStringBlockSize, true);
    writeOffset += 4;

    // Copy old records
    const recordsSourceStart = recordsStart;
    const recordsDestStart = newHeaderSize;
    const oldRecordsBuffer = buffer.slice(recordsSourceStart, recordsSourceStart + recordCount * fieldSize);
    newBuffer.set(oldRecordsBuffer, recordsDestStart);

    // Add new record
    const newRecordStart = recordsDestStart + recordCount * fieldSize;
    const newRecordView = new DataView(newBuffer.buffer, newRecordStart, fieldSize);
    newRecordView.setUint32(0, newId, true); // field_0 = ID
    newRecordView.setUint32(4, pathOffset, true); // field_1 = string offset

    // Copy string block
    const newStringBlock = new TextEncoder().encode(newStringBlockText);
    newBuffer.set(newStringBlock, recordsDestStart + newRecordsSize);

    // Write updated DBC
    fs.writeFileSync(dbcPath, newBuffer);
    console.log(`✓ Added icon to DBC: "${iconFilename}" with ID ${newId}`);

    return {
      success: true,
      id: newId,
      filename: iconFilename,
      dbcPath
    };
  } catch (err) {
    console.error(`Error updating DBC: ${err.message}`);
    return null;
  }
}

/**
 * Batch update SpellIcon.dbc with multiple icons
 */
export function addIconsToDbc(dbcPath, iconFilenames) {
  const results = [];
  for (const filename of iconFilenames) {
    const result = addIconToSpellIconDbc(dbcPath, filename);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

/**
 * Initialize SpellIcon.dbc if it doesn't exist
 */
export function initializeSpellIconDbc(dbcPath) {
  try {
    if (fs.existsSync(dbcPath)) {
      return { exists: true };
    }

    // Create minimal DBC: 2 fields (ID, iconPath)
    const fieldCount = 2;
    const recordCount = 0;
    const fieldSize = fieldCount * 4;
    const stringBlockSize = 1;
    const totalSize = 20 + recordCount * fieldSize + stringBlockSize;

    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);

    buffer[0] = 87; // W
    buffer[1] = 68; // D
    buffer[2] = 66; // B
    buffer[3] = 67; // C
    view.setUint32(4, fieldCount, true);
    view.setUint32(8, recordCount, true);
    view.setUint32(12, fieldSize, true);
    view.setUint32(16, stringBlockSize, true);
    buffer[20] = 0; // Null terminator for empty string block

    fs.writeFileSync(dbcPath, buffer);
    console.log(`✓ Created empty SpellIcon.dbc: ${dbcPath}`);
    return { created: true, path: dbcPath };
  } catch (err) {
    console.error(`Error initializing DBC: ${err.message}`);
    return null;
  }
}
