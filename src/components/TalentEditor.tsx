import React, { useCallback, useState } from 'react';

const TalentEditor: React.FC = () => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFileName(e.dataTransfer.files[0].name);
      // TODO: parse file here
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileName(e.target.files[0].name);
      // TODO: parse file here
    }
  };

  return (
    <div>
      <h2 style={{ textAlign: "left" }}>Talent Editor</h2>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: dragActive ? '2px solid #007bff' : '2px dashed #aaa',
          borderRadius: 8,
          padding: 32,
          textAlign: 'center',
          background: dragActive ? '#e6f0ff' : '#fafbfc',
          marginBottom: 16,
          cursor: 'pointer',
        }}
      >
        <input
          type="file"
          accept=".dbc,.csv"
          style={{ display: 'none' }}
          id="talent-file-input"
          onChange={handleFileInput}
        />
        <label htmlFor="talent-file-input" style={{ cursor: 'pointer' }}>
          {fileName ? (
            <span>Loaded file: <b>{fileName}</b></span>
          ) : (
            <span>Drag and drop a Talent.dbc or CSV file here, or click to select</span>
          )}
        </label>
      </div>
      {/* Table/grid and import/export UI will go here */}
    </div>
  );
};

export default TalentEditor;
