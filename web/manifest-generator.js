import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BLPFile } from './src/lib/blpconverter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const THUMBNAILS_DIR = path.join(PUBLIC_DIR, 'thumbnails');

/**
 * Load SpellIcon.dbc and extract ID -> filename mappings
 */
function loadIconDbcMappings(dbcPath) {
  try {
    if (!fs.existsSync(dbcPath)) {
      return new Map(); // Return empty map if no DBC yet
    }

    const buffer = fs.readFileSync(dbcPath);
    const view = new DataView(buffer);
    let offset = 0;

    // Read DBC header
    const signature = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    offset += 4;

    if (signature !== 'WDBC') {
      console.warn('Invalid DBC signature');
      return new Map();
    }

    const fieldCount = view.getUint32(offset, true);
    offset += 4;
    const recordCount = view.getUint32(offset, true);
    offset += 4;
    const fieldSize = view.getUint32(offset, true);
    offset += 4;
    const stringBlockSize = view.getUint32(offset, true);
    offset += 4;

    // Read records (ID is field_0, path string offset is field_1)
    const recordsStart = offset;
    const stringBlockStart = recordsStart + recordCount * fieldSize;
    const stringBlock = buffer.slice(stringBlockStart, stringBlockStart + stringBlockSize);
    const stringBlockText = new TextDecoder().decode(stringBlock);

    const mappings = new Map(); // ID -> filename

    for (let i = 0; i < recordCount; i++) {
      const recordOffset = recordsStart + i * fieldSize;
      const id = view.getUint32(recordOffset, true); // field_0
      const pathOffset = view.getUint32(recordOffset + 4, true); // field_1

      // Extract string from string block
      let pathEnd = pathOffset;
      while (
        pathEnd < stringBlockText.length &&
        stringBlockText.charCodeAt(pathEnd) !== 0
      ) {
        pathEnd++;
      }

      const iconPath = stringBlockText.substring(pathOffset, pathEnd);
      if (iconPath) {
        mappings.set(id, iconPath);
      }
    }

    return mappings;
  } catch (err) {
    console.error(`Error loading DBC mappings: ${err.message}`);
    return new Map();
  }
}

/**
 * Generate icon manifest with thumbnail status and DBC mappings
 */
export async function generateIconManifest(iconDirPath, customDbcPath) {
  try {
    console.log('Generating icon manifest...');

    // Load DBC mappings
    const dbcMappings = loadIconDbcMappings(customDbcPath);

    // Scan icon directory
    if (!fs.existsSync(iconDirPath)) {
      console.log(`Icon directory not found: ${iconDirPath}`);
      return null;
    }

    const files = fs.readdirSync(iconDirPath).filter(f => f.toLowerCase().endsWith('.blp'));
    const icons = [];

    for (const file of files) {
      const thumbnail = fs.existsSync(path.join(THUMBNAILS_DIR, file.replace(/\.blp$/i, '.png')));

      // Find ID in DBC
      let id = null;
      for (const [dbcId, dbcPath] of dbcMappings) {
        if (dbcPath.toLowerCase() === file.toLowerCase()) {
          id = dbcId;
          break;
        }
      }

      icons.push({
        id,
        name: file,
        thumbnail,
        inDbc: id !== null
      });
    }

    // Sort by name for consistent output
    icons.sort((a, b) => a.name.localeCompare(b.name));

    const manifest = {
      generated: new Date().toISOString(),
      count: icons.length,
      withThumbnails: icons.filter(i => i.thumbnail).length,
      inDbc: icons.filter(i => i.inDbc).length,
      icons
    };

    return manifest;
  } catch (err) {
    console.error(`Error generating manifest: ${err.message}`);
    return null;
  }
}

/**
 * Save manifest to file
 */
export function saveManifest(manifest, outputPath) {
  try {
    if (!manifest) return false;
    const manifestPath = outputPath || path.join(PUBLIC_DIR, 'icon-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifest.count} icons, ${manifest.withThumbnails} with thumbnails, ${manifest.inDbc} in DBC`);
    return true;
  } catch (err) {
    console.error(`Error saving manifest: ${err.message}`);
    return false;
  }
}

/**
 * Get missing thumbnails
 */
export function getMissingThumbnails(manifest) {
  if (!manifest) return [];
  return manifest.icons
    .filter(icon => !icon.thumbnail)
    .map(icon => icon.name);
}

/**
 * Generate missing thumbnails from BLP files
 */
export async function generateMissingThumbnails(iconDirPath) {
  try {
    const manifest = await generateIconManifest(iconDirPath, path.join(PUBLIC_DIR, 'custom-dbc', 'SpellIcon.dbc'));
    if (!manifest) return { generated: 0, failed: 0 };

    const missing = getMissingThumbnails(manifest);
    console.log(`Found ${missing.length} icons missing thumbnails`);

    let generated = 0;
    let failed = 0;

    for (const file of missing) {
      try {
        const sharp = (await import('sharp')).default;
        const blpPath = path.join(iconDirPath, file);
        const thumbPath = path.join(THUMBNAILS_DIR, file.replace(/\.blp$/i, '.png'));

        const blpData = fs.readFileSync(blpPath);
        const blp = new BLPFile(new Uint8Array(blpData));
        const pixels = blp.getPixels(0);
        const rgba = pixels?.buffer ? new Uint8Array(pixels.buffer) : new Uint8Array(pixels);

        const buffer = await sharp(rgba, {
          raw: { width: blp.width, height: blp.height, channels: 4 }
        })
          .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();

        fs.writeFileSync(thumbPath, buffer);
        console.log(`✓ Generated thumbnail: ${file}`);
        generated++;
      } catch (err) {
        console.error(`✗ Failed thumbnail: ${file} - ${err.message}`);
        failed++;
      }
    }

    console.log(`Thumbnail generation: ${generated} generated, ${failed} failed`);
    return { generated, failed };
  } catch (err) {
    console.error(`Error generating thumbnails: ${err.message}`);
    return { generated: 0, failed: 0 };
  }
}

/**
 * Full manifest update cycle with thumbnail generation
 */
export async function updateFullManifest(iconDirPath, customDbcPath) {
  try {
    console.log('🔄 Starting full manifest update...');

    // Generate missing thumbnails
    const thumbResult = await generateMissingThumbnails(iconDirPath);

    // Generate manifest
    const manifest = await generateIconManifest(iconDirPath, customDbcPath);

    // Save to file
    const saved = saveManifest(manifest, path.join(PUBLIC_DIR, 'icon-manifest.json'));

    if (saved) {
      console.log(`✅ Manifest update complete! (${thumbResult.generated} thumbnails, ${thumbResult.failed} failed)`);
      return { success: true, manifest, ...thumbResult };
    } else {
      console.error('❌ Failed to save manifest');
      return { success: false, ...thumbResult };
    }
  } catch (err) {
    console.error(`Error in full manifest update: ${err.message}`);
    return { success: false, generated: 0, failed: 0 };
  }
}
