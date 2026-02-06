import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fileUpload from 'express-fileupload';
import cors from 'cors';
import compression from 'compression';
import sharp from 'sharp';
import { BLPFile } from './src/lib/blpconverter.js';
import { startThumbnailWatcher } from './thumbnail-watcher.js';
import { generateIconManifest, saveManifest, updateFullManifest } from './manifest-generator.js';
import { addIconToSpellIconDbc, initializeSpellIconDbc } from './dbc-updater.js';
import { generateSpriteSheets } from './sprite-generator.js';

// Error logging setup
const ERROR_LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'error-logs');
const ERROR_LOG_FILE = path.join(ERROR_LOG_DIR, 'server-errors.log');
if (!fs.existsSync(ERROR_LOG_DIR)) {
  fs.mkdirSync(ERROR_LOG_DIR, { recursive: true });
}
function logErrorToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(ERROR_LOG_FILE, `[${timestamp}] ${message}\n`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));
app.use(fileUpload());
app.use(cors({ origin: true }));
app.use(compression()); // Gzip compression for responses

// Cache static assets (images, icons, thumbnails)
app.use((req, res, next) => {
  if (req.url.match(/\.(png|jpg|jpeg|gif|blp|ico|webp)$/i)) {
    res.set('Cache-Control', 'public, max-age=2592000'); // 30 days for images
  } else if (req.url.match(/\.(css|js)$/i)) {
    res.set('Cache-Control', 'public, max-age=86400'); // 1 day for code
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Enable CORS for Vite dev server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

const PUBLIC_DIR = path.join(__dirname, 'public');
const CONFIG_PATH = path.join(PUBLIC_DIR, 'config.json');

const DEFAULT_CONFIG = {
  paths: {
    base: {
      dbc: 'dbc',
      icons: 'Icon',
      description: 'Default WoW 3.3.5 WotLK files (read-only reference)',
    },
    custom: {
      dbc: 'custom-dbc',
      icons: 'custom-icon',
      description: 'Custom user-modified files for server integration',
    },
  },
  settings: {
    activeDBCSource: 'custom',
    activeIconSource: 'custom',
    allowBaseModification: false,
    initialized: false,
  },
};

function loadConfigFile() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      paths: {
        ...DEFAULT_CONFIG.paths,
        ...(parsed.paths || {}),
        base: { ...DEFAULT_CONFIG.paths.base, ...(parsed.paths?.base || {}) },
        custom: { ...DEFAULT_CONFIG.paths.custom, ...(parsed.paths?.custom || {}) },
      },
      settings: {
        ...DEFAULT_CONFIG.settings,
        ...(parsed.settings || {}),
      },
    };
  } catch (error) {
    console.error('Failed to read config.json:', error);
    logErrorToFile(`Failed to read config.json: ${error.stack || error}`);
    return DEFAULT_CONFIG;
  }
}

function getActiveDBCDir(config) {
  return config?.paths?.custom?.dbc || DEFAULT_CONFIG.paths.custom.dbc;
}

function getActiveIconDir(config) {
  return config?.paths?.custom?.icons || DEFAULT_CONFIG.paths.custom.icons;
}

// DBC Parser - Read TalentTab.dbc to get tab names
function parseTalentTabDBC(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 20) return {};

    const magic = buffer.toString('utf-8', 0, 4);
    if (magic !== 'WDBC') return {};

    const recordCount = buffer.readUInt32LE(4);
    const fieldCount = buffer.readUInt32LE(8);
    const recordSize = buffer.readUInt32LE(12);
    const stringBlockSize = buffer.readUInt32LE(16);

    const headerSize = 20;
    const recordsOffset = headerSize;
    const stringBlockOffset = recordsOffset + (recordCount * recordSize);
    const tabNames = {};

    // TalentTab.dbc structure (WoW 3.3.5):
    // 0: TabID (uint32) - offset 0
    // 1-16: Name localized strings (17 string refs, offset 4-68)
    // First name (enUS) is at offset 4

    for (let i = 0; i < recordCount; i++) {
      const offset = recordsOffset + (i * recordSize);
      try {
        const tabId = buffer.readUInt32LE(offset);
        const nameOffset = buffer.readUInt32LE(offset + 4); // enUS name
        
        // Read string from string block
        if (nameOffset < stringBlockSize) {
          const stringStart = stringBlockOffset + nameOffset;
          let stringEnd = stringStart;
          while (stringEnd < buffer.length && buffer[stringEnd] !== 0) {
            stringEnd++;
          }
          const name = buffer.toString('utf-8', stringStart, stringEnd);
          if (name) {
            tabNames[tabId] = name;
          }
        }
      } catch (e) {
        // Skip malformed records
      }
    }

    return tabNames;
  } catch (error) {
    console.error('Error parsing TalentTab.dbc:', error);
    logErrorToFile(`Error parsing TalentTab.dbc: ${error.stack || error}`);
    return {};
  }
}

// DBC Parser - Read Talent.dbc to get talent data (full 23-field record)
function parseTalentDBC(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 20) return [];

    const magic = buffer.toString('utf-8', 0, 4);
    if (magic !== 'WDBC') return [];

    const recordCount = buffer.readUInt32LE(4);
    const recordSize = buffer.readUInt32LE(12);

    const headerSize = 20;
    const recordsOffset = headerSize;
    const talents = [];

    // Talent.dbc full structure (23 uint32 fields, 92 bytes per record):
    // [0]  offset  0: ID
    // [1]  offset  4: TabID (ref TalentTab.dbc)
    // [2]  offset  8: TierID (row 0-10)
    // [3]  offset 12: ColumnIndex (col 0-3)
    // [4-12] offset 16-48: SpellRank[9] (rank 1 through 9 spell IDs, 0 if unused)
    // [13-15] offset 52-60: PrereqTalent[3] (required talent IDs, 0 if none)
    // [16-18] offset 64-72: PrereqRank[3] (required points in prereq talent)
    // [19] offset 76: Flags (1 = single-point talent)
    // [20] offset 80: RequiredSpellID
    // [21-22] offset 84-88: AllowForPetFlags[2]

    for (let i = 0; i < recordCount; i++) {
      const offset = recordsOffset + (i * recordSize);
      try {
        const id = buffer.readUInt32LE(offset);
        const tabId = buffer.readUInt32LE(offset + 4);
        const tierId = buffer.readUInt32LE(offset + 8);
        const columnIndex = buffer.readUInt32LE(offset + 12);

        // Read all 9 spell ranks
        const spellRanks = [];
        for (let r = 0; r < 9; r++) {
          spellRanks.push(buffer.readUInt32LE(offset + 16 + r * 4));
        }

        // Read prereq talents (3 slots)
        const prereqTalents = [];
        for (let p = 0; p < 3; p++) {
          prereqTalents.push(buffer.readUInt32LE(offset + 52 + p * 4));
        }

        // Read prereq ranks (3 slots)
        const prereqRanks = [];
        for (let p = 0; p < 3; p++) {
          prereqRanks.push(buffer.readUInt32LE(offset + 64 + p * 4));
        }

        const flags = buffer.readUInt32LE(offset + 76);
        const requiredSpellId = buffer.readUInt32LE(offset + 80);
        const petFlags = [
          buffer.readUInt32LE(offset + 84),
          buffer.readUInt32LE(offset + 88),
        ];

        // Count actual ranks (non-zero spell IDs)
        const maxRank = spellRanks.filter(s => s !== 0).length;

        talents.push({
          id,
          tabId,
          row: tierId,
          column: columnIndex,
          spellId: spellRanks[0], // keep for backward compat
          spellRanks,
          maxRank,
          prereqTalents,
          prereqRanks,
          flags,
          requiredSpellId,
          petFlags,
        });
      } catch (e) {
        // Skip malformed records
      }
    }

    return talents;
  } catch (error) {
    console.error('Error parsing Talent.dbc:', error);
    logErrorToFile(`Error parsing Talent.dbc: ${error.stack || error}`);
    return {};
  }
}

// WoW 3.3.5 class to talent tab IDs mapping
// These are the actual tab IDs from the Talent.dbc file  
const classToTabMapping = {
  warrior: [161, 164, 163],        // Arms, Fury, Protection
  paladin: [381, 382, 383],        // Holy, Protection (Parry), Retribution
  hunter: [361, 362, 363],         // Beast Mastery (RavenForm), Marksmanship (ImprovedTracking), Survival
  rogue: [181, 182, 183],          // Assassination (Gouge), Combat (Eviscerate), Subtlety (Ambush)
  priest: [201, 202, 203],         // Discipline, Holy (HealingFocus), Shadow (Requiem)
  'death-knight': [398, 399, 400], // Blood, Frost (IceTouch), Unholy (PlagueStrike)
  shaman: [261, 262, 263],         // Elemental (WispSplode), Enhancement (MagicImmunity), Restoration (Totems)
  mage: [41, 61, 81],              // Fire (Fireball), Frost (FrostArmor), Arcane (DispelMagic)
  warlock: [301, 302, 303],        // Affliction (ShadowBolt), Demonology (Imp), Destruction
  druid: [281, 282, 283],          // Balance (Pet_Hyena), Feral (Druid_DemoralizingRoar), Restoration (Regeneration)
};

// Cache for expensive DBC parsing operations
const dbcCache = {
  talents: null,
  spellIconMap: null,
  spellToIconMap: null,
  spellIconIndex: null,  // Pre-built spellId → iconBaseName index
  tabNames: null,
  lastModified: {
    talentDbc: 0,
    spellIconDbc: 0,
    spellDbc: 0,
    talentTabDbc: 0,
  }
};

// ===== Spell-Icon Index =====
// Pre-builds a direct spellId → iconBaseName mapping, collapsing the
// Spell.dbc (spellId→spellIconId) + SpellIcon.dbc (spellIconId→iconPath) join
// into a single fast lookup. Persists to disk and only rebuilds when DBC files change.

const SPELL_ICON_INDEX_PATH = path.join(PUBLIC_DIR, 'spell-icon-index.json');

function buildSpellIconIndex(dbcDir) {
  const startTime = Date.now();
  const spellPath = path.join(dbcDir, 'Spell.dbc');
  const spellIconPath = path.join(dbcDir, 'SpellIcon.dbc');

  if (!fs.existsSync(spellPath) || !fs.existsSync(spellIconPath)) {
    console.log('⚠ Cannot build spell-icon index: DBC files not found');
    return null;
  }

  // Step 1: Parse SpellIcon.dbc → Map<spellIconId, iconBaseName>
  const iconBuffer = fs.readFileSync(spellIconPath);
  if (iconBuffer.length < 20 || iconBuffer.toString('utf-8', 0, 4) !== 'WDBC') return null;
  const iconView = new DataView(iconBuffer.buffer, iconBuffer.byteOffset, iconBuffer.byteLength);
  const iconRecordCount = iconView.getUint32(4, true);
  const iconRecordSize = iconView.getUint32(12, true);
  const iconHeaderSize = 20;
  const iconStringBlockOffset = iconHeaderSize + (iconRecordCount * iconRecordSize);

  const readIconString = (offset) => {
    if (offset === 0) return '';
    const start = iconStringBlockOffset + offset;
    let end = start;
    while (end < iconBuffer.length && iconBuffer[end] !== 0) end++;
    return iconBuffer.slice(start, end).toString('utf8');
  };

  const spellIconMap = new Map();
  for (let i = 0; i < iconRecordCount; i++) {
    const off = iconHeaderSize + (i * iconRecordSize);
    const id = iconView.getUint32(off, true);
    let iconPath = readIconString(iconView.getUint32(off + 4, true));
    if (iconPath) {
      iconPath = iconPath.replace(/\\/g, '/');
      if (iconPath.includes('/')) iconPath = iconPath.substring(iconPath.lastIndexOf('/') + 1);
      iconPath = iconPath.replace(/\.[^.]+$/, '');
    }
    if (iconPath) spellIconMap.set(id, iconPath);
  }

  // Step 2: Parse Spell.dbc → Map<spellId, spellIconId>
  const spellBuffer = fs.readFileSync(spellPath);
  if (spellBuffer.length < 20 || spellBuffer.toString('utf-8', 0, 4) !== 'WDBC') return null;
  const spellView = new DataView(spellBuffer.buffer, spellBuffer.byteOffset, spellBuffer.byteLength);
  const spellRecordCount = spellView.getUint32(4, true);
  const spellRecordSize = spellView.getUint32(12, true);
  const spellHeaderSize = 20;

  // Step 3: Join into spellId → iconBaseName
  const index = {};
  for (let i = 0; i < spellRecordCount; i++) {
    const off = spellHeaderSize + (i * spellRecordSize);
    const spellId = spellView.getUint32(off, true);
    const spellIconId = spellView.getUint32(off + 532, true);
    const iconName = spellIconMap.get(spellIconId);
    if (iconName) index[spellId] = iconName;
  }

  // Step 4: Write to disk
  const meta = {
    builtAt: new Date().toISOString(),
    spellCount: Object.keys(index).length,
    spellDbc: { records: spellRecordCount, mtime: fs.statSync(spellPath).mtimeMs },
    spellIconDbc: { records: iconRecordCount, mtime: fs.statSync(spellIconPath).mtimeMs },
  };
  const payload = { meta, index };
  fs.writeFileSync(SPELL_ICON_INDEX_PATH, JSON.stringify(payload));

  const duration = Date.now() - startTime;
  console.log(`✓ Spell-icon index built: ${meta.spellCount} entries in ${duration}ms`);

  // Also populate in-memory cache
  dbcCache.spellIconIndex = index;
  return index;
}

// Load from disk or rebuild if stale
function loadOrBuildSpellIconIndex() {
  const config = loadConfigFile();
  const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
  const spellPath = path.join(dbcDir, 'Spell.dbc');
  const spellIconPath = path.join(dbcDir, 'SpellIcon.dbc');

  if (!fs.existsSync(spellPath) || !fs.existsSync(spellIconPath)) return null;

  // Check if index file exists and is newer than both DBC files
  if (fs.existsSync(SPELL_ICON_INDEX_PATH)) {
    const indexMtime = fs.statSync(SPELL_ICON_INDEX_PATH).mtimeMs;
    const spellMtime = fs.statSync(spellPath).mtimeMs;
    const iconMtime = fs.statSync(spellIconPath).mtimeMs;

    if (indexMtime > spellMtime && indexMtime > iconMtime) {
      try {
        const data = JSON.parse(fs.readFileSync(SPELL_ICON_INDEX_PATH, 'utf8'));
        dbcCache.spellIconIndex = data.index;
        console.log(`✓ Spell-icon index loaded from disk: ${data.meta.spellCount} entries (cached)`);
        return data.index;
      } catch (e) {
        console.log('⚠ Cached spell-icon index corrupt, rebuilding...');
      }
    } else {
      console.log('⚠ DBC files changed since last index, rebuilding...');
    }
  }

  return buildSpellIconIndex(dbcDir);
}

function getCachedOrParse(cacheKey, filePath, parseFunction) {
  try {
    if (!fs.existsSync(filePath)) return null;
    
    const stats = fs.statSync(filePath);
    const mtime = stats.mtimeMs;
    
    // Check if file was modified
    if (dbcCache.lastModified[cacheKey] !== mtime) {
      dbcCache.lastModified[cacheKey] = mtime;
      const result = parseFunction(filePath);
      return result;
    }
    
    return null; // Cached version will be used
  } catch (err) {
    console.error(`Cache check failed for ${cacheKey}:`, err);
    return null;
  }
}

// Thumbnail generation system
const THUMBNAILS_DIR = path.join(PUBLIC_DIR, 'thumbnails');

async function ensureThumbnailsDir() {
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }
}

async function generateThumbnailsForIcons() {
  try {
    await ensureThumbnailsDir();
    const config = loadConfig();
    const customIconDir = getActiveIconDir(config);
    const iconDirPath = path.join(PUBLIC_DIR, customIconDir);

    if (!fs.existsSync(iconDirPath)) {
      console.log(`Icon directory not found: ${iconDirPath}`);
      return { generated: 0, skipped: 0, failed: 0 };
    }

    const files = fs.readdirSync(iconDirPath).filter(f => f.toLowerCase().endsWith('.blp'));
    let generated = 0, skipped = 0, failed = 0;

    for (const file of files) {
      try {
        const iconPath = path.join(iconDirPath, file);
        const thumbnailPath = path.join(THUMBNAILS_DIR, file.replace(/\.blp$/i, '.png'));
        
        // Skip if thumbnail already exists
        if (fs.existsSync(thumbnailPath)) {
          skipped++;
          continue;
        }

        const blpData = fs.readFileSync(iconPath);
        
        // Decode BLP file using BLPFile decoder
        const blp = new BLPFile(new Uint8Array(blpData));
        const pixels = blp.getPixels(0);
        
        // Get RGBA pixel data
        const rgba = pixels?.buffer ? new Uint8Array(pixels.buffer) : new Uint8Array(pixels);
        
        // Convert RGBA to PNG using Sharp
        const buffer = await sharp(rgba, {
          raw: {
            width: blp.width,
            height: blp.height,
            channels: 4
          }
        })
        .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

        fs.writeFileSync(thumbnailPath, buffer);
        generated++;
      } catch (err) {
        console.error(`Failed to generate thumbnail for ${file}:`, err.message);
        failed++;
      }
    }

    console.log(`Thumbnail generation: ${generated} generated, ${skipped} skipped, ${failed} failed`);
    return { generated, skipped, failed };
  } catch (err) {
    console.error('Thumbnail generation failed:', err);
    logErrorToFile(`Thumbnail generation failed: ${err.stack || err}`);
    return { generated: 0, skipped: 0, failed: 0 };
  }
}

// Debug: Get all talent tree IDs and how many talents in each
app.get('/api/debug/talent-trees', (req, res) => {
  try {
    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const talentPath = path.join(dbcDir, 'Talent.dbc');
    const talentTabPath = path.join(dbcDir, 'TalentTab.dbc');
    
    if (!fs.existsSync(talentPath)) {
      return res.status(404).json({ error: 'Talent.dbc not found' });
    }

    // Parse TalentTab.dbc to get spec names
    const tabNames = fs.existsSync(talentTabPath) ? parseTalentTabDBC(talentTabPath) : {};

    const buffer = fs.readFileSync(talentPath);
    if (buffer.length < 20) {
      return res.status(400).json({ error: 'Invalid Talent.dbc' });
    }

    const magic = buffer.toString('utf-8', 0, 4);
    if (magic !== 'WDBC') {
      return res.status(400).json({ error: 'Invalid DBC format' });
    }

    const recordCount = buffer.readUInt32LE(4);
    const recordSize = buffer.readUInt32LE(12);
    const headerSize = 20;
    const recordsOffset = headerSize;

    // Group talents by TabId
    const talentsByTabId = {};
    
    for (let i = 0; i < recordCount; i++) {
      const offset = recordsOffset + (i * recordSize);
      if (offset + 8 > buffer.length) break;
      
      try {
        const tabId = buffer.readUInt32LE(offset + 4);
        talentsByTabId[tabId] = (talentsByTabId[tabId] || 0) + 1;
      } catch (e) {
        // Skip errors
      }
    }

    res.json({
      message: 'Talent tree IDs found in Talent.dbc',
      totalTalents: recordCount,
      tabIds: talentsByTabId,
      tabIdsSorted: Object.keys(talentsByTabId).map(Number).sort((a, b) => a - b),
      tabNames: tabNames, // Add spec names from TalentTab.dbc
      currentMapping: classToTabMapping,
    });
  } catch (err) {
    console.error('Debug error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to get talent tab names from TalentTab.dbc (with caching)
app.get('/api/talent-tab-names', (req, res) => {
  try {
    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const talentTabPath = path.join(dbcDir, 'TalentTab.dbc');
    
    if (!fs.existsSync(talentTabPath)) {
      return res.status(404).json({ error: 'TalentTab.dbc not found' });
    }

    // Use cached or parse TalentTab.dbc
    if (!dbcCache.tabNames || getCachedOrParse('talentTabDbc', talentTabPath, () => true)) {
      dbcCache.tabNames = parseTalentTabDBC(talentTabPath);
    }
    
    // Add cache headers (1 hour - tab names rarely change)
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      tabNames: dbcCache.tabNames,
      classToTabMapping,
    });
  } catch (err) {
    console.error('Error reading talent tab names:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to get talents for a class with icon paths (with caching)
app.get('/api/talents/:className', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { className } = req.params;
    const tabIds = classToTabMapping[className.toLowerCase()];

    if (!tabIds) {
      return res.json({ 
        talents: [],
        specs: [
          { tabId: 0, talents: [] },
          { tabId: 1, talents: [] },
          { tabId: 2, talents: [] },
        ]
      });
    }

    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const talentPath = path.join(dbcDir, 'Talent.dbc');
    
    // Use cached or parse Talent.dbc
    if (!dbcCache.talents || getCachedOrParse('talentDbc', talentPath, () => true)) {
      dbcCache.talents = parseTalentDBC(talentPath);
    }
    const allTalents = dbcCache.talents;

    // Use pre-built spell-icon index (spellId → iconBaseName directly)
    if (!dbcCache.spellIconIndex) {
      loadOrBuildSpellIconIndex();
    }
    const spellIconIndex = dbcCache.spellIconIndex || {};

    // Load sprite map for this class
    const spriteMapPath = path.join(PUBLIC_DIR, 'sprites', 'sprite-map.json');
    let spriteMap = null;
    if (fs.existsSync(spriteMapPath)) {
      try {
        spriteMap = JSON.parse(fs.readFileSync(spriteMapPath, 'utf8'));
      } catch (e) { /* ignore */ }
    }

    // Enrich talents with icon paths and sprite coordinates
    const enrichedTalents = allTalents.map(talent => {
      // Direct lookup from pre-built index (no two-step DBC join needed)
      let iconPath = spellIconIndex[talent.spellId] || null;
      
      // Look up sprite coordinates from per-class mapping
      let sprite = null;
      if (spriteMap && iconPath) {
        const classIcons = spriteMap.classes?.[className];
        if (classIcons) {
          // Try exact match first
          let entry = classIcons[iconPath];
          
          // Fallback: case-insensitive match
          if (!entry) {
            const lowerPath = iconPath.toLowerCase();
            const matchKey = Object.keys(classIcons).find(
              k => k.toLowerCase() === lowerPath
            );
            if (matchKey) entry = classIcons[matchKey];
          }
          
          if (entry) {
            sprite = {
              sheet: className, // always the current class's sprite sheet
              x: entry.x,
              y: entry.y,
            };
          }
        }
      }
      
      return {
        ...talent,
        iconPath,
        sprite,
      };
    });

    // Group talents by tab (spec) using the tabIds for this class
    const specs = tabIds.map((tabId, specIdx) => {
      const specTalents = enrichedTalents
        .filter(t => t.tabId === tabId)
        .sort((a, b) => a.row - b.row || a.column - b.column);

      return {
        tabId,
        talents: specTalents,
      };
    });

    const duration = Date.now() - startTime;
    console.log(`Talents API [${className}]: ${duration}ms`);
    
    // Add cache headers (5 minutes)
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ 
      className,
      specs,
      spriteSheet: `/sprites/${className.toLowerCase()}.png`,
      spriteIconSize: spriteMap?.iconSize || 64,
      spriteIconsPerRow: spriteMap?.iconsPerRow || 16,
    });
  } catch (error) {
    console.error('Error fetching talents:', error);
    logErrorToFile(`Error fetching talents: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Get sprite map for optimized icon loading
app.get('/api/sprite-map', (req, res) => {
  try {
    const spriteMapPath = path.join(PUBLIC_DIR, 'sprites', 'sprite-map.json');
    if (!fs.existsSync(spriteMapPath)) {
      return res.status(404).json({ 
        error: 'Sprite map not found. Sprites may still be generating.'
      });
    }
    const spriteMap = JSON.parse(fs.readFileSync(spriteMapPath, 'utf8'));
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.json(spriteMap);
  } catch (err) {
    console.error('Failed to read sprite map:', err);
    res.status(500).json({ error: 'Failed to read sprite map' });
  }
});

// ===== Talent Editor API Endpoints =====

// Save modified talents back to Talent.dbc
app.post('/api/talents/save', (req, res) => {
  try {
    const { talents } = req.body;
    if (!talents || !Array.isArray(talents)) {
      return res.status(400).json({ error: 'Missing talents array' });
    }

    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const talentPath = path.join(dbcDir, 'Talent.dbc');

    if (!fs.existsSync(talentPath)) {
      return res.status(404).json({ error: 'Talent.dbc not found' });
    }

    // Read existing file to preserve header and record structure
    const buffer = Buffer.from(fs.readFileSync(talentPath));
    const magic = buffer.toString('utf-8', 0, 4);
    if (magic !== 'WDBC') {
      return res.status(400).json({ error: 'Invalid Talent.dbc format' });
    }

    const recordCount = buffer.readUInt32LE(4);
    const recordSize = buffer.readUInt32LE(12);
    const headerSize = 20;

    // Build a map of existing record positions by talent ID
    const idToOffset = new Map();
    for (let i = 0; i < recordCount; i++) {
      const offset = headerSize + (i * recordSize);
      const id = buffer.readUInt32LE(offset);
      idToOffset.set(id, offset);
    }

    // Apply edits to the buffer
    let modified = 0;
    for (const talent of talents) {
      const offset = idToOffset.get(talent.id);
      if (offset === undefined) {
        console.warn(`Talent ID ${talent.id} not found in DBC, skipping`);
        continue;
      }

      // Write all 23 fields
      buffer.writeUInt32LE(talent.id, offset);
      buffer.writeUInt32LE(talent.tabId, offset + 4);
      buffer.writeUInt32LE(talent.row, offset + 8);
      buffer.writeUInt32LE(talent.column, offset + 12);

      // Spell ranks (9 slots)
      const ranks = talent.spellRanks || [talent.spellId || 0];
      for (let r = 0; r < 9; r++) {
        buffer.writeUInt32LE(ranks[r] || 0, offset + 16 + r * 4);
      }

      // Prereq talents (3 slots)
      const prereqs = talent.prereqTalents || [0, 0, 0];
      for (let p = 0; p < 3; p++) {
        buffer.writeUInt32LE(prereqs[p] || 0, offset + 52 + p * 4);
      }

      // Prereq ranks (3 slots)
      const prereqRanks = talent.prereqRanks || [0, 0, 0];
      for (let p = 0; p < 3; p++) {
        buffer.writeUInt32LE(prereqRanks[p] || 0, offset + 64 + p * 4);
      }

      buffer.writeUInt32LE(talent.flags || 0, offset + 76);
      buffer.writeUInt32LE(talent.requiredSpellId || 0, offset + 80);

      const petFlags = talent.petFlags || [0, 0];
      buffer.writeUInt32LE(petFlags[0] || 0, offset + 84);
      buffer.writeUInt32LE(petFlags[1] || 0, offset + 88);

      modified++;
    }

    // Backup original before writing
    const backupPath = talentPath + '.bak';
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(talentPath, backupPath);
      console.log('Created Talent.dbc backup');
    }

    // Write modified buffer to primary location
    fs.writeFileSync(talentPath, buffer);

    // Also write to export/DBFilesClient
    const exportDir = path.join(PUBLIC_DIR, 'export', 'DBFilesClient');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    const exportPath = path.join(exportDir, 'Talent.dbc');
    fs.writeFileSync(exportPath, buffer);

    // Also write to custom-dbc if the active dir is different
    const customDbcDir = path.join(PUBLIC_DIR, 'custom-dbc');
    const customDbcPath = path.join(customDbcDir, 'Talent.dbc');
    if (talentPath !== customDbcPath) {
      if (!fs.existsSync(customDbcDir)) fs.mkdirSync(customDbcDir, { recursive: true });
      fs.writeFileSync(customDbcPath, buffer);
    }

    // Invalidate DBC cache
    dbcCache.talents = null;
    if (dbcCache.lastModified) dbcCache.lastModified.talentDbc = 0;

    console.log(`Talent.dbc saved: ${modified} talents modified (written to ${talentPath}, ${exportPath}${talentPath !== customDbcPath ? ', ' + customDbcPath : ''})`);
    res.json({ success: true, modified, total: recordCount });
  } catch (error) {
    console.error('Error saving Talent.dbc:', error);
    logErrorToFile(`Error saving Talent.dbc: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Add a new talent record to Talent.dbc
app.post('/api/talents/add', (req, res) => {
  try {
    const { tabId, row, column, spellId, spellRanks, prereqTalents, prereqRanks, flags, requiredSpellId, petFlags } = req.body;
    if (tabId === undefined || row === undefined || column === undefined) {
      return res.status(400).json({ error: 'Missing tabId, row, or column' });
    }

    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const talentPath = path.join(dbcDir, 'Talent.dbc');

    if (!fs.existsSync(talentPath)) {
      return res.status(404).json({ error: 'Talent.dbc not found' });
    }

    const oldBuffer = fs.readFileSync(talentPath);
    const magic = oldBuffer.toString('utf-8', 0, 4);
    if (magic !== 'WDBC') {
      return res.status(400).json({ error: 'Invalid Talent.dbc format' });
    }

    const recordCount = oldBuffer.readUInt32LE(4);
    const fieldCount = oldBuffer.readUInt32LE(8);
    const recordSize = oldBuffer.readUInt32LE(12);
    const stringBlockSize = oldBuffer.readUInt32LE(16);
    const headerSize = 20;

    // Find the highest existing talent ID
    let maxId = 0;
    for (let i = 0; i < recordCount; i++) {
      const offset = headerSize + (i * recordSize);
      const id = oldBuffer.readUInt32LE(offset);
      if (id > maxId) maxId = id;
    }
    const newId = maxId + 1;

    // Backup before modifying
    const backupPath = talentPath + '.bak';
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(talentPath, backupPath);
      console.log('Created Talent.dbc backup');
    }

    // Create new buffer: old data + 1 new record
    const recordsEnd = headerSize + (recordCount * recordSize);
    const stringBlock = oldBuffer.slice(recordsEnd);
    const newBuffer = Buffer.alloc(headerSize + ((recordCount + 1) * recordSize) + stringBlock.length);

    // Copy header
    oldBuffer.copy(newBuffer, 0, 0, headerSize);
    // Update record count
    newBuffer.writeUInt32LE(recordCount + 1, 4);

    // Copy existing records
    oldBuffer.copy(newBuffer, headerSize, headerSize, recordsEnd);

    // Write new record at end of record block
    // Fields: id, tabId, row, col, spellRank[9], prereqTalent[3], prereqRank[3], flags, requiredSpellId, petFlags[2]
    const newOffset = headerSize + (recordCount * recordSize);
    const ranks = spellRanks || [spellId || 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const prereqs = prereqTalents || [0, 0, 0];
    const preReqRanks = prereqRanks || [0, 0, 0];
    const pFlags = petFlags || [0, 0];

    newBuffer.writeUInt32LE(newId, newOffset);              // 0: ID
    newBuffer.writeUInt32LE(tabId, newOffset + 4);           // 1: TabID
    newBuffer.writeUInt32LE(row, newOffset + 8);             // 2: TierID (row)
    newBuffer.writeUInt32LE(column, newOffset + 12);         // 3: ColumnIndex
    for (let i = 0; i < 9; i++) {
      newBuffer.writeUInt32LE(ranks[i] || 0, newOffset + 16 + (i * 4)); // 4-12: SpellRank[0-8]
    }
    for (let i = 0; i < 3; i++) {
      newBuffer.writeUInt32LE(prereqs[i] || 0, newOffset + 52 + (i * 4)); // 13-15: PrereqTalent[0-2]
    }
    for (let i = 0; i < 3; i++) {
      newBuffer.writeUInt32LE(preReqRanks[i] || 0, newOffset + 64 + (i * 4)); // 16-18: PrereqRank[0-2]
    }
    newBuffer.writeUInt32LE(flags || 0, newOffset + 76);      // 19: Flags
    newBuffer.writeUInt32LE(requiredSpellId || 0, newOffset + 80); // 20: RequiredSpellId
    for (let i = 0; i < 2; i++) {
      newBuffer.writeUInt32LE(pFlags[i] || 0, newOffset + 84 + (i * 4)); // 21-22: PetFlags
    }

    // Copy string block after new records
    stringBlock.copy(newBuffer, headerSize + ((recordCount + 1) * recordSize));

    // Write to primary location
    fs.writeFileSync(talentPath, newBuffer);

    // Also write to export/DBFilesClient
    const exportDir = path.join(PUBLIC_DIR, 'export', 'DBFilesClient');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    const exportPath = path.join(exportDir, 'Talent.dbc');
    fs.writeFileSync(exportPath, newBuffer);

    // Also write to custom-dbc if the active dir is different
    const customDbcDir = path.join(PUBLIC_DIR, 'custom-dbc');
    const customDbcPath = path.join(customDbcDir, 'Talent.dbc');
    if (talentPath !== customDbcPath) {
      if (!fs.existsSync(customDbcDir)) fs.mkdirSync(customDbcDir, { recursive: true });
      fs.writeFileSync(customDbcPath, newBuffer);
    }

    // Invalidate cache
    dbcCache.talents = null;
    if (dbcCache.lastModified) dbcCache.lastModified.talentDbc = 0;

    console.log(`Added new talent #${newId} to tab ${tabId} at R${row}C${column} (written to ${talentPath}, ${exportPath}${talentPath !== customDbcPath ? ', ' + customDbcPath : ''})`);
    res.json({ success: true, id: newId, tabId, row, column });
  } catch (error) {
    console.error('Error adding talent:', error);
    logErrorToFile(`Error adding talent: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Export Talent.dbc - download a copy
app.get('/api/talents/export', (req, res) => {
  try {
    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const talentPath = path.join(dbcDir, 'Talent.dbc');

    if (!fs.existsSync(talentPath)) {
      return res.status(404).json({ error: 'Talent.dbc not found' });
    }

    res.download(talentPath, 'Talent.dbc');
  } catch (error) {
    console.error('Error exporting Talent.dbc:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a talent record from Talent.dbc
app.post('/api/talents/delete', (req, res) => {
  try {
    const { talentId } = req.body;
    if (!talentId) {
      return res.status(400).json({ error: 'Missing talentId' });
    }

    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const talentPath = path.join(dbcDir, 'Talent.dbc');

    if (!fs.existsSync(talentPath)) {
      return res.status(404).json({ error: 'Talent.dbc not found' });
    }

    const oldBuffer = fs.readFileSync(talentPath);
    const magic = oldBuffer.toString('utf-8', 0, 4);
    if (magic !== 'WDBC') {
      return res.status(400).json({ error: 'Invalid Talent.dbc format' });
    }

    const recordCount = oldBuffer.readUInt32LE(4);
    const recordSize = oldBuffer.readUInt32LE(12);
    const headerSize = 20;
    const recordsEnd = headerSize + (recordCount * recordSize);
    const stringBlock = oldBuffer.slice(recordsEnd);

    // Find the record to delete
    let foundIndex = -1;
    for (let i = 0; i < recordCount; i++) {
      const offset = headerSize + (i * recordSize);
      const id = oldBuffer.readUInt32LE(offset);
      if (id === talentId) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex === -1) {
      return res.status(404).json({ error: `Talent ID ${talentId} not found in DBC` });
    }

    // Backup before modifying
    const backupPath = talentPath + '.bak';
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(talentPath, backupPath);
      console.log('Created Talent.dbc backup');
    }

    // Build new buffer without the deleted record
    const newRecordCount = recordCount - 1;
    const newBuffer = Buffer.alloc(headerSize + (newRecordCount * recordSize) + stringBlock.length);

    // Copy header and update record count
    oldBuffer.copy(newBuffer, 0, 0, headerSize);
    newBuffer.writeUInt32LE(newRecordCount, 4);

    // Copy records before the deleted one
    const deleteOffset = headerSize + (foundIndex * recordSize);
    if (foundIndex > 0) {
      oldBuffer.copy(newBuffer, headerSize, headerSize, deleteOffset);
    }

    // Copy records after the deleted one
    const afterOffset = deleteOffset + recordSize;
    if (afterOffset < recordsEnd) {
      oldBuffer.copy(newBuffer, deleteOffset, afterOffset, recordsEnd);
    }

    // Copy string block
    stringBlock.copy(newBuffer, headerSize + (newRecordCount * recordSize));

    // Write to primary location
    fs.writeFileSync(talentPath, newBuffer);

    // Also write to export/DBFilesClient
    const exportDir = path.join(PUBLIC_DIR, 'export', 'DBFilesClient');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(path.join(exportDir, 'Talent.dbc'), newBuffer);

    // Also write to custom-dbc if different
    const customDbcPath = path.join(PUBLIC_DIR, 'custom-dbc', 'Talent.dbc');
    if (talentPath !== customDbcPath) {
      const customDbcDir = path.join(PUBLIC_DIR, 'custom-dbc');
      if (!fs.existsSync(customDbcDir)) fs.mkdirSync(customDbcDir, { recursive: true });
      fs.writeFileSync(customDbcPath, newBuffer);
    }

    // Invalidate cache
    dbcCache.talents = null;
    if (dbcCache.lastModified) dbcCache.lastModified.talentDbc = 0;

    console.log(`Deleted talent #${talentId} from Talent.dbc (${newRecordCount} records remain)`);
    res.json({ success: true, deletedId: talentId, remainingRecords: newRecordCount });
  } catch (error) {
    console.error('Error deleting talent:', error);
    logErrorToFile(`Error deleting talent: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Regenerate sprite sheets on demand
app.post('/api/sprites/regenerate', async (req, res) => {
  try {
    console.log('Regenerating sprite sheets on demand...');
    const result = await generateSpriteSheets();
    
    // Invalidate cache
    dbcCache.talents = null;
    if (dbcCache.lastModified) dbcCache.lastModified.talentDbc = 0;

    res.json({ 
      success: true, 
      sheets: result.sheets,
      message: `Regenerated ${result.sheets} sprite sheets` 
    });
  } catch (error) {
    console.error('Error regenerating sprites:', error);
    res.status(500).json({ error: error.message });
  }
});

// Force rebuild the spell-icon index
app.post('/api/spell-icon-index/rebuild', (req, res) => {
  try {
    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const index = buildSpellIconIndex(dbcDir);
    if (index) {
      res.json({ success: true, entries: Object.keys(index).length });
    } else {
      res.status(500).json({ error: 'Failed to build index — DBC files missing or invalid' });
    }
  } catch (error) {
    console.error('Error rebuilding spell-icon index:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get spell-icon index stats
app.get('/api/spell-icon-index', (req, res) => {
  if (!dbcCache.spellIconIndex) {
    loadOrBuildSpellIconIndex();
  }
  const index = dbcCache.spellIconIndex;
  if (!index) return res.status(404).json({ error: 'Index not available' });

  // Return stats + optionally full index if ?full=true
  const full = req.query.full === 'true';
  const stats = { entries: Object.keys(index).length };
  if (fs.existsSync(SPELL_ICON_INDEX_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SPELL_ICON_INDEX_PATH, 'utf8'));
      stats.meta = data.meta;
    } catch (e) { /* ignore */ }
  }
  res.json(full ? { ...stats, index } : stats);
});

// Get icon manifest
app.get('/api/icon-manifest', (req, res) => {
  try {
    const manifestPath = path.join(PUBLIC_DIR, 'icon-manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return res.json({ 
        generated: new Date().toISOString(),
        count: 0,
        icons: [],
        message: 'Manifest not yet generated. Upload an icon or call /api/update-manifest'
      });
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    res.json(manifest);
  } catch (err) {
    console.error('Failed to read manifest:', err);
    res.status(500).json({ error: 'Failed to read manifest' });
  }
});

// Endpoint to get spell icon mappings
app.get('/api/spell-icons', (req, res) => {
  try {
    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const spellIconPath = path.join(dbcDir, 'SpellIcon.dbc');
    
    if (!fs.existsSync(spellIconPath)) {
      return res.status(404).json({ error: `SpellIcon.dbc not found in ${dbcDir}` });
    }

    const buffer = fs.readFileSync(spellIconPath);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // Read DBC header
    const magic = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
    if (magic !== 'WDBC') {
      return res.status(400).json({ error: 'Invalid DBC file format' });
    }

    const recordCount = view.getUint32(4, true);
    const fieldCount = view.getUint32(8, true);
    const recordSize = view.getUint32(12, true);
    const stringBlockSize = view.getUint32(16, true);

    const headerSize = 20;
    const stringBlockOffset = headerSize + (recordCount * recordSize);

    // Read string from string block
    const readString = (offset) => {
      if (offset === 0) return '';
      const start = stringBlockOffset + offset;
      let end = start;
      while (end < buffer.length && buffer[end] !== 0) end++;
      return buffer.slice(start, end).toString('utf8');
    };

    const icons = [];
    for (let i = 0; i < recordCount; i++) {
      const recordOffset = headerSize + (i * recordSize);
      const id = view.getUint32(recordOffset, true);
      const iconPathOffset = view.getUint32(recordOffset + 4, true);
      const iconPath = readString(iconPathOffset);
      
      icons.push({ id, iconPath });
    }

    res.json({ icons });
  } catch (error) {
    console.error('Error reading SpellIcon.dbc:', error);
    logErrorToFile(`Error reading SpellIcon.dbc: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});


// Endpoint to get spell data (maps spellId to spellIconId)
app.get('/api/spells/:spellId', (req, res) => {
  try {
    const spellId = parseInt(req.params.spellId);
    const config = loadConfigFile();
    const dbcDir = path.join(PUBLIC_DIR, getActiveDBCDir(config));
    const spellPath = path.join(dbcDir, 'Spell.dbc');
    
    if (!fs.existsSync(spellPath)) {
      return res.status(404).json({ error: `Spell.dbc not found in ${dbcDir}` });
    }

    const buffer = fs.readFileSync(spellPath);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // Read DBC header
    const magic = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
    if (magic !== 'WDBC') {
      return res.status(400).json({ error: 'Invalid DBC file format' });
    }

    const recordCount = view.getUint32(4, true);
    const recordSize = view.getUint32(12, true);
    const headerSize = 20;

    // SpellIconID is at field 133 (offset 532) in WotLK 3.3.5
    for (let i = 0; i < recordCount; i++) {
      const recordOffset = headerSize + (i * recordSize);
      const id = view.getUint32(recordOffset, true);
      
      if (id === spellId) {
        const spellIconId = view.getUint32(recordOffset + 532, true);
        return res.json({ spellId: id, spellIconId });
      }
    }

    res.status(404).json({ error: 'Spell not found' });
  } catch (error) {
    console.error('Error reading Spell.dbc:', error);
    logErrorToFile(`Error reading Spell.dbc: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});


// Health/status endpoint for file service and configured paths
app.get('/api/file-service-status', (req, res) => {
  try {
    const config = loadConfigFile();
    const checks = [
      {
        key: 'base.dbc',
        path: path.join(PUBLIC_DIR, config.paths.base.dbc),
      },
      {
        key: 'base.icons',
        path: path.join(PUBLIC_DIR, config.paths.base.icons),
      },
      {
        key: 'custom.dbc',
        path: path.join(PUBLIC_DIR, config.paths.custom.dbc),
      },
      {
        key: 'custom.icons',
        path: path.join(PUBLIC_DIR, config.paths.custom.icons),
      },
    ].map((entry) => ({
      ...entry,
      exists: fs.existsSync(entry.path),
    }));

    const active = {
      dbc: getActiveDBCDir(config),
      icons: getActiveIconDir(config),
    };

    res.json({
      ok: true,
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      config,
      active,
      checks,
      missing: checks.filter((entry) => !entry.exists).map((entry) => entry.key),
      watcher: {
        status: 'not-applicable',
        message: 'Watcher is managed by the Vite dev server (npm run dev). Restart it if a watched path was renamed or deleted.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error building file service status:', error);
    logErrorToFile(`Error building file service status: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Resolve icon filename case-insensitively
app.get('/api/resolve-icon/:folder/:iconName', (req, res) => {
  try {
    const { folder, iconName } = req.params;
    const config = loadConfigFile();
    
    // Security: only allow custom-icon folder
    if (folder !== 'custom-icon') {
      return res.status(403).json({ error: 'Only custom-icon folder allowed' });
    }
    
    const folderPath = path.join(PUBLIC_DIR, 'custom-icon');
    
    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Read all files in the folder
    const files = fs.readdirSync(folderPath);
    
    // Find case-insensitive match
    const lowerSearch = iconName.toLowerCase();
    const matched = files.find(f => f.toLowerCase() === lowerSearch || f.toLowerCase() === `${lowerSearch}.blp` || f.toLowerCase() === `${lowerSearch}.BLP`);
    
    if (matched) {
      res.json({ found: true, filename: matched });
    } else {
      res.json({ found: false, filename: null });
    }
  } catch (error) {
    console.error('Error resolving icon:', error);
    logErrorToFile(`Error resolving icon: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Copy files from base to custom
app.post('/api/copy-files', (req, res) => {
  try {
    const { source, destination, type } = req.body;

    if (!source || !destination) {
      return res.status(400).json({ error: 'Source and destination required' });
    }

    const sourcePath = path.join(PUBLIC_DIR, source);
    const destPath = path.join(PUBLIC_DIR, destination);

    // Security: Ensure paths are within PUBLIC_DIR
    if (!sourcePath.includes(PUBLIC_DIR) || !destPath.includes(PUBLIC_DIR)) {
      return res.status(403).json({ error: 'Invalid path' });
    }

    // Create destination folder if it doesn't exist
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    if (type === 'dbc') {
      // Copy SpellIcon.dbc
      const dbcSource = path.join(sourcePath, 'SpellIcon.dbc');
      const dbcDest = path.join(destPath, 'SpellIcon.dbc');

      console.log(`Copying DBC: ${dbcSource} -> ${dbcDest}`);

      if (!fs.existsSync(dbcSource)) {
        return res.status(404).json({ error: `SpellIcon.dbc not found at ${dbcSource}` });
      }

      try {
        fs.copyFileSync(dbcSource, dbcDest);
        console.log('✓ DBC file copied successfully');
        return res.json({ success: true, message: 'DBC file copied' });
      } catch (err) {
        console.error('DBC copy error:', err);
        return res.status(500).json({ error: `Failed to copy DBC: ${err.message}` });
      }
    } else if (type === 'icons') {
      // Handle nested Icons folder (INT_335_wotlk/Icons/)
      let iconSourcePath = sourcePath;
      if (sourcePath.includes('INT_335_wotlk')) {
        iconSourcePath = path.join(sourcePath, 'Icons');
      }

      console.log(`Copying icons: ${iconSourcePath} -> ${destPath}`);

      if (!fs.existsSync(iconSourcePath)) {
        return res.status(404).json({ 
          error: `Icons folder not found at ${iconSourcePath}`,
          expected: iconSourcePath,
          source: sourcePath
        });
      }

      try {
        const files = fs.readdirSync(iconSourcePath);
        const blpFiles = files.filter(f => f.toLowerCase().endsWith('.blp'));

        if (blpFiles.length === 0) {
          return res.status(404).json({ error: 'No .blp files found in source' });
        }

        let copied = 0;
        const errors = [];

        blpFiles.forEach(file => {
          try {
            const src = path.join(iconSourcePath, file);
            const dest = path.join(destPath, file);
            const stat = fs.statSync(src);
            
            if (stat.isFile()) {
              fs.copyFileSync(src, dest);
              copied++;
            }
          } catch (err) {
            errors.push(`${file}: ${err.message}`);
          }
        });

        console.log(`✓ Copied ${copied} icon files`);
        
        if (errors.length > 0) {
          console.warn('Copy errors:', errors);
        }

        return res.json({ 
          success: true, 
          message: `${copied} icon files copied`,
          copied,
          errors: errors.length > 0 ? errors : undefined
        });
      } catch (err) {
        console.error('Icons copy error:', err);
        return res.status(500).json({ error: `Failed to copy icons: ${err.message}` });
      }
    }

    res.status(400).json({ error: 'Invalid type' });
  } catch (error) {
    console.error('Copy error:', error);
    logErrorToFile(`Copy error: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Check if files exist
app.get('/api/check-files', (req, res) => {
  try {
    const config = loadConfigFile();
    const dbcPath = path.join(PUBLIC_DIR, config.paths.custom.dbc, 'SpellIcon.dbc');
    const iconsPath = path.join(PUBLIC_DIR, config.paths.custom.icons);

    const dbcExists = fs.existsSync(dbcPath);
    
    let iconCount = 0;
    if (fs.existsSync(iconsPath)) {
      try {
        const files = fs.readdirSync(iconsPath);
        iconCount = files.filter(f => f.toLowerCase().endsWith('.blp')).length;
      } catch (err) {
        console.error('Error reading icons folder:', err);
      }
    }

    console.log(`File check: DBC=${dbcExists}, Icons=${iconCount}`);

    res.json({
      dbcExists,
      iconCount,
      iconsExist: iconCount > 0,
    });
  } catch (error) {
    console.error('Check error:', error);
    logErrorToFile(`Check error: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Upload and convert icon
app.post('/api/upload-icon', (req, res) => {
  try {
    const { filename, blpData } = req.body;

    if (!filename || !blpData) {
      return res.status(400).json({ error: 'Filename and BLP data required' });
    }

    // Clean filename and ensure it's lowercase
    const cleanName = filename
      .toLowerCase()
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[^a-z0-9_]/g, '_'); // Replace invalid chars
    
    const finalFilename = `${cleanName}.blp`;
    const config = loadConfigFile();
    const customIconDir = path.join(PUBLIC_DIR, config.paths.custom.icons);
    const destPath = path.join(customIconDir, finalFilename);
    const customDbcDir = path.join(PUBLIC_DIR, config.paths.custom.dbc);
    const customDbcPath = path.join(customDbcDir, 'SpellIcon.dbc');

    // Ensure custom icons folder exists
    if (!fs.existsSync(customIconDir)) {
      fs.mkdirSync(customIconDir, { recursive: true });
    }
    if (!fs.existsSync(customDbcDir)) {
      fs.mkdirSync(customDbcDir, { recursive: true });
    }

    console.log(`Uploading icon: ${finalFilename}`);

    // Convert base64 to buffer and write
    const buffer = Buffer.from(blpData, 'base64');
    fs.writeFileSync(destPath, buffer);

    console.log(`✓ Icon uploaded: ${finalFilename} (${buffer.length} bytes)`);

    // Initialize or update DBC with new icon
    if (!fs.existsSync(customDbcPath)) {
      initializeSpellIconDbc(customDbcPath);
    }
    addIconToSpellIconDbc(customDbcPath, finalFilename);

    // Trigger full manifest update in background (return immediately, update in progress)
    updateFullManifest(customIconDir, customDbcPath)
      .catch(err => console.error('Background manifest update failed:', err));

    res.json({
      success: true,
      message: 'Icon uploaded, manifests updating...',
      filename: finalFilename,
      size: buffer.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    logErrorToFile(`Upload error: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Upload header image
app.post('/api/upload-header-image', (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = req.files.file;
    const headerPath = path.join(PUBLIC_DIR, 'header-image.png');

    // Write file to public directory
    uploadedFile.mv(headerPath, (err) => {
      if (err) {
        console.error('Header upload error:', err);
        return res.status(500).json({ error: err.message });
      }

      console.log(`✓ Header image uploaded (${uploadedFile.size} bytes)`);
      res.json({ success: true, message: 'Header image uploaded' });
    });
  } catch (error) {
    console.error('Header upload error:', error);
    logErrorToFile(`Header upload error: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Upload background image
app.post('/api/upload-background-image', (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = req.files.file;
    const backgroundPath = path.join(PUBLIC_DIR, 'background-image.png');

    uploadedFile.mv(backgroundPath, (err) => {
      if (err) {
        console.error('Background upload error:', err);
        return res.status(500).json({ error: err.message });
      }

      console.log(`✓ Background image uploaded (${uploadedFile.size} bytes)`);
      res.json({ success: true, message: 'Background image uploaded' });
    });
  } catch (error) {
    console.error('Background upload error:', error);
    logErrorToFile(`Background upload error: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Clear background image
app.post('/api/clear-background-image', (req, res) => {
  try {
    const backgroundPath = path.join(PUBLIC_DIR, 'background-image.png');
    
    if (fs.existsSync(backgroundPath)) {
      fs.unlinkSync(backgroundPath);
      console.log(`✓ Background image cleared`);
    }
    
    res.json({ success: true, message: 'Background image cleared' });
  } catch (error) {
    console.error('Background clear error:', error);
    logErrorToFile(`Background clear error: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Upload page icon
app.post('/api/upload-page-icon', (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      console.error('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = req.files.file;
    const fileName = uploadedFile.name.toLowerCase();
    
    // Support both .ico and .png formats
    let savePath;
    if (fileName.endsWith('.ico')) {
      savePath = path.join(PUBLIC_DIR, 'page-icon.ico');
    } else {
      savePath = path.join(PUBLIC_DIR, 'page-icon.png');
    }

    console.log(`Uploading icon: ${fileName} to ${savePath}`);

    uploadedFile.mv(savePath, (err) => {
      if (err) {
        console.error('Page icon move error:', err);
        return res.status(500).json({ error: 'Failed to save icon: ' + err.message });
      }

      console.log(`✓ Page icon uploaded (${uploadedFile.size} bytes) as ${path.basename(savePath)}`);
      res.json({ success: true, message: 'Page icon uploaded', filename: path.basename(savePath) });
    });
  } catch (error) {
    console.error('Page icon upload error:', error);
    logErrorToFile(`Page icon upload error: ${error.stack || error}`);
    res.status(500).json({ error: 'Upload error: ' + error.message });
  }
});

// Clear page icon
app.post('/api/clear-page-icon', (req, res) => {
  try {
    // Try both .png and .ico formats
    const icoPath = path.join(PUBLIC_DIR, 'page-icon.ico');
    const pngPath = path.join(PUBLIC_DIR, 'page-icon.png');
    
    let cleared = false;
    
    if (fs.existsSync(icoPath)) {
      fs.unlinkSync(icoPath);
      console.log(`✓ Page icon cleared (.ico)`);
      cleared = true;
    }
    
    if (fs.existsSync(pngPath)) {
      fs.unlinkSync(pngPath);
      console.log(`✓ Page icon cleared (.png)`);
      cleared = true;
    }
    
    if (!cleared) {
      console.log('No page icon file found to clear');
    }
    
    res.json({ success: true, message: 'Page icon cleared' });
  } catch (error) {
    console.error('Page icon clear error:', error);
    logErrorToFile(`Page icon clear error: ${error.stack || error}`);
    res.status(500).json({ error: 'Clear error: ' + error.message });
  }
});

// Self-restart endpoint
app.post('/api/self-restart', (req, res) => {
  console.log('File service self-restart requested');
  res.json({ message: 'Restarting file service...' });
  
  setTimeout(() => {
    console.log('Exiting for restart');
    process.exit(0);
  }, 500);
});

// Export custom icons to export/Interface/Icons
app.post('/api/export-icons', (req, res) => {
  try {
    const config = loadConfigFile();
    const customIconsPath = path.join(PUBLIC_DIR, config.paths.custom.icons);
    const exportIconsPath = path.join(PUBLIC_DIR, 'export/Interface/Icons');

    // Create export folder if it doesn't exist
    if (!fs.existsSync(exportIconsPath)) {
      fs.mkdirSync(exportIconsPath, { recursive: true });
    }

    // Get list of custom icon files
    if (!fs.existsSync(customIconsPath)) {
      return res.status(400).json({ error: `${customIconsPath} folder does not exist` });
    }

    const files = fs.readdirSync(customIconsPath);
    const supportedFormats = ['.png', '.jpg', '.jpeg', '.blp'];
    const iconFiles = files.filter(f => 
      supportedFormats.some(ext => f.toLowerCase().endsWith(ext))
    );

    if (iconFiles.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No custom icons to export',
        exported: [],
        exportPath: '/export/Interface/Icons'
      });
    }

    // Copy icon files to export folder
    const exported = [];
    iconFiles.forEach(file => {
      const srcFile = path.join(customIconsPath, file);
      let destFile = path.join(exportIconsPath, file);
      
      // Change extension to .blp for output (preparation for conversion)
      const baseName = path.basename(file, path.extname(file));
      destFile = path.join(exportIconsPath, `${baseName}.blp`);
      
      try {
        fs.copyFileSync(srcFile, destFile);
        console.log(`✓ Exported icon: ${file} → ${baseName}.blp`);
        exported.push(file);
      } catch (err) {
        console.error(`Failed to export icon ${file}:`, err);
      }
    });

    res.json({ 
      success: true, 
      message: `Exported ${exported.length} icons`,
      exported,
      exportPath: '/export/Interface/Icons',
      note: 'Files are named with .blp extension. Actual BLP conversion would happen here.'
    });
  } catch (error) {
    console.error('Icon export error:', error);
    logErrorToFile(`Icon export error: ${error.stack || error}`);
    res.status(500).json({ error: 'Export error: ' + error.message });
  }
});

// Export custom DBCs to export/DBFilesClient
app.post('/api/export-dbc', (req, res) => {
  try {
    const config = loadConfigFile();
    const customDbcPath = path.join(PUBLIC_DIR, config.paths.custom.dbc);
    const exportDbcPath = path.join(PUBLIC_DIR, 'export/DBFilesClient');

    // Create export folder if it doesn't exist
    if (!fs.existsSync(exportDbcPath)) {
      fs.mkdirSync(exportDbcPath, { recursive: true });
    }

    // Get list of custom DBC files
    if (!fs.existsSync(customDbcPath)) {
      return res.status(400).json({ error: `${customDbcPath} folder does not exist` });
    }

    const files = fs.readdirSync(customDbcPath);
    const dbcFiles = files.filter(f => f.toLowerCase().endsWith('.dbc'));

    if (dbcFiles.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No custom DBCs to export',
        exported: [],
        exportPath: '/export/DBFilesClient'
      });
    }

    // Copy DBC files to export folder
    const exported = [];
    dbcFiles.forEach(file => {
      const srcFile = path.join(customDbcPath, file);
      const destFile = path.join(exportDbcPath, file);
      
      try {
        fs.copyFileSync(srcFile, destFile);
        const srcSize = fs.statSync(srcFile).size;
        console.log(`✓ Exported DBC: ${file} (${srcSize} bytes)`);
        exported.push({ file, size: srcSize });
      } catch (err) {
        console.error(`Failed to export DBC ${file}:`, err);
      }
    });

    res.json({ 
      success: true, 
      message: `Exported ${exported.length} DBC files`,
      exported,
      exportPath: '/export/DBFilesClient',
      note: 'These can be placed directly in client DBFilesClient/ folder'
    });
  } catch (error) {
    console.error('DBC export error:', error);
    logErrorToFile(`DBC export error: ${error.stack || error}`);
    res.status(500).json({ error: 'Export error: ' + error.message });
  }
});

// Get export status (list files in export folders)
app.get('/api/export-status', (req, res) => {
  try {
    const iconPath = path.join(PUBLIC_DIR, 'export/Interface/Icons');
    const dbcPath = path.join(PUBLIC_DIR, 'export/DBFilesClient');

    const icons = fs.existsSync(iconPath) ? fs.readdirSync(iconPath) : [];
    const dbcs = fs.existsSync(dbcPath) ? fs.readdirSync(dbcPath) : [];

    res.json({
      success: true,
      icons: {
        count: icons.length,
        files: icons.slice(0, 10), // Show first 10
        hasMore: icons.length > 10
      },
      dbcs: {
        count: dbcs.length,
        files: dbcs,
      },
      exportPaths: {
        icons: '/export/Interface/Icons',
        dbcs: '/export/DBFilesClient'
      }
    });
  } catch (error) {
    console.error('Export status error:', error);
    logErrorToFile(`Export status error: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Initialize all required public directories
app.post('/api/initialize-folders', (req, res) => {
  try {
    const requiredDirs = [
      'dbc',
      'custom-dbc',
      'icon',
      'custom-icon',
      'thumbnails',
      'sprites',
      'export/DBFilesClient',
      'export/Interface',
      'error-logs',
    ];

    const results = [];
    for (const dir of requiredDirs) {
      const fullPath = path.join(PUBLIC_DIR, dir);
      const existed = fs.existsSync(fullPath);
      if (!existed) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
      results.push({ dir, created: !existed, existed });
    }

    const created = results.filter(r => r.created).map(r => r.dir);
    const existed = results.filter(r => r.existed).map(r => r.dir);

    console.log(`✓ Initialize folders: ${created.length} created, ${existed.length} already existed`);
    res.json({ success: true, created, existed });
  } catch (error) {
    console.error('Initialize folders error:', error);
    logErrorToFile(`Initialize folders error: ${error.stack || error}`);
    res.status(500).json({ error: error.message });
  }
});

// Check which required directories exist
app.get('/api/initialize-folders/status', (req, res) => {
  try {
    const requiredDirs = [
      'dbc',
      'custom-dbc',
      'icon',
      'custom-icon',
      'thumbnails',
      'sprites',
      'export/DBFilesClient',
      'export/Interface',
      'error-logs',
    ];

    const status = requiredDirs.map(dir => ({
      dir,
      exists: fs.existsSync(path.join(PUBLIC_DIR, dir)),
    }));

    res.json({ status, allReady: status.every(s => s.exists) });
  } catch (error) {
    console.error('Folder status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 404 handler - return JSON instead of HTML
app.use((req, res) => {
  console.warn(`404: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    logErrorToFile(`Server error: ${err.stack || err}`);
    res.status(err.status || 500).json({ 
      error: err.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Thumbnail API endpoints
// Note: /api/icon-manifest and /api/sprite-map are defined earlier in the file

// Trigger full manifest update (including thumbnails and DBC)
app.post('/api/update-manifest', async (req, res) => {
  try {
    console.log('🔄 Manifest update requested...');
    const config = loadConfigFile();
    const customIconDir = path.join(PUBLIC_DIR, config.paths.custom.icons);
    const customDbcPath = path.join(PUBLIC_DIR, config.paths.custom.dbc, 'SpellIcon.dbc');
    
    // Don't wait - return immediately with status
    res.json({
      status: 'updating',
      message: 'Manifest update in progress. Icons loading...',
      timestamp: new Date().toISOString()
    });

    // Run in background
    updateFullManifest(customIconDir, customDbcPath)
      .then(result => {
        console.log(`✅ Manifest update complete: ${result.generated} thumbnails, ${result.failed} failed`);
      })
      .catch(err => console.error('❌ Manifest update failed:', err));
  } catch (err) {
    console.error('Update manifest error:', err);
    res.status(500).json({ error: 'Failed to start manifest update' });
  }
});

app.get('/api/icon-thumbnails', (req, res) => {
  try {
    if (!fs.existsSync(THUMBNAILS_DIR)) {
      return res.json({ thumbnails: [] });
    }
    const files = fs.readdirSync(THUMBNAILS_DIR).filter(f => f.endsWith('.png'));
    const thumbnails = files.map(f => ({
      name: f.replace(/\.png$/i, ''),
      url: `/thumbnails/${f}`
    }));
    res.json({ thumbnails });
  } catch (err) {
    console.error('Failed to list thumbnails:', err);
    res.status(500).json({ error: 'Failed to list thumbnails' });
  }
});

app.post('/api/generate-thumbnails', async (req, res) => {
  try {
    const result = await generateThumbnailsForIcons();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Thumbnail generation failed:', err);
    res.status(500).json({ error: 'Thumbnail generation failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✓ Backend API running on http://0.0.0.0:${PORT}`);

  // Build spell-icon index at startup (fast: loads from disk if cached, rebuilds if DBC changed)
  console.log('Loading spell-icon index...');
  loadOrBuildSpellIconIndex();

  console.log('Generating thumbnails for custom icons...');
  generateThumbnailsForIcons().then(result => {
    console.log(`✓ Thumbnails ready: ${result.generated} generated, ${result.skipped} cached, ${result.failed} failed`);
    
    // Generate initial manifest
    const config = loadConfigFile();
    const customIconDir = path.join(PUBLIC_DIR, config.paths.custom.icons);
    const customDbcPath = path.join(PUBLIC_DIR, config.paths.custom.dbc, 'SpellIcon.dbc');
    generateIconManifest(customIconDir, customDbcPath).then(manifest => {
      saveManifest(manifest);
      console.log('✓ Icon manifest generated');
      
      // Generate sprite sheets for optimized loading
      console.log('Generating sprite sheets...');
      generateSpriteSheets().then(spriteResult => {
        console.log(`✓ Sprite sheets ready: ${spriteResult.sheets} sheets, ${spriteResult.icons} icons`);
      }).catch(err => {
        console.error('Sprite generation error:', err);
      });
    });
    
    // Start file watcher for automatic thumbnail generation
    startThumbnailWatcher();
  }).catch(err => {
    console.error('Thumbnail generation error:', err);
  });
  console.log('Handles: DBC/icon copying, file checking, icon uploads');
  console.log('📋 Debug: Visit http://localhost:3001/api/debug/talent-trees to see talent tree mappings\n');
});

// Endpoint to receive frontend error logs (must be after app is defined)
function logFrontendError(fileName, req, res) {
  try {
    const ERROR_LOG_DIR = path.join(__dirname, 'public', 'error-logs');
    const ERROR_LOG_FILE = path.join(ERROR_LOG_DIR, fileName);
    if (!fs.existsSync(ERROR_LOG_DIR)) {
      fs.mkdirSync(ERROR_LOG_DIR, { recursive: true });
    }
    const error = req.body?.error || 'Unknown error';
    const timestamp = new Date().toISOString();
    fs.appendFileSync(ERROR_LOG_FILE, `[${timestamp}] ${error}\n`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log frontend error' });
  }
}

app.post('/error-logs/frontend-errors.log', express.json(), (req, res) => {
  logFrontendError('frontend-errors.log', req, res);
});

app.post('/error-logs/spell-icon-errors.log', express.json(), (req, res) => {
  logFrontendError('spell-icon-errors.log', req, res);
});

app.post('/error-logs/talent-icon-errors.log', express.json(), (req, res) => {
  logFrontendError('talent-icon-errors.log', req, res);
});