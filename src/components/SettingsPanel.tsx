import React, { useState, useEffect } from 'react';
import { loadConfig, saveConfig, type AppConfig } from '../lib/config';

const SettingsPanel: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [dbcCopied, setDbcCopied] = useState(false);
  const [iconsCopied, setIconsCopied] = useState(false);
  const [copying, setCopying] = useState<'dbc' | 'icons' | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
    checkFilesExist();
  }, []);

  const checkFilesExist = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/check-files');
      if (response.ok) {
        const data = await response.json();
        setDbcCopied(data.dbcExists);
        setIconsCopied(data.iconsExist);
      }
    } catch (error) {
      console.error('Error checking files:', error);
    }
  };

  const copyDbcFiles = async () => {
    if (!config) return;
    setCopying('dbc');
    try {
      const response = await fetch('http://localhost:3001/api/copy-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: config.paths.base.dbc,
          destination: config.paths.custom.dbc,
          type: 'dbc',
        }),
      });

      if (response.ok) {
        setDbcCopied(true);
        alert('✓ DBC files copied successfully!');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      alert('Backend server not running. Make sure to run: npm run server');
    } finally {
      setCopying(null);
      checkFilesExist();
    }
  };

  const copyIconFiles = async () => {
    if (!config) return;
    setCopying('icons');
    try {
      const response = await fetch('http://localhost:3001/api/copy-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: config.paths.base.icons,
          destination: config.paths.custom.icons,
          type: 'icons',
        }),
      });

      if (response.ok) {
        setIconsCopied(true);
        alert('✓ Icon files copied successfully!');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      alert('Backend server not running. Make sure to run: npm run server');
    } finally {
      setCopying(null);
      checkFilesExist();
    }
  };

  if (!config) return null;

  const allReady = dbcCopied && iconsCopied;

  return (
    <div style={{ marginBottom: '20px' }}>
      {!allReady && (
        <div style={{
          border: '1px solid #6c757d',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: '#6c757d',
          marginBottom: '16px',
        }}>
          <h3 style={{ marginTop: 0, textAlign: 'left', color: '#fff' }}>📋 Initial Setup Required</h3>
          <p style={{ fontSize: '14px', color: '#e0e0e0', marginBottom: '16px' }}>
            Copy base files to custom folders to begin. You only need to do this once.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* DBC Copy Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {dbcCopied ? (
                <>
                  <div style={{ fontSize: '24px' }}>✅</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', color: '#fff' }}>DBC Files Copied</div>
                    <div style={{ fontSize: '12px', color: '#e0e0e0' }}>SpellIcon.dbc ready in custom_dbc/</div>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={copyDbcFiles}
                    disabled={copying === 'dbc'}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#9c27b0',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: copying === 'dbc' ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      opacity: copying === 'dbc' ? 0.6 : 1,
                      minWidth: '160px',
                    }}
                  >
                    {copying === 'dbc' ? 'Copying...' : 'Copy DBC Files'}
                  </button>
                  <div style={{ flex: 1, fontSize: '12px', color: '#e0e0e0' }}>
                    From: {config.paths.base.dbc}
                  </div>
                </>
              )}
            </div>

            {/* Icons Copy Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {iconsCopied ? (
                <>
                  <div style={{ fontSize: '24px' }}>✅</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', color: '#fff' }}>Icon Files Copied</div>
                    <div style={{ fontSize: '12px', color: '#e0e0e0' }}>Base icons ready in custom_icon/</div>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={copyIconFiles}
                    disabled={copying === 'icons'}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#9c27b0',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: copying === 'icons' ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      opacity: copying === 'icons' ? 0.6 : 1,
                      minWidth: '160px',
                    }}
                  >
                    {copying === 'icons' ? 'Copying...' : 'Copy Interface Files'}
                  </button>
                  <div style={{ flex: 1, fontSize: '12px', color: '#e0e0e0' }}>
                    From: {config.paths.base.icons}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {allReady && (
        <>
          <div style={{
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: '#6c757d',
            border: '1px solid #6c757d',
            borderRadius: '8px',
            color: '#fff',
            fontWeight: 'bold',
            textAlign: 'center',
          }}>
            ✅ Setup Complete! Ready to edit.
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              marginBottom: showSettings ? '12px' : '0',
            }}
          >
            ⚙️ {showSettings ? 'Hide Settings' : 'Show Settings'}
          </button>

          {showSettings && (
            <div style={{
              border: '1px solid #6c757d',
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: '#6c757d',
              marginTop: '12px',
            }}>
              <h3 style={{ marginTop: 0, textAlign: 'left', color: '#fff' }}>Configuration</h3>

              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ textAlign: 'left', fontSize: '14px', marginBottom: '8px', color: '#fff' }}>DBC Source:</h4>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#fff' }}>
                    <input
                      type="radio"
                      checked={config.settings.activeDBCSource === 'base'}
                      onChange={() => {
                        const newConfig = { ...config };
                        newConfig.settings.activeDBCSource = 'base';
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      style={{ marginRight: '6px' }}
                    />
                    <span>Base WotLK (Read-Only)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#fff' }}>
                    <input
                      type="radio"
                      checked={config.settings.activeDBCSource === 'custom'}
                      onChange={() => {
                        const newConfig = { ...config };
                        newConfig.settings.activeDBCSource = 'custom';
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      style={{ marginRight: '6px' }}
                    />
                    <span>Custom (Server)</span>
                  </label>
                </div>
                <div style={{ fontSize: '12px', color: '#e0e0e0', paddingLeft: '4px' }}>
                  📁 {config.settings.activeDBCSource === 'base'
                    ? config.paths.base.dbc
                    : config.paths.custom.dbc}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ textAlign: 'left', fontSize: '14px', marginBottom: '8px', color: '#fff' }}>Icon Source:</h4>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#fff' }}>
                    <input
                      type="radio"
                      checked={config.settings.activeIconSource === 'base'}
                      onChange={() => {
                        const newConfig = { ...config };
                        newConfig.settings.activeIconSource = 'base';
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      style={{ marginRight: '6px' }}
                    />
                    <span>Base WotLK Icons</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#fff' }}>
                    <input
                      type="radio"
                      checked={config.settings.activeIconSource === 'custom'}
                      onChange={() => {
                        const newConfig = { ...config };
                        newConfig.settings.activeIconSource = 'custom';
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      style={{ marginRight: '6px' }}
                    />
                    <span>Custom Icons</span>
                  </label>
                </div>
                <div style={{ fontSize: '12px', color: '#e0e0e0', paddingLeft: '4px' }}>
                  📁 {config.settings.activeIconSource === 'base'
                    ? config.paths.base.icons
                    : config.paths.custom.icons}
                </div>
              </div>

              <div style={{
                padding: '12px',
                backgroundColor: '#555',
                border: '1px solid #777',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#e0e0e0',
              }}>
                <strong>ℹ️ Note:</strong> Base files are read-only references. Custom files are for server integration.
                Changes are saved to your custom DBC/Icon folders.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SettingsPanel;

