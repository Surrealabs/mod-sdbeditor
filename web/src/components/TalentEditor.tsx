import React, { useState, useEffect, useCallback } from 'react';
import TalentIcon from './TalentIcon';

type SpriteInfo = {
  sheet: string;
  x: number;
  y: number;
};

type Talent = {
  id: number;
  tabId: number;
  row: number;
  column: number;
  spellId: number;
  spellRanks: number[];
  maxRank: number;
  prereqTalents: number[];
  prereqRanks: number[];
  flags: number;
  requiredSpellId: number;
  petFlags: number[];
  iconPath?: string | null;
  sprite?: SpriteInfo | null;
};

type Props = {
  textColor: string;
  contentBoxColor: string;
};

const TalentEditor: React.FC<Props> = ({ textColor, contentBoxColor }) => {
  const [selectedClass, setSelectedClass] = useState<string>('warrior');
  const [specs, setSpecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tabNames, setTabNames] = useState<{ [key: number]: string }>({});
  const [spriteIconSize, setSpriteIconSize] = useState(64);
  const [spriteIconsPerRow, setSpriteIconsPerRow] = useState(16);
  const [selectedTalent, setSelectedTalent] = useState<Talent | null>(null);
  const [editedTalents, setEditedTalents] = useState<Map<number, Talent>>(new Map());
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [regenerating, setRegenerating] = useState(false);
  const [maxTalentPoints, setMaxTalentPoints] = useState(51);
  const [pendingNewTalent, setPendingNewTalent] = useState<{ tabId: number; row: number; column: number } | null>(null);
  const [addingTalent, setAddingTalent] = useState(false);
  const [applyingTalent, setApplyingTalent] = useState(false);
  const [deletingTalent, setDeletingTalent] = useState(false);
  const [spellIconIndex, setSpellIconIndex] = useState<Record<string, string>>({});

  // Load spell-icon index once (spellId → iconBaseName)
  useEffect(() => {
    fetch('/api/spell-icon-index?full=true')
      .then(r => r.ok ? r.json() : { index: {} })
      .then(data => {
        if (data.index) setSpellIconIndex(data.index);
      })
      .catch(() => {});
  }, []);

  // Helper: get thumbnail URL for a spell ID
  const getSpellIconUrl = (spellId: number): string | null => {
    if (!spellId) return null;
    const iconName = spellIconIndex[spellId];
    if (!iconName) return null;
    return `/thumbnails/${iconName}.png`;
  };

  const classes = [
    'warrior', 'paladin', 'hunter', 'rogue', 'priest',
    'death-knight', 'shaman', 'mage', 'warlock', 'druid',
  ];

  const classSpecs: { [key: string]: { name: string; bg: string }[] } = {
    warrior: [
      { name: 'Arms', bg: 'arms' },
      { name: 'Fury', bg: 'fury' },
      { name: 'Protection', bg: 'protection' },
    ],
    paladin: [
      { name: 'Holy', bg: 'holy' },
      { name: 'Protection', bg: 'protection' },
      { name: 'Retribution', bg: 'retribution' },
    ],
    hunter: [
      { name: 'Beast Mastery', bg: 'beastmastery' },
      { name: 'Marksmanship', bg: 'marksmanship' },
      { name: 'Survival', bg: 'survival' },
    ],
    rogue: [
      { name: 'Assassination', bg: 'assassination' },
      { name: 'Combat', bg: 'combat' },
      { name: 'Subtlety', bg: 'subtlety' },
    ],
    priest: [
      { name: 'Discipline', bg: 'discipline' },
      { name: 'Holy', bg: 'holy' },
      { name: 'Shadow', bg: 'shadow' },
    ],
    'death-knight': [
      { name: 'Blood', bg: 'blood' },
      { name: 'Frost', bg: 'frost' },
      { name: 'Unholy', bg: 'unholy' },
    ],
    shaman: [
      { name: 'Elemental', bg: 'elemental' },
      { name: 'Enhancement', bg: 'enhancement' },
      { name: 'Restoration', bg: 'restoration' },
    ],
    mage: [
      { name: 'Arcane', bg: 'arcane' },
      { name: 'Fire', bg: 'fire' },
      { name: 'Frost', bg: 'frost' },
    ],
    warlock: [
      { name: 'Affliction', bg: 'affliction' },
      { name: 'Demonology', bg: 'demonology' },
      { name: 'Destruction', bg: 'destruction' },
    ],
    druid: [
      { name: 'Balance', bg: 'balance' },
      { name: 'Feral', bg: 'feral' },
      { name: 'Restoration', bg: 'restoration' },
    ],
  };

  const getClassIcon = (className: string) => {
    const iconName = className === 'death-knight' ? 'deathknight' : className;
    return `/class-icons/icon-${iconName}.png`;
  };

  const getSpecBackground = (className: string, specBg: string) => {
    return `http://${window.location.hostname}:3001/class-backgrounds/bg-${className}-${specBg}.jpg`;
  };

  // Fetch tab names once
  useEffect(() => {
    fetch('/api/talent-tab-names')
      .then(r => r.ok ? r.json() : { tabNames: {} })
      .then(data => setTabNames(data.tabNames || {}))
      .catch(() => {});
  }, []);

  // Fetch talents when class changes
  const fetchTalents = useCallback(async () => {
    setLoading(true);
    setSelectedTalent(null);
    try {
      const response = await fetch(`/api/talents/${selectedClass}`);
      if (response.ok) {
        const data = await response.json();
        setSpecs(data.specs || []);
        if (data.spriteIconSize) setSpriteIconSize(data.spriteIconSize);
        if (data.spriteIconsPerRow) setSpriteIconsPerRow(data.spriteIconsPerRow);
      } else {
        setSpecs([]);
      }
    } catch {
      setSpecs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedClass]);

  useEffect(() => {
    setEditedTalents(new Map());
    fetchTalents();
  }, [selectedClass, fetchTalents]);

  // Get talent (edited version if exists, otherwise original)
  const getTalent = (talent: Talent): Talent => {
    return editedTalents.get(talent.id) || talent;
  };

  // Update a talent field
  const updateTalent = (talent: Talent, field: string, value: any) => {
    const updated = { ...getTalent(talent), [field]: value };
    if (talent.id !== -1) {
      const newMap = new Map(editedTalents);
      newMap.set(talent.id, updated);
      setEditedTalents(newMap);
    }
    setSelectedTalent(updated);
  };

  // Update a spell rank
  const updateSpellRank = (talent: Talent, rankIdx: number, value: number) => {
    const current = getTalent(talent);
    const newRanks = [...(current.spellRanks || [0, 0, 0, 0, 0, 0, 0, 0, 0])];
    while (newRanks.length < 9) newRanks.push(0);
    newRanks[rankIdx] = value;
    const maxRank = newRanks.filter(r => r !== 0).length;
    const updated = { ...current, spellRanks: newRanks, maxRank, spellId: newRanks[0] };
    if (talent.id !== -1) {
      const newMap = new Map(editedTalents);
      newMap.set(talent.id, updated);
      setEditedTalents(newMap);
    }
    setSelectedTalent(updated);
  };

  // Update prereq
  const updatePrereq = (talent: Talent, idx: number, field: 'talent' | 'rank', value: number) => {
    const current = getTalent(talent);
    if (field === 'talent') {
      const newPrereqs = [...(current.prereqTalents || [0, 0, 0])];
      newPrereqs[idx] = value;
      updateTalent(talent, 'prereqTalents', newPrereqs);
    } else {
      const newRanks = [...(current.prereqRanks || [0, 0, 0])];
      newRanks[idx] = value;
      updateTalent(talent, 'prereqRanks', newRanks);
    }
  };

  // Save all modified talents to DBC
  const saveToDBC = async () => {
    if (editedTalents.size === 0) {
      setStatusMsg('No changes to save.');
      return;
    }

    setSaving(true);
    setStatusMsg('Saving...');
    try {
      const talents = Array.from(editedTalents.values());
      const response = await fetch('/api/talents/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ talents }),
      });
      const result = await response.json();
      if (result.success) {
        setStatusMsg(`Saved ${result.modified} talents to Talent.dbc`);
        setEditedTalents(new Map());
        // Refresh to show saved state
        await fetchTalents();
      } else {
        setStatusMsg(`Error: ${result.error}`);
      }
    } catch (err: any) {
      setStatusMsg(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Export DBC download
  const exportDBC = () => {
    window.open(`http://${window.location.hostname}:3001/api/talents/export`, '_blank');
  };

  // Regenerate sprite sheets
  const regenerateSprites = async () => {
    setRegenerating(true);
    setStatusMsg('Regenerating sprite sheets...');
    try {
      const response = await fetch('/api/sprites/regenerate', { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        setStatusMsg(`${result.message}. Reloading talents...`);
        // Force reload sprites by cache-busting
        await fetchTalents();
        setStatusMsg(`${result.message}. Done!`);
      } else {
        setStatusMsg(`Error: ${result.error}`);
      }
    } catch (err: any) {
      setStatusMsg(`Sprite regen failed: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  };

  // Get all talents across all specs for prereq dropdown
  const allTalents: Talent[] = specs.flatMap((s: any) => s.talents || []);

  const hasChanges = editedTalents.size > 0;

  // Open blank panel for a new talent at an empty slot
  const openNewTalentPanel = (tabId: number, row: number, column: number) => {
    const blank: Talent = {
      id: -1, // placeholder, server assigns real ID
      tabId,
      row,
      column,
      spellId: 0,
      spellRanks: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      maxRank: 0,
      prereqTalents: [0, 0, 0],
      prereqRanks: [0, 0, 0],
      flags: 0,
      requiredSpellId: 0,
      petFlags: [0, 0],
      sprite: null,
    };
    setPendingNewTalent({ tabId, row, column });
    setSelectedTalent(blank);
  };

  // Confirm adding the new talent to DBC
  const confirmAddTalent = async () => {
    if (!pendingNewTalent || !selectedTalent) return;
    setAddingTalent(true);
    setStatusMsg('Adding talent to DBC...');
    try {
      const response = await fetch('/api/talents/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabId: pendingNewTalent.tabId,
          row: pendingNewTalent.row,
          column: pendingNewTalent.column,
          spellId: selectedTalent.spellRanks?.[0] || 0,
          spellRanks: selectedTalent.spellRanks || [0,0,0,0,0,0,0,0,0],
          prereqTalents: selectedTalent.prereqTalents || [0,0,0],
          prereqRanks: selectedTalent.prereqRanks || [0,0,0],
          flags: selectedTalent.flags || 0,
          requiredSpellId: selectedTalent.requiredSpellId || 0,
          petFlags: selectedTalent.petFlags || [0,0],
        }),
      });
      const result = await response.json();
      if (result.success) {
        setStatusMsg(`Added talent #${result.id} at R${pendingNewTalent.row}C${pendingNewTalent.column}`);
        setPendingNewTalent(null);
        setSelectedTalent(null);
        await fetchTalents();
      } else {
        setStatusMsg(`Error: ${result.error}`);
      }
    } catch (err: any) {
      setStatusMsg(`Add failed: ${err.message}`);
    } finally {
      setAddingTalent(false);
    }
  };

  return (
    <div style={{ padding: 12, color: textColor }}>
      <h2 style={{ textAlign: 'left', color: textColor }}>Talent Editor (GM)</h2>
      <p style={{ marginBottom: 12, opacity: 0.7 }}>
        {loading ? '⏳ Loading...' : 'Click a talent to edit its properties. Changes are written directly to Talent.dbc.'}
      </p>

      {/* Class selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 'bold' }}>Select Class:</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginTop: 8 }}>
          {classes.map((cls) => (
            <div
              key={cls}
              onClick={() => setSelectedClass(cls)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <img
                src={getClassIcon(cls)}
                alt={cls}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 8,
                  boxShadow: selectedClass === cls
                    ? '0 0 16px 4px rgba(0, 123, 255, 0.8)'
                    : '0 2px 4px rgba(0,0,0,0.2)',
                  border: selectedClass === cls ? '2px solid #007bff' : '2px solid transparent',
                  transition: 'all 0.2s ease',
                }}
                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%23ccc"/%3E%3C/svg%3E'; }}
              />
              <span style={{
                fontSize: 12,
                textTransform: 'capitalize',
                color: textColor,
                fontWeight: selectedClass === cls ? 'bold' : 'normal',
              }}>
                {cls.replace('-', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={saveToDBC}
          disabled={saving || !hasChanges}
          style={{
            padding: '8px 16px',
            background: hasChanges ? '#4CAF50' : '#555',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: hasChanges ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
          }}
        >
          {saving ? '⏳ Saving...' : `💾 Save to DBC${hasChanges ? ` (${editedTalents.size})` : ''}`}
        </button>
        <button
          onClick={exportDBC}
          style={{
            padding: '8px 16px',
            background: '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          📥 Export Talent.dbc
        </button>
        <button
          onClick={regenerateSprites}
          disabled={regenerating}
          style={{
            padding: '8px 16px',
            background: regenerating ? '#555' : '#FF9800',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: regenerating ? 'not-allowed' : 'pointer',
          }}
        >
          {regenerating ? '⏳ Regenerating...' : '🔄 Reload Sprites'}
        </button>
        {statusMsg && (
          <span style={{ fontSize: 13, opacity: 0.8, color: statusMsg.startsWith('Error') || statusMsg.startsWith('Save failed') ? '#f44336' : '#4CAF50' }}>
            {statusMsg}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Max Talent Points:</label>
          <input
            type="number"
            value={maxTalentPoints}
            onChange={(e) => setMaxTalentPoints(Math.max(1, parseInt(e.target.value) || 51))}
            min={1}
            max={200}
            style={{ width: 55, padding: '4px 6px', fontSize: 12, background: '#1a1a2e', color: '#fff', border: '1px solid #444', borderRadius: 3 }}
          />
        </div>
      </div>

      {/* Main layout: trees + editor panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedTalent ? '1fr 320px' : '1fr', gap: 16 }}>
        {/* Talent Trees */}
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: 16,
            background: contentBoxColor,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, textTransform: 'capitalize', color: textColor }}>
              {selectedClass.replace('-', ' ')} Talent Trees
            </h3>
            <span style={{ fontSize: 11, opacity: 0.5 }}>
              Total talents: {allTalents.length} | Max points: {maxTalentPoints}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {specs.map((spec: any, specIdx: number) => {
              const specName = tabNames[spec.tabId] || `Tree ${specIdx + 1}`;
              const bgSpec = classSpecs[selectedClass]?.find(s => s.name === specName);
              return (
                <div
                  key={specIdx}
                  style={{
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid #ddd',
                    position: 'relative',
                    backgroundImage: bgSpec ? `url(${getSpecBackground(selectedClass === 'death-knight' ? 'deathknight' : selectedClass, bgSpec.bg)})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)' }} />
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                      <h4 style={{ margin: 0, textAlign: 'center', color: '#fff', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                        {specName}
                      </h4>
                    </div>
                    <div style={{ padding: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                        {Array.from({ length: 44 }).map((_, idx) => {
                          const row = Math.floor(idx / 4);
                          const col = idx % 4;
                          const rawTalent = spec.talents?.find(
                            (t: Talent) => t.row === row && t.column === col
                          );
                          const talent = rawTalent ? getTalent(rawTalent) : null;
                          const isEdited = talent && editedTalents.has(talent.id);
                          const isSelected = talent && selectedTalent?.id === talent.id;

                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                if (talent) {
                                  setPendingNewTalent(null);
                                  setSelectedTalent(getTalent(talent));
                                } else {
                                  openNewTalentPanel(spec.tabId, row, col);
                                }
                              }}
                              title={talent ? `ID: ${talent.id} | Spell: ${talent.spellId} | Ranks: ${talent.maxRank}${talent.iconPath ? ` | ${talent.iconPath}` : ''}` : `Row ${row}, Col ${col} — click to add talent`}
                              style={{
                                width: 40,
                                height: 40,
                                background: talent ? '#2a2a2a' : 'rgba(255,255,255,0.05)',
                                borderRadius: 4,
                                border: isSelected
                                  ? '2px solid #FFD700'
                                  : isEdited
                                    ? '2px solid #FF9800'
                                    : talent
                                      ? '2px solid #4CAF50'
                                      : '1px solid rgba(255,255,255,0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                overflow: 'hidden',
                                position: 'relative',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.15)';
                                e.currentTarget.style.zIndex = '10';
                                if (!talent) {
                                  e.currentTarget.style.borderColor = 'rgba(76,175,80,0.6)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.zIndex = '1';
                                if (!talent) {
                                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                                }
                              }}
                            >
                              {!talent && (
                                <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.2)', fontWeight: 'bold', userSelect: 'none' }}>+</span>
                              )}
                              {talent && (
                                <>
                                  <TalentIcon sprite={talent.sprite || null} size={36} spriteIconSize={spriteIconSize} spriteIconsPerRow={spriteIconsPerRow} />
                                  {/* Spell ID badge */}
                                  <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    background: 'rgba(0,0,0,0.85)',
                                    color: '#4FC3F7',
                                    fontSize: 7,
                                    fontWeight: 'bold',
                                    textAlign: 'center',
                                    lineHeight: '12px',
                                    letterSpacing: -0.3,
                                  }}>
                                    {talent.spellId}
                                  </div>
                                  {/* Rank badge */}
                                  <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    background: 'rgba(0,0,0,0.85)',
                                    color: talent.maxRank === 1 ? '#FFD700' : '#8BC34A',
                                    fontSize: 8,
                                    fontWeight: 'bold',
                                    padding: '0 2px',
                                    borderRadius: '0 0 0 3px',
                                    lineHeight: '12px',
                                  }}>
                                    {talent.maxRank}R
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor Panel */}
        {selectedTalent && (
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: 16,
              background: contentBoxColor,
              color: textColor,
              maxHeight: 'calc(100vh - 300px)',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>{pendingNewTalent ? 'Add New Talent' : 'Edit Talent'}</h4>
              <button
                onClick={() => { setSelectedTalent(null); setPendingNewTalent(null); }}
                style={{ background: 'none', border: 'none', color: textColor, cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            {/* Icon preview + spell info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
              {pendingNewTalent ? (
                (() => {
                  const newIconUrl = getSpellIconUrl(selectedTalent.spellRanks?.[0] || 0);
                  return newIconUrl ? (
                    <img src={newIconUrl} alt="" style={{
                      width: 48, height: 48, borderRadius: 4,
                      border: '2px solid #4CAF50',
                    }} />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: 4,
                      border: '2px dashed rgba(76,175,80,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24, color: 'rgba(255,255,255,0.3)',
                    }}>
                      +
                    </div>
                  );
                })()
              ) : (
                <div style={{ border: '2px solid #4CAF50', borderRadius: 4, overflow: 'hidden' }}>
                  <TalentIcon sprite={selectedTalent.sprite || null} size={48} spriteIconSize={spriteIconSize} spriteIconsPerRow={spriteIconsPerRow} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: 14, color: pendingNewTalent ? '#66BB6A' : '#4FC3F7' }}>
                  {pendingNewTalent ? 'New Talent' : `Talent #${selectedTalent.id}`}
                </div>
                <div style={{ fontSize: 12, color: '#FFD700', fontFamily: 'monospace' }}>
                  Spell: {selectedTalent.spellId || '(not set)'}
                </div>
                <div style={{ fontSize: 10, opacity: 0.6 }}>
                  Tab: {selectedTalent.tabId} | R{selectedTalent.row} C{selectedTalent.column} | {selectedTalent.maxRank} rank{selectedTalent.maxRank !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Spell Ranks Table */}
            <FieldGroup label={`Spell IDs by Rank (${selectedTalent.maxRank} ranks)`}>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '24px 40px 1fr', fontSize: 10, fontWeight: 'bold', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.1)', opacity: 0.6 }}>
                  <span></span>
                  <span>Rank</span>
                  <span>Spell ID</span>
                </div>
                {(selectedTalent.spellRanks || []).map((spellId: number, i: number) => {
                  if (spellId === 0 && i >= selectedTalent.maxRank) return null;
                  const iconUrl = getSpellIconUrl(spellId);
                  const iconName = spellId ? spellIconIndex[spellId] : null;
                  return (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '24px 40px 1fr', padding: '3px 6px', fontSize: 11,
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)',
                      alignItems: 'center',
                    }}>
                      <span>
                        {iconUrl ? (
                          <img src={iconUrl} alt="" title={iconName || ''} style={{ width: 18, height: 18, borderRadius: 2, verticalAlign: 'middle' }} />
                        ) : (
                          <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }} />
                        )}
                      </span>
                      <span style={{ color: '#8BC34A', fontWeight: 'bold' }}>{i + 1}</span>
                      <span style={{ fontFamily: 'monospace', color: spellId ? '#fff' : '#666' }} title={iconName || undefined}>{spellId || '—'}</span>
                    </div>
                  );
                })}
              </div>
            </FieldGroup>

            {/* Position */}
            <FieldGroup label="Position">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <NumberField label="Row" value={selectedTalent.row} onChange={(v) => updateTalent(selectedTalent, 'row', v)} min={0} max={10} />
                <NumberField label="Column" value={selectedTalent.column} onChange={(v) => updateTalent(selectedTalent, 'column', v)} min={0} max={3} />
              </div>
            </FieldGroup>

            {/* Edit Spell Ranks */}
            <FieldGroup label="Edit Spell Rank IDs">
              {Array.from({ length: Math.max(selectedTalent.maxRank + 1, 2) }).map((_, i) => {
                if (i >= 9) return null;
                const val = selectedTalent.spellRanks?.[i] || 0;
                const rankIconUrl = getSpellIconUrl(val);
                const rankIconName = val ? spellIconIndex[val] : null;
                const isValidSpell = val > 0 && !!rankIconName;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: '#8BC34A', fontWeight: 'bold', width: 14, textAlign: 'right' }}>{i + 1}.</span>
                    {rankIconUrl ? (
                      <img src={rankIconUrl} alt="" title={rankIconName || ''} style={{ width: 22, height: 22, borderRadius: 2, border: '1px solid #4CAF50', flexShrink: 0 }} />
                    ) : (
                      <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 2, background: 'rgba(255,255,255,0.08)', border: '1px solid #444', flexShrink: 0 }} />
                    )}
                    <input
                      type="number"
                      value={val}
                      onChange={(e) => updateSpellRank(selectedTalent, i, parseInt(e.target.value) || 0)}
                      min={0}
                      placeholder={val === 0 ? 'empty' : undefined}
                      style={{
                        flex: 1, padding: '3px 6px', fontSize: 12, fontFamily: 'monospace',
                        background: '#1a1a2e', color: val ? '#fff' : '#666',
                        border: isValidSpell ? '1px solid #4CAF50' : '1px solid #444',
                        borderRadius: 3,
                      }}
                      title={rankIconName ? `Icon: ${rankIconName}` : val ? 'Unknown spell ID' : ''}
                    />
                    {isValidSpell && (
                      <span style={{ color: '#4CAF50', fontSize: 12, flexShrink: 0 }} title={`Found: ${rankIconName}`}>✓</span>
                    )}
                    {val > 0 && !rankIconName && Object.keys(spellIconIndex).length > 0 && (
                      <span style={{ color: '#FF9800', fontSize: 12, flexShrink: 0 }} title="Spell ID not found in index">?</span>
                    )}
                  </div>
                );
              })}
              {selectedTalent.maxRank < 9 && (
                <button
                  onClick={() => updateSpellRank(selectedTalent, selectedTalent.maxRank, 0)}
                  style={{ fontSize: 11, background: 'none', border: '1px dashed rgba(255,255,255,0.3)', color: textColor, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', marginTop: 4 }}
                >
                  + Add Rank Slot
                </button>
              )}
            </FieldGroup>

            {/* Flags */}
            <FieldGroup label="Flags">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={(selectedTalent.flags & 1) === 1}
                  onChange={(e) => updateTalent(selectedTalent, 'flags', e.target.checked ? 1 : 0)}
                />
                Single-point talent (1 rank max)
              </label>
            </FieldGroup>

            {/* Prerequisites */}
            <FieldGroup label="Prerequisites">
              {[0, 1, 2].map(i => {
                const prereqId = selectedTalent.prereqTalents?.[i] || 0;
                const prereqRank = selectedTalent.prereqRanks?.[i] || 0;
                if (i > 0 && prereqId === 0 && (selectedTalent.prereqTalents?.[i-1] || 0) === 0) return null;
                return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>Prereq {i + 1}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 4 }}>
                      <select
                        value={prereqId}
                        onChange={(e) => updatePrereq(selectedTalent, i, 'talent', parseInt(e.target.value))}
                        style={{ fontSize: 11, padding: '3px 4px', background: '#1a1a2e', color: '#fff', border: '1px solid #444', borderRadius: 3 }}
                      >
                        <option value={0}>None</option>
                        {allTalents
                          .filter(t => t.id !== selectedTalent.id)
                          .map(t => (
                            <option key={t.id} value={t.id}>
                              #{t.id} R{t.row}C{t.column} spell:{t.spellId}
                            </option>
                          ))}
                      </select>
                      <NumberField label="Pts" value={prereqRank} onChange={(v) => updatePrereq(selectedTalent, i, 'rank', v)} min={0} max={5} inline />
                    </div>
                  </div>
                );
              })}
            </FieldGroup>

            {/* Required Spell */}
            <FieldGroup label="Required Spell">
              <NumberField label="Spell ID" value={selectedTalent.requiredSpellId || 0} onChange={(v) => updateTalent(selectedTalent, 'requiredSpellId', v)} min={0} />
            </FieldGroup>

            {/* Add Talent button (new talent mode) */}
            {pendingNewTalent && (
              <button
                onClick={confirmAddTalent}
                disabled={addingTalent || !(selectedTalent.spellRanks?.[0])}
                style={{
                  marginTop: 12, padding: '10px 16px',
                  background: (addingTalent || !(selectedTalent.spellRanks?.[0])) ? '#555' : '#4CAF50',
                  color: '#fff', border: 'none', borderRadius: 4,
                  cursor: (addingTalent || !(selectedTalent.spellRanks?.[0])) ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 'bold', width: '100%',
                  transition: 'background 0.2s',
                }}
              >
                {addingTalent ? '⏳ Adding...' : '➕ Add Talent'}
              </button>
            )}
            {pendingNewTalent && !(selectedTalent.spellRanks?.[0]) && (
              <div style={{ fontSize: 11, color: '#FF9800', marginTop: 4, textAlign: 'center' }}>
                Set at least Rank 1 Spell ID before adding
              </div>
            )}

            {/* Cancel (new talent mode) */}
            {pendingNewTalent && (
              <button
                onClick={() => { setSelectedTalent(null); setPendingNewTalent(null); }}
                disabled={addingTalent}
                style={{ marginTop: 6, padding: '6px 12px', background: 'transparent', color: '#f44336', border: '1px solid #f44336', borderRadius: 4, cursor: 'pointer', fontSize: 12, width: '100%' }}
              >
                Cancel
              </button>
            )}

            {/* Discard changes for this talent (edit mode only) */}
            {!pendingNewTalent && editedTalents.has(selectedTalent.id) && (
              <button
                onClick={() => {
                  const newMap = new Map(editedTalents);
                  newMap.delete(selectedTalent.id);
                  setEditedTalents(newMap);
                  // Revert to original from specs
                  const orig = allTalents.find(t => t.id === selectedTalent.id);
                  if (orig) setSelectedTalent(orig);
                  else setSelectedTalent(null);
                }}
                style={{ marginTop: 8, padding: '6px 12px', background: '#f44336', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, width: '100%' }}
              >
                ↩ Discard Changes for This Talent
              </button>
            )}

            {/* Apply Changes - save just this talent immediately */}
            {!pendingNewTalent && editedTalents.has(selectedTalent.id) && (
              <button
                onClick={async () => {
                  const talent = editedTalents.get(selectedTalent.id);
                  if (!talent) return;
                  setApplyingTalent(true);
                  setStatusMsg('Applying changes...');
                  try {
                    const response = await fetch('/api/talents/save', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ talents: [talent] }),
                    });
                    const result = await response.json();
                    if (result.success) {
                      setStatusMsg(`Applied changes to talent #${selectedTalent.id}`);
                      const newMap = new Map(editedTalents);
                      newMap.delete(selectedTalent.id);
                      setEditedTalents(newMap);
                      await fetchTalents();
                    } else {
                      setStatusMsg(`Error: ${result.error}`);
                    }
                  } catch (err: any) {
                    setStatusMsg(`Apply failed: ${err.message}`);
                  } finally {
                    setApplyingTalent(false);
                  }
                }}
                disabled={applyingTalent}
                style={{
                  marginTop: 6, padding: '10px 16px',
                  background: applyingTalent ? '#555' : '#4CAF50',
                  color: '#fff', border: 'none', borderRadius: 4,
                  cursor: applyingTalent ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 'bold', width: '100%',
                  transition: 'background 0.2s',
                }}
              >
                {applyingTalent ? '⏳ Applying...' : '✅ Apply Talent Changes'}
              </button>
            )}

            {/* Delete Talent */}
            {!pendingNewTalent && selectedTalent.id > 0 && (
              <button
                onClick={async () => {
                  if (!confirm(`Delete talent #${selectedTalent.id} (spell ${selectedTalent.spellId})? This removes it from Talent.dbc permanently.`)) return;
                  setDeletingTalent(true);
                  setStatusMsg('Deleting talent...');
                  try {
                    const response = await fetch('/api/talents/delete', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ talentId: selectedTalent.id }),
                    });
                    const result = await response.json();
                    if (result.success) {
                      setStatusMsg(`Deleted talent #${result.deletedId} (${result.remainingRecords} talents remain)`);
                      const newMap = new Map(editedTalents);
                      newMap.delete(selectedTalent.id);
                      setEditedTalents(newMap);
                      setSelectedTalent(null);
                      await fetchTalents();
                    } else {
                      setStatusMsg(`Error: ${result.error}`);
                    }
                  } catch (err: any) {
                    setStatusMsg(`Delete failed: ${err.message}`);
                  } finally {
                    setDeletingTalent(false);
                  }
                }}
                disabled={deletingTalent}
                style={{
                  marginTop: 6, padding: '8px 12px',
                  background: 'transparent',
                  color: deletingTalent ? '#888' : '#f44336',
                  border: '1px solid #f44336',
                  borderRadius: 4,
                  cursor: deletingTalent ? 'not-allowed' : 'pointer',
                  fontSize: 12, width: '100%',
                  transition: 'all 0.2s',
                }}
              >
                {deletingTalent ? '⏳ Deleting...' : '🗑️ Delete Talent'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper components
const FieldGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.6, marginBottom: 4, letterSpacing: 0.5 }}>
      {label}
    </div>
    {children}
  </div>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  inline?: boolean;
}> = ({ label, value, onChange, min, max, placeholder, inline }) => (
  <div style={{ display: 'flex', alignItems: inline ? 'center' : undefined, flexDirection: inline ? 'row' : 'column', gap: inline ? 4 : 2, marginBottom: inline ? 0 : 4 }}>
    <label style={{ fontSize: 11, opacity: 0.7 }}>{label}</label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      min={min}
      max={max}
      placeholder={placeholder}
      style={{
        width: inline ? 50 : '100%',
        padding: '3px 6px',
        fontSize: 12,
        background: '#1a1a2e',
        color: '#fff',
        border: '1px solid #444',
        borderRadius: 3,
      }}
    />
  </div>
);

export default TalentEditor;
