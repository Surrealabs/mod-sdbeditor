# WoW 3.3.5 Icon Editor - Setup Guide

Working directory for this module:

```bash
cd /root/azerothcore-wotlk/modules/mod-sdbeditor/web
```

## Directory Structure

The application uses a dual-folder system to protect original game files while allowing custom modifications:

### Base Folders (Read-Only Reference)
```
public/
├── DBC_335_wotlk/          # Original WotLK DBC files
│   └── SpellIcon.dbc       # Place your original SpellIcon.dbc here
├── Interface_335_wotlk/
│   └── Icons/              # Original WotLK icon BLP files
│       ├── ability_warrior_charge.blp
│       ├── spell_fire_fireball.blp
│       └── ... (1000+ icons)
```

### Custom Folders (Server Integration)
```
public/
├── CIcon_dbc/              # Your custom/working DBC files
│   └── SpellIcon.dbc       # Modified DBC with custom icons
├── CSpell_Icon/            # Your custom icon BLP files
│   ├── ability_warrior_custom1.blp
│   └── spell_custom_icon.blp
```

## Initial Setup

### Step 1: Copy Base Files
1. Extract your WoW 3.3.5 client
2. Copy `DBFilesClient\SpellIcon.dbc` → `public/DBC_335_wotlk/`
3. Copy `Interface\Icons\*.blp` → `public/Interface_335_wotlk/Icons/`

### Step 2: Copy Your Current Server Files
1. Copy your current server's `SpellIcon.dbc` → `public/CIcon_dbc/`
2. Copy any custom icons → `public/CSpell_Icon/`

### Step 3: Configure in Editor
1. Launch the application
2. Click **⚙️ Settings**
3. Select your working source:
   - **DBC Source**: Choose "Custom (Server)" to work with your server's DBC
   - **Icon Source**: Choose "Custom Icons" to work with custom icons

## Workflow

### Browsing Icons
1. Set **Icon Source** to "Base WotLK Icons"
2. Set **DBC Source** to "Base WotLK (Read-Only)"
3. Click **Browse Icons** mode
4. Left panel shows all DBC entries with ID + icon
5. Right panel shows unmapped icons (in folder but not in DBC)

### Adding Custom Icons
1. Set sources to "Custom"
2. Click **Create Custom Icons** mode
3. Import your custom DBC (or use base as reference)
4. Drag & drop image files
5. Configure names and sizes
6. Export to `CIcon_dbc/` and `CSpell_Icon/`

### Server Deployment
1. Copy `CIcon_dbc/SpellIcon.dbc` → `<Server>\dbc\`
2. Copy `CSpell_Icon/*.blp` → Create patch MPQ or client folder
3. Distribute to players via patch file

## Configuration File

Located at `public/config.json`:

```json
{
  "paths": {
    "base": {
      "dbc": "DBC_335_wotlk",
      "icons": "Interface_335_wotlk/Icons"
    },
    "custom": {
      "dbc": "CIcon_dbc",
      "icons": "CSpell_Icon"
    }
  },
  "settings": {
    "activeDBCSource": "custom",
    "activeIconSource": "custom",
    "allowBaseModification": false
  }
}
```

## Safety Features

- **Read-Only Base**: Original WotLK files cannot be modified
- **Separate Custom Folders**: All edits go to custom folders
- **Config-Driven**: Easy to switch between base/custom sources
- **Auto-Detection**: Unmapped icons automatically detected

## Tips

- Keep base folders intact as reference
- Work exclusively in custom folders
- Export DBC files with sequential IDs to avoid conflicts
- Use descriptive icon names following WoW conventions
- Test icons in-game before deploying to players
