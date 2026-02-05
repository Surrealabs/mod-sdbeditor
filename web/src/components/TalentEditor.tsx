import React, { useCallback, useState } from 'react';

const TalentEditor: React.FC = () => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.dbc') || file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setFileName(file.name);
        setUploadStatus('idle');
      }
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
      const file = e.target.files[0];
      setSelectedFile(file);
      setFileName(file.name);
      setUploadStatus('idle');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploadStatus('uploading');
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('http://localhost:3001/api/export-dbc', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setUploadStatus('success');
        setTimeout(() => {
          setUploadStatus('idle');
          setSelectedFile(null);
          setFileName(null);
        }, 2000);
      } else {
        setUploadStatus('error');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadStatus('error');
    }
  };

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ textAlign: "left" }}>Talent Editor (GM)</h2>
      <p style={{ color: '#555', marginBottom: 12 }}>
        Upload modified talent tree files (DBC or CSV) to update server configuration.
      </p>
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          {fileName ? (
            <div>
              <p style={{ fontWeight: 'bold' }}>Selected: {fileName}</p>
              <p style={{ fontSize: 12, color: '#666' }}>Ready to upload</p>
            </div>
          ) : (
            <div>
              <p style={{ fontWeight: 'bold' }}>Drag and drop a DBC or CSV file here</p>
              <p style={{ fontSize: 12, color: '#666' }}>or click to select</p>
            </div>
          )}
        </label>
      </div>
      
      {selectedFile && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={handleUpload}
            disabled={uploadStatus === 'uploading'}
            style={{
              padding: '10px 20px',
              borderRadius: 4,
              border: 'none',
              background: uploadStatus === 'uploading' ? '#ccc' : '#007bff',
              color: '#fff',
              cursor: uploadStatus === 'uploading' ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload to Server'}
          </button>
        </div>
      )}

      {uploadStatus === 'success' && (
        <div style={{ padding: 12, background: '#c8e6c9', borderRadius: 4, color: '#2e7d32' }}>
          ✓ Talent tree uploaded successfully!
        </div>
      )}

      {uploadStatus === 'error' && (
        <div style={{ padding: 12, background: '#ffcdd2', borderRadius: 4, color: '#c62828' }}>
          ✗ Upload failed. Please try again.
        </div>
      )}
    </div>
  );
};

export default TalentEditor;
