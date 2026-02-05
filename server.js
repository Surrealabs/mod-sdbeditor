import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));
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
    res.status(500).json({ error: error.message });
  }
});

// Check if files exist
app.get('/api/check-files', (req, res) => {
  try {
    const dbcPath = path.join(PUBLIC_DIR, 'custom_dbc', 'SpellIcon.dbc');
    const iconsPath = path.join(PUBLIC_DIR, 'custom_icon');

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
    const customIconDir = path.join(PUBLIC_DIR, 'custom_icon');
    const destPath = path.join(customIconDir, finalFilename);

    // Ensure custom_icon folder exists
    if (!fs.existsSync(customIconDir)) {
      fs.mkdirSync(customIconDir, { recursive: true });
    }

    console.log(`Uploading icon: ${finalFilename}`);

    // Convert base64 to buffer and write
    const buffer = Buffer.from(blpData, 'base64');
    fs.writeFileSync(destPath, buffer);

    console.log(`✓ Icon uploaded: ${finalFilename} (${buffer.length} bytes)`);

    res.json({
      success: true,
      message: 'Icon uploaded',
      filename: finalFilename,
      size: buffer.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✓ Backend API running on http://localhost:${PORT}`);
  console.log('Handles: DBC/icon copying, file checking, icon uploads\n');
});
