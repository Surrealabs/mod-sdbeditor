# SDBEditor Asset Management Structure

## Folder Organization

```
public/
├── dbc/                          # Original WoW DBC files (read-only)
├── Icons/                        # Original WoW game icons (read-only)
│
├── custom-dbc/                   # Edited DBC files (user modified)
├── custom-icons/                 # New/edited icon files (user modified)
│
├── export/                       # Export outputs for MPQ patching
│   ├── Interface/
│   │   └── Icons/               # Exported BLP icon files
│   └── DBFilesClient/            # Exported DBC database files
│
├── class-icons/                  # WoW class selection icons (UI)
├── class-backgrounds/            # Talent tree spec backgrounds (UI)
└── talent-icons/                 # Individual talent ability icons (UI)
```

## File Types

### DBC Files (Database)
- **Location**: `dbc/` (base), `custom-dbc/` (edited)
- **Format**: Raw DBC binary format
- **Export Path**: `export/DBFilesClient/`
- **Use**: Place directly in client `DBFilesClient/` folder
- **Examples**: `Spell.dbc`, `SpellIcon.dbc`, `Talent.dbc`

### Icon Files 
- **Location**: `Icons/` (base), `custom-icons/` (new/edited)
- **Formats**: 
  - **Input**: PNG, JPG, BLP
  - **Output**: BLP (exported)
- **Export Path**: `export/Interface/Icons/`
- **Use**: Place in client `Interface/Icons/` folder in MPQ patch
- **Naming**: `Icon_<ID>.blp` where ID is numeric

## Workflow

### Adding New Icons
1. Upload PNG/JPG in Spell Icon Editor
2. Editor saves to `custom-icons/`
3. When exporting, converts to BLP format
4. BLP files output to `export/Interface/Icons/`
5. Pack `export/Interface/Icons/` into MPQ patch

### Editing DBC Files
1. Upload modified DBC in Talent/Spell Editor
2. Editor saves to `custom-dbc/`
3. When exporting, copies raw DBC to `export/DBFilesClient/`
4. Place `export/DBFilesClient/*` files in client `DBFilesClient/` folder

### Initial Setup
1. Copy base files: Use SettingsPanel to copy `dbc/` → `custom-dbc/` and `Icons/` → `custom-icons/`
2. Edit files in your preferred DBC/icon editor
3. Export when ready to patch

## API Endpoints

### Copy Files (SettingsPanel - Initial Setup)
- `POST /api/copy-files` - Copy base files to custom folders
  - Body: `{ source, destination, type }`
  - Response: Success status with file counts

### Export Icons (SettingsPanel - Asset Export)
- `POST /api/export-icons` - Copy and export custom icons
  - Action: Reads from `custom-icons/`, copies to `export/Interface/Icons/`
  - Renames to `.blp` extension (BLP conversion ready)
  - Response: Count of exported files
  - UI: Orange button in Settings panel
  - Example: `icon.png` → `icon.blp` in export/Interface/Icons/

### Export DBCs (SettingsPanel - Asset Export)
- `POST /api/export-dbc` - Copy custom DBCs to export folder
  - Action: Reads from `custom-dbc/`, copies to `export/DBFilesClient/`
  - Preserves original DBC file names
  - Response: Count of exported files with sizes
  - UI: Orange button in Settings panel
  - Example: `Spell.dbc` → `Spell.dbc` in export/DBFilesClient/

### Export Status (SettingsPanel - Monitoring)
- `GET /api/export-status` - Get current export folder contents
  - Response: File counts and lists for both icons and DBCs
  - Auto-refreshes after each export
  - Shows green status indicator when files are present

## File Size Notes
- **Icons folder**: Contains 45,000+ game icons (~300MB+)
- **DBC folder**: Contains ~150 DBC files (~50MB)
- Only files in `custom-*` folders need to be exported for patches
- Export folder structures match client folder layout (Interface/Icons, DBFilesClient)

## UI Components

### SettingsPanel Export Section
- Located in Settings tab (⚙️ Show Settings)
- Two orange export buttons: "Export Icons" and "Export DBCs"
- Real-time status showing exported file counts
- Green status box when export contains files
- Disabled during export with "Exporting..." label
