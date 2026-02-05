import React, { useEffect, useRef, useState, useCallback } from "react";
import { BLPFile } from "../lib/blp-converter-esm.js";
import { DBCParser, SpellIconParser, type SpellIconRecord } from "../lib/dbc-parser";
import { loadConfig, getActiveIconPath, type AppConfig } from "../lib/config";
import SettingsPanel from "./SettingsPanel";

interface ImportedIcon {
  id: string;
  name: string;
  size: 32 | 64;
  imageData: ImageData;
  preview: string;
}

const SpellIconEditor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const dbcDragZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbcInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [icons, setIcons] = useState<string[]>([]);
  const [selectedIcon, setSelectedIcon] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [dbcLoading, setDBCLoading] = useState(false);
  const [dbcImported, setDBCImported] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cachedThumbs, setCachedThumbs] = useState<Map<string, string>>(new Map());
  const [importedIcons, setImportedIcons] = useState<ImportedIcon[]>([]);
  const [mode, setMode] = useState<"browse" | "create">("browse");
  const [existingDBC, setExistingDBC] = useState<SpellIconRecord[]>([]);
  const [dbcCompare, setDBCCompare] = useState<{ existing: Set<string>; new: Set<string> }>({
    existing: new Set(),
    new: new Set(),
  });
  const [namingPatterns, setNamingPatterns] = useState<string[]>([]);
  const [unmappedIcons, setUnmappedIcons] = useState<string[]>([]);
  const [selectedUnmapped, setSelectedUnmapped] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [baseIconsSet, setBaseIconsSet] = useState<Set<string>>(new Set());
  const [newIconsOnly, setNewIconsOnly] = useState<string[]>([]);

  useEffect(() => {
    loadConfig().then(setConfig);
    
    // Load base icons manifest
    fetch('/base-icons-manifest.json')
      .then(res => res.json())
      .then(data => {
        const baseSet = new Set(data.icons.map((icon: string) => icon.toLowerCase()));
        setBaseIconsSet(baseSet);
        console.log(`✓ Loaded ${baseSet.size} base WotLK icons`);
      })
      .catch(err => console.error('Failed to load base icons manifest:', err));
  }, []);

  useEffect(() => {
    const loadIconsList = async () => {
      try {
        const response = await fetch("/icons-manifest.json");
        if (response.ok) {
          const manifest = await response.json();
          setIcons(manifest.files);
          if (manifest.files.length > 0) setSelectedIcon(manifest.files[0]);
        }
      } catch (err) {
        console.error("Failed to load icons:", err);
      }
    };
    loadIconsList();
  }, []);

  useEffect(() => {
    const loadIcon = async () => {
      if (!selectedIcon || mode !== "browse") return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/Interface/Icons/${selectedIcon}`);
        if (!response.ok) throw new Error(`Failed to load ${selectedIcon}`);
        const buffer = await response.arrayBuffer();
        const blp = new BLPFile(new Uint8Array(buffer));
        const pixels = blp.getPixels(0) as any;
        const rgba = pixels?.buffer ? pixels.buffer : pixels;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = blp.width;
          canvas.height = blp.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const imageData = ctx.createImageData(blp.width, blp.height);
            imageData.data.set(rgba);
            ctx.putImageData(imageData, 0, 0);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    loadIcon();
  }, [selectedIcon, mode]);

  const getThumbnail = useCallback(
    async (iconName: string): Promise<string> => {
      if (cachedThumbs.has(iconName)) return cachedThumbs.get(iconName)!;
      if (!config) return '';
      try {
        const iconPath = getActiveIconPath(config);
        const response = await fetch(`${iconPath}/${iconName}.blp`);
        if (!response.ok) return "";
        const buffer = await response.arrayBuffer();
        const blp = new BLPFile(new Uint8Array(buffer));
        const pixels = blp.getPixels(0) as any;
        const rgba = pixels?.buffer ? pixels.buffer : pixels;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = blp.width;
        tempCanvas.height = blp.height;
        const ctx = tempCanvas.getContext("2d");
        if (ctx) {
          const imageData = ctx.createImageData(blp.width, blp.height);
          imageData.data.set(rgba);
          ctx.putImageData(imageData, 0, 0);
        }
        const dataUrl = tempCanvas.toDataURL();
        setCachedThumbs((prev) => new Map(prev).set(iconName, dataUrl));
        return dataUrl;
      } catch (err) {
        return "";
      }
    },
    [cachedThumbs]
  );

  const handleDBCImport = async (file: File) => {
    setDBCLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const dbc = DBCParser.parseDBCFile(buffer);
      const spellIcons = SpellIconParser.parse(dbc);
      setExistingDBC(spellIcons);
      const existingNames = new Set(spellIcons.map((r) => r.iconPath.toLowerCase()));
      setDBCCompare({ existing: existingNames, new: new Set(importedIcons.map((i) => i.name.toLowerCase())) });
      
      // Find unmapped icons (icons in custom folder but not in DBC)
      const unmapped = icons.filter(icon => !existingNames.has(icon.toLowerCase()));
      setUnmappedIcons(unmapped);
      
      // Identify NEW icons (not in base WotLK manifest)
      const newIcons = unmapped.filter(icon => 
        !baseIconsSet.has(icon.toLowerCase().replace(/\.blp$/i, ''))
      );
      setNewIconsOnly(newIcons);
      console.log(`Found ${newIcons.length} NEW custom icons (not in base WotLK)`);
      
      // Extract naming patterns
      const patterns = extractNamingPatterns(Array.from(existingNames));
      setNamingPatterns(patterns);
      
      setError(null);
      setDBCImported(true);
      setTimeout(() => setDBCImported(false), 3000);
    } catch (err) {
      setError(`Failed to parse DBC: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDBCLoading(false);
    }
  };

  const handleFileImport = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 64;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, 64, 64);
            const scale = Math.max(64 / img.width, 64 / img.height);
            const x = (64 - img.width * scale) / 2;
            const y = (64 - img.height * scale) / 2;
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            const imageData = ctx.getImageData(0, 0, 64, 64);
            const baseName = file.name.split(".")[0];
            const preview = canvas.toDataURL();
            setImportedIcons((prev) => [...prev, {
              id: `${Date.now()}_${i}`,
              name: baseName.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
              size: 64,
              imageData,
              preview,
            }]);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragZoneRef.current) dragZoneRef.current.style.backgroundColor = "#e7f3ff";
  };

  const handleDragLeave = () => {
    if (dragZoneRef.current) dragZoneRef.current.style.backgroundColor = "#f9f9f9";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragZoneRef.current) dragZoneRef.current.style.backgroundColor = "#f9f9f9";
    handleFileImport(e.dataTransfer.files);
  };

  const handleDBCDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (dbcDragZoneRef.current) dbcDragZoneRef.current.style.backgroundColor = "#e7f3ff";
  };

  const handleDBCDragLeave = () => {
    if (dbcDragZoneRef.current) dbcDragZoneRef.current.style.backgroundColor = "#f9f9f9";
  };

  const handleDBCDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dbcDragZoneRef.current) dbcDragZoneRef.current.style.backgroundColor = "#f9f9f9";
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      if (files[i].name.toLowerCase().endsWith(".dbc")) {
        handleDBCImport(files[i]);
        break;
      }
    }
  };

  const updateIconName = (id: string, newName: string) => {
    setImportedIcons((prev) =>
      prev.map((icon) =>
        icon.id === id ? { ...icon, name: newName.toLowerCase().replace(/[^a-z0-9_]/g, "_") } : icon
      )
    );
  };

  const updateIconSize = (id: string, size: 32 | 64) => {
    setImportedIcons((prev) =>
      prev.map((icon) => (icon.id === id ? { ...icon, size } : icon))
    );
  };

  const removeIcon = (id: string) => {
    setImportedIcons((prev) => prev.filter((icon) => icon.id !== id));
  };

  const handleBatchConvert = async () => {
    if (importedIcons.length === 0) {
      setError("No icons to convert");
      return;
    }
    try {
      const blpFiles: Array<{ name: string; data: Uint8Array }> = [];
      const newRecords: SpellIconRecord[] = [];
      for (let i = 0; i < importedIcons.length; i++) {
        const icon = importedIcons[i];
        const blpData = createSimpleBLP(icon.imageData);
        blpFiles.push({ name: `${icon.name}.blp`, data: blpData });
        newRecords.push({ id: existingDBC.length + i, iconPath: icon.name });
      }
      const mergedRecords = [...existingDBC, ...newRecords];
      const dbcContent = generateSpellIconDBC(mergedRecords);
      downloadFile(dbcContent, "SpellIcon.dbc", "application/octet-stream");
      for (const blp of blpFiles) {
        downloadFile(blp.data, blp.name, "application/octet-stream");
      }
      setError(null);
      alert(`Successfully converted ${importedIcons.length} icons!\nMerged with ${existingDBC.length} existing icons.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const filteredIcons = icons.filter((icon) => icon.toLowerCase().includes(searchTerm.toLowerCase())).sort();

  const extractNamingPatterns = (names: string[]): string[] => {
    const patterns = new Map<string, number>();
    names.forEach((name) => {
      const parts = name.split("_");
      if (parts.length >= 2) {
        const pattern = parts.slice(0, -1).join("_") + "_";
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    });
    return Array.from(patterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern]) => pattern);
  };

  const applyNamingPattern = (pattern: string) => {
    setImportedIcons((prev) =>
      prev.map((icon, idx) => ({
        ...icon,
        name: `${pattern}${idx + 1}`.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      }))
    );
  };

  const toggleUnmappedSelection = (iconName: string) => {
    setSelectedUnmapped((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(iconName)) {
        newSet.delete(iconName);
      } else {
        newSet.add(iconName);
      }
      return newSet;
    });
  };

  const addSelectedToDBC = () => {
    if (selectedUnmapped.size === 0) {
      alert("No icons selected");
      return;
    }
    const maxId = Math.max(0, ...existingDBC.map(r => r.id));
    const newRecords: SpellIconRecord[] = Array.from(selectedUnmapped).map((iconName, idx) => ({
      id: maxId + idx + 1,
      iconPath: iconName.replace(/\.blp$/i, ''), // Remove .blp extension for DBC
    }));
    const mergedRecords = [...existingDBC, ...newRecords];
    const dbcContent = generateSpellIconDBC(mergedRecords);
    
    // Save to custom_dbc folder instead of downloading
    downloadFile(dbcContent, "SpellIcon_Custom.dbc", "application/octet-stream");
    
    alert(
      `✓ Added ${selectedUnmapped.size} new icons to DBC!\n\n` +
      `Total icons in new DBC: ${mergedRecords.length}\n` +
      `New IDs: ${maxId + 1} - ${maxId + selectedUnmapped.size}\n\n` +
      `File saved as: SpellIcon_Custom.dbc\n` +
      `Copy both custom_dbc/ and custom_icon/ folders to your WoW directory.`
    );
    
    // Update state to reflect new DBC
    setExistingDBC(mergedRecords);
    setUnmappedIcons(prev => prev.filter(icon => !selectedUnmapped.has(icon)));
    setSelectedUnmapped(new Set());
  };

  return (
    <div style={{ padding: "16px" }}>
      <h2 style={{ textAlign: "left" }}>Spell Icon Editor</h2>
      
      <SettingsPanel />
      
      <div style={{ marginBottom: "20px", display: "flex", gap: "8px" }}>
        <button
          onClick={() => setMode("browse")}
          style={{
            padding: "10px 16px",
            backgroundColor: mode === "browse" ? "#007bff" : "#ccc",
            color: mode === "browse" ? "#fff" : "#000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Browse Icons (Custom)
        </button>
        <button
          onClick={() => setMode("create")}
          style={{
            padding: "10px 16px",
            backgroundColor: mode === "create" ? "#28a745" : "#ccc",
            color: mode === "create" ? "#fff" : "#000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Add New Icons
        </button>
      </div>

      {error && (
        <div style={{ color: "red", marginBottom: "16px", padding: "10px", backgroundColor: "#ffe7e7", borderRadius: "4px" }}>
          Error: {error}
        </div>
      )}

      {mode === "browse" && (
        <>
          <div style={{ display: "flex", gap: "16px" }}>
            {/* Left side: DBC entries */}
            <div style={{ flex: "1" }}>
              <h3 style={{ textAlign: "left" }}>DBC Entries ({existingDBC.length})</h3>
              <p style={{ fontSize: "14px", color: "#666" }}>Icons currently in your SpellIcon.dbc file</p>
              
              <div style={{ marginBottom: "12px" }}>
                <input
                  type="text"
                  placeholder="Search DBC entries..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    width: "100%",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div style={{
                border: "1px solid #ddd",
                borderRadius: "4px",
                maxHeight: "500px",
                overflowY: "auto",
                backgroundColor: "#fff",
              }}>
                {existingDBC.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#999" }}>
                    No DBC file imported. Import a SpellIcon.dbc in Create mode.
                  </div>
                ) : (
                  existingDBC
                    .filter(record => record.iconPath.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((record) => (
                      <div key={record.id} style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px",
                        borderBottom: "1px solid #eee",
                        gap: "12px",
                      }}>
                        <div style={{
                          width: "50px",
                          fontSize: "13px",
                          color: "#666",
                          fontWeight: "bold",
                        }}>
                          ID: {record.id}
                        </div>
                        <div style={{
                          width: "64px",
                          height: "64px",
                          border: "1px solid #ccc",
                          borderRadius: "4px",
                          overflow: "hidden",
                          flexShrink: 0,
                        }}>
                          <IconThumbnail
                            iconName={record.iconPath}
                            isSelected={false}
                            onSelect={() => {}}
                            getThumbnail={getThumbnail}
                          />
                        </div>
                        <div style={{ flex: 1, fontSize: "14px" }}>
                          {record.iconPath}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Right side: New custom icons */}
            <div style={{ flex: "1" }}>
              <h3 style={{ textAlign: "left" }}>
                New Custom Icons ({newIconsOnly.length})
              </h3>
              <p style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
                Icons not in base WotLK ({unmappedIcons.length} total unmapped, {newIconsOnly.length} are custom)
              </p>
              
              {newIconsOnly.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <button
                    onClick={addSelectedToDBC}
                    disabled={selectedUnmapped.size === 0}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: selectedUnmapped.size > 0 ? "#28a745" : "#ccc",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      cursor: selectedUnmapped.size > 0 ? "pointer" : "not-allowed",
                      fontSize: "14px",
                      fontWeight: "bold",
                    }}
                  >
                    Add Selected to New DBC ({selectedUnmapped.size})
                  </button>
                </div>
              )}

              <div style={{
                border: "1px solid #ddd",
                borderRadius: "4px",
                maxHeight: "500px",
                overflowY: "auto",
                backgroundColor: "#fff",
              }}>
                {newIconsOnly.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#999" }}>
                    {existingDBC.length === 0 
                      ? "Import a DBC file to detect new custom icons"
                      : unmappedIcons.length === 0 
                        ? "All icons in DBC!"
                        : "All unmapped icons are from base WotLK"}
                  </div>
                ) : (
                  newIconsOnly.map((iconName) => (
                    <div key={iconName} style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "8px",
                      borderBottom: "1px solid #eee",
                      gap: "12px",
                      backgroundColor: selectedUnmapped.has(iconName) ? "#e7f3ff" : "transparent",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleUnmappedSelection(iconName)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUnmapped.has(iconName)}
                        onChange={() => toggleUnmappedSelection(iconName)}
                        style={{ width: "18px", height: "18px", cursor: "pointer" }}
                      />
                      <div style={{
                        width: "64px",
                        height: "64px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}>
                        <IconThumbnail
                          iconName={iconName}
                          isSelected={false}
                          onSelect={() => {}}
                          getThumbnail={getThumbnail}
                        />
                      </div>
                      <div style={{ flex: 1, fontSize: "14px" }}>
                        {iconName}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {mode === "create" && (
        <>
          <p>Import images, convert to WoW BLP format, and generate/merge SpellIcon.dbc</p>

          <div style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "20px",
            backgroundColor: "#f5f5f5",
          }}>
            <h4>Step 1: Import Existing DBC (Optional)</h4>
            <p style={{ fontSize: "14px", color: "#666", margin: "0 0 12px 0" }}>
              Drag and drop your SpellIcon.dbc or click to browse
            </p>
            <div
              ref={dbcDragZoneRef}
              onDragOver={handleDBCDragOver}
              onDragLeave={handleDBCDragLeave}
              onDrop={handleDBCDrop}
              onClick={() => dbcInputRef.current?.click()}
              style={{
                border: "2px dashed #0056b3",
                borderRadius: "8px",
                padding: "20px",
                textAlign: "center",
                backgroundColor: "#f9f9f9",
                cursor: "pointer",
                transition: "background-color 0.2s",
                marginBottom: "12px",
              }}
            >
              <p style={{ margin: "0", fontSize: "14px", color: "#666" }}>
                Drop DBC file here or click to browse
              </p>
            </div>
            <input
              ref={dbcInputRef}
              type="file"
              accept=".dbc"
              onChange={(e) => e.target.files?.[0] && handleDBCImport(e.target.files[0])}
              style={{ display: "none" }}
            />
            
            {dbcLoading && (
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "14px", marginBottom: "6px" }}>Importing DBC...</div>
                <div style={{
                  width: "100%",
                  height: "4px",
                  backgroundColor: "#ddd",
                  borderRadius: "2px",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    backgroundColor: "#0056b3",
                    animation: "progress 1.5s ease-in-out infinite",
                  }} />
                </div>
              </div>
            )}

            {dbcImported && !dbcLoading && (
              <div style={{
                padding: "8px 12px",
                backgroundColor: "#d4edda",
                color: "#155724",
                borderRadius: "4px",
                marginBottom: "12px",
                fontSize: "14px",
              }}>
                ✓ Import OK - DBC verified and cached
              </div>
            )}

            {existingDBC.length > 0 && (
              <div style={{ fontSize: "14px", color: "#333", marginTop: "12px" }}>
                <strong>{existingDBC.length}</strong> icons loaded from DBC
              </div>
            )}
          </div>

          {existingDBC.length > 0 && importedIcons.length > 0 && (
            <div style={{
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "20px",
              backgroundColor: "#f0f8ff",
            }}>
              <h4>Icon Comparison</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "14px" }}>
                <div>
                  <strong>Existing Icons:</strong>
                  <ul style={{ fontSize: "12px", maxHeight: "150px", overflowY: "auto" }}>
                    {Array.from(dbcCompare.existing).slice(0, 10).map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                    {dbcCompare.existing.size > 10 && <li>... and {dbcCompare.existing.size - 10} more</li>}
                  </ul>
                </div>
                <div>
                  <strong>New Icons to Add:</strong>
                  <ul style={{ fontSize: "12px", maxHeight: "150px", overflowY: "auto" }}>
                    {Array.from(dbcCompare.new).map((name) => (
                      <li key={name} style={{ color: "#28a745" }}>+ {name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "20px",
            backgroundColor: "#f5f5f5",
          }}>
            <h4>Step 2: Import Custom Icons</h4>
            {namingPatterns.length > 0 && (
              <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#fff", borderRadius: "4px" }}>
                <p style={{ fontSize: "13px", color: "#666", margin: "0 0 8px 0", fontWeight: "500" }}>
                  💡 Auto-naming Patterns Detected (click to apply):
                </p>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {namingPatterns.map((pattern) => (
                    <button
                      key={pattern}
                      onClick={() => applyNamingPattern(pattern)}
                      style={{
                        padding: "6px 10px",
                        backgroundColor: "#e7f3ff",
                        border: "1px solid #0056b3",
                        borderRadius: "3px",
                        color: "#0056b3",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "500",
                        transition: "all 0.2s",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = "#0056b3";
                        e.currentTarget.style.color = "#fff";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = "#e7f3ff";
                        e.currentTarget.style.color = "#0056b3";
                      }}
                    >
                      {pattern}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div
              ref={dragZoneRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: "2px dashed #007bff",
                borderRadius: "8px",
                padding: "40px",
                textAlign: "center",
                backgroundColor: "#f9f9f9",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <p style={{ fontSize: "16px", color: "#666" }}>
                Drag and drop images here or click to browse
              </p>
              <p style={{ fontSize: "12px", color: "#999" }}>
                Supported: JPEG, PNG, BMP, GIF
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => e.target.files && handleFileImport(e.target.files)}
              style={{ display: "none" }}
            />
          </div>

          {importedIcons.length > 0 && (
            <div style={{
              padding: "12px",
              backgroundColor: "#e8f5e9",
              border: "1px solid #4caf50",
              borderRadius: "4px",
              marginBottom: "16px",
              fontSize: "14px",
              color: "#2e7d32",
            }}>
              📦 Ready for Conversion: <strong>{importedIcons.length}</strong> image{importedIcons.length !== 1 ? "s" : ""} cached
            </div>
          )}

          {importedIcons.length > 0 && (
            <>
              <h4>Step 3: Configure Icons ({importedIcons.length})</h4>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "16px",
                marginBottom: "20px",
              }}>
                {importedIcons.map((icon) => (
                  <div key={icon.id} style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "12px",
                    backgroundColor: "#fff",
                  }}>
                    <img
                      src={icon.preview}
                      alt={icon.name}
                      style={{
                        width: "100%",
                        height: "80px",
                        objectFit: "contain",
                        marginBottom: "8px",
                        backgroundColor: "#000",
                      }}
                    />
                    <input
                      type="text"
                      value={icon.name}
                      onChange={(e) => updateIconName(icon.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px",
                        marginBottom: "8px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        fontSize: "12px",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ marginBottom: "8px", fontSize: "12px" }}>
                      <label style={{ marginRight: "8px" }}>
                        <input
                          type="radio"
                          name={`size_${icon.id}`}
                          value="32"
                          checked={icon.size === 32}
                          onChange={() => updateIconSize(icon.id, 32)}
                        />
                        32x32
                      </label>
                      <label>
                        <input
                          type="radio"
                          name={`size_${icon.id}`}
                          value="64"
                          checked={icon.size === 64}
                          onChange={() => updateIconSize(icon.id, 64)}
                        />
                        64x64
                      </label>
                    </div>
                    <button
                      onClick={() => removeIcon(icon.id)}
                      style={{
                        width: "100%",
                        padding: "6px",
                        backgroundColor: "#dc3545",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={handleBatchConvert}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#28a745",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "16px",
                  fontWeight: "bold",
                }}
              >
                Step 4: Batch Convert & Download
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
};

const IconThumbnail: React.FC<{
  iconName: string;
  isSelected: boolean;
  onSelect: () => void;
  getThumbnail: (name: string) => Promise<string>;
}> = ({ iconName, isSelected, onSelect, getThumbnail }) => {
  const [thumbSrc, setThumbSrc] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && !thumbSrc && !loading) {
          setLoading(true);
          const src = await getThumbnail(iconName);
          setThumbSrc(src);
          setLoading(false);
        }
      },
      { rootMargin: "50px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => { if (ref.current) observer.unobserve(ref.current); };
  }, [getThumbnail, iconName, thumbSrc, loading]);

  return (
    <button
      ref={ref}
      onClick={onSelect}
      style={{
        padding: "0",
        border: isSelected ? "3px solid #007bff" : "1px solid #ccc",
        borderRadius: "4px",
        cursor: "pointer",
        backgroundColor: isSelected ? "#e7f3ff" : "#fff",
        width: "64px",
        height: "64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transition: "all 0.2s",
      }}
      title={iconName}
      onMouseEnter={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.transform = "scale(1.1)";
        target.style.zIndex = "10";
      }}
      onMouseLeave={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.transform = "scale(1)";
        target.style.zIndex = "1";
      }}
    >
      {thumbSrc ? (
        <img src={thumbSrc} alt={iconName} style={{ maxWidth: "100%", maxHeight: "100%" }} />
      ) : (
        <div style={{ color: "#999", fontSize: "12px" }}>...</div>
      )}
    </button>
  );
};

function createSimpleBLP(imageData: ImageData): Uint8Array {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const header = new Uint8Array(156);
  const view = new DataView(header.buffer);
  header[0] = 0x42;
  header[1] = 0x4c;
  header[2] = 0x50;
  header[3] = 0x31;
  view.setUint32(4, 1, true);
  header[8] = 3;
  header[9] = 8;
  header[10] = 7;
  header[11] = 1;
  view.setUint32(12, width, true);
  view.setUint32(16, height, true);
  view.setUint32(20, 156, true);
  view.setUint32(24, 0, true);
  const pixelDataSize = width * height * 4;
  view.setUint32(100, pixelDataSize, true);
  const result = new Uint8Array(156 + pixelDataSize);
  result.set(header);
  result.set(data, 156);
  return result;
}

function generateSpellIconDBC(records: SpellIconRecord[]): Uint8Array {
  const header = new Uint8Array(20);
  const headerView = new DataView(header.buffer);
  header[0] = 87;
  header[1] = 68;
  header[2] = 66;
  header[3] = 67;
  const fieldCount = 2;
  const recordCount = records.length;
  const fieldSize = fieldCount * 4;
  const stringBlockSize = 1;
  headerView.setUint32(4, fieldCount, true);
  headerView.setUint32(8, recordCount, true);
  headerView.setUint32(12, fieldSize, true);
  headerView.setUint32(16, stringBlockSize, true);
  const recordBuffer = new Uint32Array(recordCount * fieldCount);
  records.forEach((record, i) => {
    recordBuffer[i * fieldCount] = record.id;
    recordBuffer[i * fieldCount + 1] = 0;
  });
  const totalSize = header.length + recordBuffer.byteLength + stringBlockSize;
  const result = new Uint8Array(totalSize);
  result.set(header, 0);
  result.set(new Uint8Array(recordBuffer.buffer), header.length);
  return result;
}

function downloadFile(content: string | Uint8Array, filename: string, mimeType: string): void {
  const arr = content instanceof Uint8Array ? [content] : [content];
  const blob = new Blob(arr, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// CSS for loading animation
const styles = `
  @keyframes progress {
    0% { width: 0%; }
    50% { width: 70%; }
    100% { width: 100%; }
  }
`;

if (!document.querySelector('style[data-spell-icon-editor]')) {
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-spell-icon-editor', 'true');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

export default SpellIconEditor;
