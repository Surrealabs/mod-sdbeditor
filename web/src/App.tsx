
import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

import TalentBuilder from './components/TalentBuilder';
import TalentEditor from './components/TalentEditor';
import SpellIconEditor from './components/SpellIconEditor';
import ServerStarter from './components/ServerStarter';
import AccountControl from './components/AccountControl';

function App() {
  const [tab, setTab] = useState<'armory' | 'talentbuilder' | 'talenteditor' | 'spellicon' | 'serverstarter' | 'accountcontrol' | 'settings'>('armory');
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('starterToken'));
  const [gmLevel, setGmLevel] = useState<number>(() => Number(localStorage.getItem('starterGmLevel') || 0));
  const [loginError, setLoginError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [headerUploadBusy, setHeaderUploadBusy] = useState(false);
  const [loginTitle, setLoginTitle] = useState<string>('SDBEditor Login');
  const [editingLoginTitle, setEditingLoginTitle] = useState<string>('');
  const [pageTitle, setPageTitle] = useState<string>('SDBEditor');
  const [editingPageTitle, setEditingPageTitle] = useState<string>('');
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff');
  const [editingBackgroundColor, setEditingBackgroundColor] = useState<string>('#ffffff');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundUploadBusy, setBackgroundUploadBusy] = useState(false);
  const [pageIcon, setPageIcon] = useState<string | null>(null);
  const [pageIconUploadBusy, setPageIconUploadBusy] = useState(false);
  const [pageIconError, setPageIconError] = useState<string | null>(null);
  const [textColor, setTextColor] = useState<string>('#000000');
  const [editingTextColor, setEditingTextColor] = useState<string>('#000000');
  const [contentBoxColor, setContentBoxColor] = useState<string>('#f9f9f9');
  const [editingContentBoxColor, setEditingContentBoxColor] = useState<string>('#f9f9f9');

  // Update document title when pageTitle changes
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  // Update favicon when pageIcon changes
  useEffect(() => {
    if (pageIcon) {
      let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = pageIcon;
      favicon.type = 'image/png';
    }
  }, [pageIcon]);

  const starterBase = useMemo(() => {
    return `http://${window.location.hostname}:5000`;
  }, []);

  const fileBase = useMemo(() => {
    return `http://${window.location.hostname}:3001`;
  }, []);

  useEffect(() => {
    fetch(`${starterBase}/api/starter/health`)
      .then((res) => res.json())
      .then((data) => setNeedsSetup(Boolean(data.needsSetup)))
      .catch(() => setNeedsSetup(false));
    
    // Load custom login title
    fetch(`${starterBase}/api/starter/settings/login-title`)
      .then((res) => res.json())
      .then((data) => {
        if (data.loginTitle) {
          setLoginTitle(data.loginTitle);
          setEditingLoginTitle(data.loginTitle);
        }
      })
      .catch(() => {
        // Use default
      });
  }, [starterBase]);

  useEffect(() => {
    // Load header image from file service
    fetch(`${fileBase}/header-image.png`)
      .then((res) => {
        if (res.ok) {
          setHeaderImage(`${fileBase}/header-image.png?t=${Date.now()}`);
        }
      })
      .catch(() => {
        // Header image doesn't exist yet
      });
    
    // Load background image
    fetch(`${fileBase}/background-image.png`)
      .then((res) => {
        if (res.ok) {
          setBackgroundImage(`${fileBase}/background-image.png?t=${Date.now()}`);
        }
      })
      .catch(() => {
        // Background image doesn't exist yet
      });
    
    // Load page icon (try .ico first, then .png)
    fetch(`${fileBase}/page-icon.ico`)
      .then((res) => {
        if (res.ok) {
          setPageIcon(`${fileBase}/page-icon.ico?t=${Date.now()}`);
        } else {
          // Try PNG format
          return fetch(`${fileBase}/page-icon.png`);
        }
      })
      .then((res) => {
        if (res && res.ok) {
          setPageIcon(`${fileBase}/page-icon.png?t=${Date.now()}`);
        }
      })
      .catch(() => {
        // Page icon doesn't exist yet
      });
    
    // Load background color
    fetch(`${starterBase}/api/starter/settings/background`)
      .then((res) => res.json())
      .then((data) => {
        if (data.backgroundColor) {
          setBackgroundColor(data.backgroundColor);
          setEditingBackgroundColor(data.backgroundColor);
        }
        if (data.textColor) {
          setTextColor(data.textColor);
          setEditingTextColor(data.textColor);
        }
        if (data.contentBoxColor) {
          setContentBoxColor(data.contentBoxColor);
          setEditingContentBoxColor(data.contentBoxColor);
        }
        if (data.pageTitle) {
          setPageTitle(data.pageTitle);
          setEditingPageTitle(data.pageTitle);
        }
      })
      .catch(() => {
        // Use default
      });
  }, [fileBase, starterBase]);

  useEffect(() => {
    if (gmLevel <= 0 && (tab === 'serverstarter' || tab === 'spellicon' || tab === 'talenteditor' || tab === 'settings')) {
      setTab('armory');
    }
  }, [gmLevel, tab]);

  const onLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setBusy(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const username = String(formData.get('username') || '');
    const password = String(formData.get('password') || '');

    try {
      const response = await fetch(`${starterBase}/api/starter/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setLoginError(payload.error || 'Login failed');
        return;
      }

      localStorage.setItem('starterToken', payload.token);
      localStorage.setItem('starterGmLevel', String(payload.gmLevel ?? 0));
      setToken(payload.token);
      setGmLevel(payload.gmLevel ?? 0);
      form.reset();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const onLogout = () => {
    localStorage.removeItem('starterToken');
    localStorage.removeItem('starterGmLevel');
    setToken(null);
    setGmLevel(0);
  };

  const onSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignupError(null);
    setSignupSuccess(false);
    setBusy(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const username = String(formData.get('username') || '');
    const password = String(formData.get('password') || '');
    const email = String(formData.get('email') || '');

    try {
      const response = await fetch(`${starterBase}/api/starter/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setSignupError(payload.error || 'Signup failed');
        return;
      }

      setSignupSuccess(true);
      form.reset();
      setTimeout(() => {
        setShowSignup(false);
        setSignupSuccess(false);
      }, 2000);
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Signup failed');
    } finally {
      setBusy(false);
    }
  };

  const onHeaderImageUpload = async (file: File) => {
    if (gmLevel <= 0) return;

    try {
      setHeaderUploadBusy(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${fileBase}/api/upload-header-image`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        // Reload header image with cache busting
        setHeaderImage(`${fileBase}/header-image.png?t=${Date.now()}`);
      }
    } catch (err) {
      console.error('Header upload error:', err);
    } finally {
      setHeaderUploadBusy(false);
    }
  };

  const onSaveLoginTitle = async () => {
    try {
      const response = await fetch(`${starterBase}/api/starter/settings/login-title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginTitle: editingLoginTitle }),
      });
      if (response.ok) {
        setLoginTitle(editingLoginTitle);
      }
    } catch (err) {
      console.error('Failed to save login title:', err);
    }
  };

  const onSavePageTitle = async () => {
    try {
      const response = await fetch(`${starterBase}/api/starter/settings/page-title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageTitle: editingPageTitle }),
      });
      if (response.ok) {
        setPageTitle(editingPageTitle);
      }
    } catch (err) {
      console.error('Failed to save page title:', err);
    }
  };

  const onSaveBackgroundColor = async () => {
    try {
      const response = await fetch(`${starterBase}/api/starter/settings/background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundColor: editingBackgroundColor, textColor, contentBoxColor }),
      });
      if (response.ok) {
        setBackgroundColor(editingBackgroundColor);
      }
    } catch (err) {
      console.error('Failed to save background color:', err);
    }
  };

  const onSaveTextColor = async () => {
    try {
      const response = await fetch(`${starterBase}/api/starter/settings/background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundColor, textColor: editingTextColor, contentBoxColor }),
      });
      if (response.ok) {
        setTextColor(editingTextColor);
      }
    } catch (err) {
      console.error('Failed to save text color:', err);
    }
  };

  const onSaveContentBoxColor = async () => {
    try {
      const response = await fetch(`${starterBase}/api/starter/settings/background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundColor, textColor, contentBoxColor: editingContentBoxColor }),
      });
      if (response.ok) {
        setContentBoxColor(editingContentBoxColor);
      }
    } catch (err) {
      console.error('Failed to save content box color:', err);
    }
  };

  const onBackgroundImageUpload = async (file: File) => {
    if (gmLevel <= 0) return;

    try {
      setBackgroundUploadBusy(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${fileBase}/api/upload-background-image`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setBackgroundImage(`${fileBase}/background-image.png?t=${Date.now()}`);
      }
    } catch (err) {
      console.error('Background upload error:', err);
    } finally {
      setBackgroundUploadBusy(false);
    }
  };

  const onClearBackground = async () => {
    try {
      const response = await fetch(`${fileBase}/api/clear-background-image`, {
        method: 'POST',
      });
      if (response.ok) {
        setBackgroundImage(null);
      }
    } catch (err) {
      console.error('Failed to clear background:', err);
    }
  };

  const onPageIconUpload = async (file: File) => {
    if (gmLevel <= 0) return;

    try {
      setPageIconUploadBusy(true);
      setPageIconError(null);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${fileBase}/api/upload-page-icon`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.filename) {
        // Use the actual filename returned by the server
        setPageIcon(`${fileBase}/${data.filename}?t=${Date.now()}`);
      } else {
        setPageIconError(data.error || 'Upload failed');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      setPageIconError(errorMsg);
      console.error('Page icon upload error:', err);
    } finally {
      setPageIconUploadBusy(false);
    }
  };

  const onClearPageIcon = async () => {
    try {
      setPageIconError(null);
      const response = await fetch(`${fileBase}/api/clear-page-icon`, {
        method: 'POST',
      });
      if (response.ok) {
        setPageIcon(null);
      } else {
        const data = await response.json();
        setPageIconError(data.error || 'Clear failed');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Clear failed';
      setPageIconError(errorMsg);
      console.error('Failed to clear page icon:', err);
    }
  };

  if (!token) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: backgroundImage
            ? `url(${backgroundImage}) center/cover no-repeat`
            : backgroundColor,
          color: textColor,
        }}
      >
        {showSignup ? (
          <div style={{ width: 300, paddingLeft: 24, paddingTop: 0 }}>
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Create Account</h2>
            <form onSubmit={onSignup}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input name="username" placeholder="Username" required style={{ padding: 6 }} />
                <input name="password" type="password" placeholder="Password" required style={{ padding: 6 }} />
                <input name="email" type="email" placeholder="Email" required style={{ padding: 6 }} />
                <button type="submit" disabled={busy} style={{ padding: 6 }}>
                  {busy ? 'Creating...' : 'Create Account'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSignup(false);
                    setSignupError(null);
                    setSignupSuccess(false);
                  }}
                  style={{ padding: 6, background: '#6b7280', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  Back to Login
                </button>
              </div>
            </form>
            {signupError && <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 12 }}>{signupError}</div>}
            {signupSuccess && <div style={{ marginTop: 12, color: '#16a34a', fontSize: 12 }}>Account created! Redirecting to login...</div>}
          </div>
        ) : (
          <div style={{ width: 150, paddingLeft: 24, paddingTop: 0 }}>
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>{loginTitle}</h2>
            {needsSetup && (
              <div style={{ marginBottom: 12, padding: 10, background: '#f1f5f9', borderRadius: 6 }}>
                Starter service not configured. Open {starterBase} to run setup.
              </div>
            )}
            <form onSubmit={onLogin}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input name="username" placeholder="Game account" required style={{ padding: 6 }} />
                <input name="password" type="password" placeholder="Password" required style={{ padding: 6 }} />
                <button type="submit" disabled={busy} style={{ padding: 6 }}>{busy ? 'Signing in...' : 'Sign in'}</button>
                <button
                  type="button"
                  onClick={() => setShowSignup(true)}
                  style={{ padding: 6, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  Sign Up
                </button>
              </div>
            </form>
            {loginError && <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 12 }}>{loginError}</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: backgroundImage
          ? `url(${backgroundImage}) center/cover no-repeat`
          : backgroundColor,
        color: textColor,
      }}
    >
      {/* Header Section */}
      <div
        style={{
          width: '100%',
          minHeight: 120,
          background: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          borderBottom: '1px solid #ddd',
          overflow: 'hidden',
        }}
      >
        {headerImage ? (
          <img
            src={headerImage}
            alt="Server Header"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ color: '#aaa', fontSize: 14 }}>Server Header (admins can upload an image)</div>
        )}

        {gmLevel > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
            }}
          >
            <label
              htmlFor="header-file-input"
              style={{
                padding: '6px 12px',
                background: '#007bff',
                color: '#fff',
                borderRadius: 4,
                cursor: headerUploadBusy ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 'bold',
                opacity: headerUploadBusy ? 0.6 : 1,
              }}
            >
              {headerUploadBusy ? 'Uploading...' : 'Upload Image'}
            </label>
            <input
              id="header-file-input"
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  onHeaderImageUpload(e.target.files[0]);
                }
                e.target.value = ''; // Reset input
              }}
              style={{ display: 'none' }}
              disabled={headerUploadBusy}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #ccc', marginBottom: 0, paddingLeft: 24 }}>
        <button
          style={{
            padding: '8px 16px',
            border: 'none',
            borderBottom: tab === 'armory' ? '2px solid #007bff' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontWeight: tab === 'armory' ? 'bold' : 'normal',
            color: textColor,
          }}
          onClick={() => setTab('armory')}
        >
          Armory
        </button>
        <button
          style={{
            padding: '8px 16px',
            border: 'none',
            borderBottom: tab === 'talentbuilder' ? '2px solid #007bff' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontWeight: tab === 'talentbuilder' ? 'bold' : 'normal',
            color: textColor,
          }}
          onClick={() => setTab('talentbuilder')}
        >
          Talent Builder
        </button>
        {gmLevel > 0 && (
          <button
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: tab === 'talenteditor' ? '2px solid #007bff' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === 'talenteditor' ? 'bold' : 'normal',
              color: textColor,
            }}
            onClick={() => setTab('talenteditor')}
          >
            Talent Editor
          </button>
        )}
        {gmLevel > 0 && (
          <button
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: tab === 'spellicon' ? '2px solid #007bff' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === 'spellicon' ? 'bold' : 'normal',
              color: textColor,
            }}
            onClick={() => setTab('spellicon')}
          >
            Spell Icon Editor
          </button>
        )}
        {gmLevel > 0 && (
          <button
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: tab === 'serverstarter' ? '2px solid #007bff' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === 'serverstarter' ? 'bold' : 'normal',
              color: textColor,
            }}
            onClick={() => setTab('serverstarter')}
          >
            Server Starter
          </button>
        )}
        {gmLevel > 0 && (
          <button
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: tab === 'accountcontrol' ? '2px solid #007bff' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === 'accountcontrol' ? 'bold' : 'normal',
              color: textColor,
            }}
            onClick={() => setTab('accountcontrol')}
          >
            Account Control
          </button>
        )}
        {gmLevel > 0 && (
          <button
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: tab === 'settings' ? '2px solid #007bff' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === 'settings' ? 'bold' : 'normal',
              color: textColor,
            }}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
        )}
        <button
          style={{
            marginLeft: 'auto',
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: '#c00',
          }}
          onClick={onLogout}
        >
          Logout
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ padding: '16px 24px' }}>
        {tab === 'armory' && (
          gmLevel > 0 ? (
            <div style={{ padding: 12, color: '#999' }}>
              Armory coming soon. Enabled for admins.
            </div>
          ) : (
            <div style={{ padding: 12, color: '#999' }}>
              Armory coming soon. Contact admin to enable.
            </div>
          )
        )}
        {tab === 'talentbuilder' && <TalentBuilder />}
        {tab === 'talenteditor' && (
          gmLevel > 0 ? (
            <TalentEditor />
          ) : (
            <div style={{ padding: 12, color: '#999' }}>
              You don't have permission to edit talent trees. Contact admin.
            </div>
          )
        )}
        {tab === 'spellicon' && (
          gmLevel > 0 ? (
            <SpellIconEditor />
          ) : (
            <div style={{ padding: 12, color: '#999' }}>
              You don't have permission to edit spell icons. Contact admin.
            </div>
          )
        )}
        {tab === 'serverstarter' && (
          <ServerStarter token={token} baseUrl={starterBase} />
        )}
        {tab === 'accountcontrol' && (
          <AccountControl token={token} baseUrl={starterBase} />
        )}
        {tab === 'settings' && (
          gmLevel > 0 ? (
            <div style={{ maxWidth: 1200 }}>
              <h3>Server Settings</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
                {/* Left Column: Color Settings */}
                <div style={{ padding: 16, background: contentBoxColor, borderRadius: 8 }}>
                  <h4 style={{ marginTop: 0 }}>Appearance Settings</h4>
                  
                  {/* Background Color */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                      Background Color
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <input
                        type="color"
                        value={editingBackgroundColor}
                        onChange={(e) => setEditingBackgroundColor(e.target.value)}
                        style={{ width: 60, height: 40, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}
                      />
                      <input
                        type="text"
                        value={editingBackgroundColor}
                        onChange={(e) => setEditingBackgroundColor(e.target.value)}
                        style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
                        placeholder="#ffffff"
                      />
                    </div>
                    <button
                      onClick={onSaveBackgroundColor}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 4,
                        border: 'none',
                        background: '#007bff',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Save
                    </button>
                  </div>

                  {/* Text Color */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                      Text Color
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <input
                        type="color"
                        value={editingTextColor}
                        onChange={(e) => setEditingTextColor(e.target.value)}
                        style={{ width: 60, height: 40, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}
                      />
                      <input
                        type="text"
                        value={editingTextColor}
                        onChange={(e) => setEditingTextColor(e.target.value)}
                        style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
                        placeholder="#000000"
                      />
                    </div>
                    <button
                      onClick={onSaveTextColor}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 4,
                        border: 'none',
                        background: '#007bff',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Save
                    </button>
                  </div>

                  {/* Content Box Color */}
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                      Content Box Color
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <input
                        type="color"
                        value={editingContentBoxColor}
                        onChange={(e) => setEditingContentBoxColor(e.target.value)}
                        style={{ width: 60, height: 40, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}
                      />
                      <input
                        type="text"
                        value={editingContentBoxColor}
                        onChange={(e) => setEditingContentBoxColor(e.target.value)}
                        style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
                        placeholder="#f9f9f9"
                      />
                    </div>
                    <button
                      onClick={onSaveContentBoxColor}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 4,
                        border: 'none',
                        background: '#007bff',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>

                {/* Right Column: Background Image and Page Icon */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                  {/* Background Image Upload */}
                  <div style={{ padding: 16, background: contentBoxColor, borderRadius: 8 }}>
                    <h4 style={{ marginTop: 0 }}>Background Image</h4>
                    {backgroundImage ? (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ marginBottom: 8, padding: 8, background: '#e8f5e9', borderRadius: 4, fontSize: 12 }}>
                          ✓ Image set
                        </div>
                        <button
                          onClick={onClearBackground}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 4,
                            border: 'none',
                            background: '#dc3545',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 12,
                            marginBottom: 8,
                            width: '100%',
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                        Upload image to override background color.
                      </p>
                    )}
                    <label
                      htmlFor="background-file-input"
                      style={{
                        display: 'block',
                        padding: '6px 12px',
                        background: '#007bff',
                        color: '#fff',
                        borderRadius: 4,
                        cursor: backgroundUploadBusy ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        opacity: backgroundUploadBusy ? 0.6 : 1,
                        textAlign: 'center',
                      }}
                    >
                      {backgroundUploadBusy ? 'Uploading...' : 'Upload Image'}
                    </label>
                    <input
                      id="background-file-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          onBackgroundImageUpload(e.target.files[0]);
                        }
                        e.target.value = '';
                      }}
                      style={{ display: 'none' }}
                      disabled={backgroundUploadBusy}
                    />
                  </div>

                  {/* Page Icon Upload */}
                  <div style={{ padding: 16, background: contentBoxColor, borderRadius: 8 }}>
                    <h4 style={{ marginTop: 0 }}>Page Icon</h4>
                    {pageIconError && (
                      <div style={{ padding: 8, background: '#fee', color: '#b91c1c', borderRadius: 4, marginBottom: 12, fontSize: 12 }}>
                        {pageIconError}
                      </div>
                    )}
                    {pageIcon ? (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ marginBottom: 8, padding: 8, background: '#e8f5e9', borderRadius: 4, fontSize: 12 }}>
                          ✓ Icon set
                        </div>
                        <button
                          onClick={onClearPageIcon}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 4,
                            border: 'none',
                            background: '#dc3545',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 12,
                            marginBottom: 8,
                            width: '100%',
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                        Recommended: 192x192 or 256x256 PNG/ICO formats work best.
                      </p>
                    )}
                    <label
                      htmlFor="page-icon-file-input"
                      style={{
                        display: 'block',
                        padding: '6px 12px',
                        background: '#007bff',
                        color: '#fff',
                        borderRadius: 4,
                        cursor: pageIconUploadBusy ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        opacity: pageIconUploadBusy ? 0.6 : 1,
                        textAlign: 'center',
                      }}
                    >
                      {pageIconUploadBusy ? 'Uploading...' : 'Upload Icon'}
                    </label>
                    <input
                      id="page-icon-file-input"
                      type="file"
                      accept="image/*,.ico"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          onPageIconUpload(e.target.files[0]);
                        }
                        e.target.value = '';
                      }}
                      style={{ display: 'none' }}
                      disabled={pageIconUploadBusy}
                    />
                  </div>
                </div>
              </div>

              {/* Login Title */}
              <div style={{ marginBottom: 24, padding: 16, background: contentBoxColor, borderRadius: 8 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                  Login Page Title
                </label>
                <input
                  type="text"
                  value={editingLoginTitle}
                  onChange={(e) => setEditingLoginTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    marginBottom: 12,
                    boxSizing: 'border-box',
                  }}
                  placeholder="e.g., Surrealabs Server Login"
                />
                <p style={{ fontSize: 12, color: '#666', margin: 0, marginBottom: 12 }}>
                  Currently: <strong>{loginTitle}</strong>
                </p>
                <button
                  onClick={onSaveLoginTitle}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: 'none',
                    background: '#007bff',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Save
                </button>
              </div>

              {/* Page Title */}
              <div style={{ marginBottom: 24, padding: 16, background: contentBoxColor, borderRadius: 8 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                  Page Title
                </label>
                <input
                  type="text"
                  value={editingPageTitle}
                  onChange={(e) => setEditingPageTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    marginBottom: 12,
                    boxSizing: 'border-box',
                  }}
                  placeholder="e.g., Surrealabs Server"
                />
                <p style={{ fontSize: 12, color: '#666', margin: 0, marginBottom: 12 }}>
                  Currently: <strong>{pageTitle}</strong>
                </p>
                <button
                  onClick={onSavePageTitle}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: 'none',
                    background: '#007bff',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 12, color: '#999' }}>
              Settings can only be accessed by admins.
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default App;
