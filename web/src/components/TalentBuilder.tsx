import React, { useState, useEffect, useMemo } from 'react';
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
  spellRanks?: number[];
  maxRank?: number;
  prereqTalents?: number[];
  prereqRanks?: number[];
  iconPath?: string | null;
  sprite?: SpriteInfo | null;
};

type Props = {
  textColor: string;
  contentBoxColor: string;
};

const TalentBuilder: React.FC<Props> = ({ textColor, contentBoxColor }) => {
  const [selectedClass, setSelectedClass] = useState<string>('warrior');
  const [specs, setSpecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabNames, setTabNames] = useState<{ [key: number]: string }>({});
  const [spriteIconSize, setSpriteIconSize] = useState(64);
  const [spriteIconsPerRow, setSpriteIconsPerRow] = useState(16);
  const [allocatedPoints, setAllocatedPoints] = useState<{ [talentId: number]: number }>({});
  const MAX_TALENT_POINTS = 51;

  // Fetch talent tab names from server on mount
  useEffect(() => {
    const fetchTabNames = async () => {
      try {
        const response = await fetch('/api/talent-tab-names');
        if (response.ok) {
          const data = await response.json();
          setTabNames(data.tabNames || {});
        }
      } catch (error) {
        console.error('Error fetching tab names:', error);
      }
    };
    fetchTabNames();
  }, []);

  // Fetch talent data when class changes
  useEffect(() => {
    let isMounted = true;

    const fetchTalents = async () => {
      setLoading(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`/api/talents/${selectedClass}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (isMounted && response.ok) {
          const data = await response.json();
          setSpecs(data.specs || []);
          if (data.spriteIconSize) setSpriteIconSize(data.spriteIconSize);
          if (data.spriteIconsPerRow) setSpriteIconsPerRow(data.spriteIconsPerRow);
        } else if (isMounted) {
          setSpecs([]);
        }
      } catch (error) {
        console.error('Error fetching talents:', error);
        if (isMounted) setSpecs([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTalents();

    return () => {
      isMounted = false;
    };
  }, [selectedClass]);

  // Reset points on class change
  useEffect(() => {
    setAllocatedPoints({});
  }, [selectedClass]);

  // Point allocation helpers
  const totalSpent = Object.values(allocatedPoints).reduce((sum, v) => sum + v, 0);
  const pointsInSpec = (tabId: number): number => {
    const spec = specs.find((s: any) => s.tabId === tabId);
    if (!spec) return 0;
    return (spec.talents || []).reduce((sum: number, t: Talent) => sum + (allocatedPoints[t.id] || 0), 0);
  };
  const canAllocate = (talent: Talent): boolean => {
    if (totalSpent >= MAX_TALENT_POINTS) return false;
    const current = allocatedPoints[talent.id] || 0;
    if (current >= (talent.maxRank || 1)) return false;
    // Row requirement: need 5 * row points in this spec
    const specPts = pointsInSpec(talent.tabId);
    if (specPts < talent.row * 5) return false;
    // Prereq check
    if (talent.prereqTalents) {
      for (let i = 0; i < talent.prereqTalents.length; i++) {
        const prereqId = talent.prereqTalents[i];
        if (prereqId && prereqId > 0) {
          const reqRanks = talent.prereqRanks?.[i] || 1;
          if ((allocatedPoints[prereqId] || 0) < reqRanks) return false;
        }
      }
    }
    return true;
  };
  const addPoint = (talent: Talent) => {
    if (!canAllocate(talent)) return;
    setAllocatedPoints(prev => ({ ...prev, [talent.id]: (prev[talent.id] || 0) + 1 }));
  };
  const removePoint = (talent: Talent) => {
    const current = allocatedPoints[talent.id] || 0;
    if (current <= 0) return;
    setAllocatedPoints(prev => ({ ...prev, [talent.id]: prev[talent.id] - 1 }));
  };
  const resetPoints = () => setAllocatedPoints({});

  const classes = [
    'warrior',
    'paladin',
    'hunter',
    'rogue',
    'priest',
    'death-knight',
    'shaman',
    'mage',
    'warlock',
    'druid',
  ];

  // Map tabId to spec name for each class
  const tabIdToSpecName: { [key: string]: { [key: number]: string } } = {
    warrior: { 161: 'Arms', 164: 'Fury', 163: 'Protection' },
    paladin: { 381: 'Holy', 382: 'Protection', 383: 'Retribution' },
    hunter: { 361: 'Beast Mastery', 362: 'Marksmanship', 363: 'Survival' },
    rogue: { 181: 'Assassination', 182: 'Combat', 183: 'Subtlety' },
    priest: { 201: 'Discipline', 202: 'Holy', 203: 'Shadow' },
    'death-knight': { 398: 'Blood', 399: 'Frost', 400: 'Unholy' },
    shaman: { 261: 'Elemental', 262: 'Enhancement', 263: 'Restoration' },
    mage: { 41: 'Arcane', 61: 'Fire', 81: 'Frost' },
    warlock: { 301: 'Affliction', 302: 'Demonology', 303: 'Destruction' },
    druid: { 281: 'Balance', 282: 'Feral', 283: 'Restoration' },
  };

  const getClassIcon = (className: string) => {
    const iconName = className === 'death-knight' ? 'deathknight' : className;
    return `/class-icons/icon-${iconName}.png`;
  };

  const talentTrees = [
    { name: 'Tree 1', id: 1 },
    { name: 'Tree 2', id: 2 },
    { name: 'Tree 3', id: 3 },
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

  const getSpecBackground = (className: string, specBg: string) => {
    return `http://${window.location.hostname}:3001/class-backgrounds/bg-${className}-${specBg}.jpg`;
  };

  return (
    <div style={{ padding: 12, color: textColor }}>
      <h2 style={{ textAlign: 'left', color: textColor }}>Talent Builder</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ margin: 0, opacity: 0.7 }}>
          {loading ? '⏳ Loading talent data...' : 'Left-click to add a point, right-click to remove.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 'bold', color: totalSpent >= MAX_TALENT_POINTS ? '#f44336' : '#4FC3F7' }}>
            {totalSpent} / {MAX_TALENT_POINTS}
          </span>
          <button
            onClick={resetPoints}
            disabled={totalSpent === 0}
            style={{
              padding: '4px 12px',
              background: totalSpent > 0 ? '#f44336' : '#555',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: totalSpent > 0 ? 'pointer' : 'not-allowed',
              fontSize: 12,
            }}
          >
            Reset
          </button>
        </div>
      </div>

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

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 16,
          background: contentBoxColor,
          color: textColor,
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16, textTransform: 'capitalize', color: textColor }}>
          {selectedClass.replace('-', ' ')} Talent Trees
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {specs.map((spec, idx) => {
            const specName = tabNames[spec.tabId] || `Tree ${idx + 1}`;
            const bgSpec = classSpecs[selectedClass]?.find(s => s.name === specName);
            return (
              <div 
                key={idx} 
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
              {/* Dark overlay for readability */}
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.6)',
                }}
              />
              {/* Content */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Spec Header */}
                <div style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                  <h4 
                    style={{ 
                      marginTop: 0, 
                      marginBottom: 0,
                      textAlign: 'center',
                      color: '#fff',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    }}
                  >
                    {specName || `Tree ${idx + 1}`}
                    <span style={{ fontSize: 12, fontWeight: 'normal', opacity: 0.7, marginLeft: 6 }}>
                      ({pointsInSpec(spec.tabId)})
                    </span>
                  </h4>
                </div>
                {/* Talent Grid */}
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                    {Array.from({ length: 44 }).map((_, idx) => {
                      const row = Math.floor(idx / 4);
                      const col = idx % 4;
                      const talent = spec.talents?.find(
                        (t: Talent) => t.row === row && t.column === col
                      );
                      const pts = talent ? (allocatedPoints[talent.id] || 0) : 0;
                      const maxR = talent?.maxRank || 1;
                      const canAdd = talent ? canAllocate(talent) : false;
                      const isMaxed = pts >= maxR;
                      const hasPoints = pts > 0;
                      
                      return (
                        <div
                          key={idx}
                          title={talent ? `#${talent.id} | Spell: ${talent.spellId} | ${pts}/${maxR} ranks${talent.spellRanks ? '\nRanks: ' + talent.spellRanks.filter((s: number) => s > 0).join(', ') : ''}` : undefined}
                          onClick={() => talent && addPoint(talent)}
                          onContextMenu={(e) => { e.preventDefault(); talent && removePoint(talent); }}
                          style={{
                            width: 40,
                            height: 40,
                            background: talent ? '#2a2a2a' : 'rgba(255,255,255,0.1)',
                            borderRadius: 4,
                            border: talent 
                              ? isMaxed
                                ? '2px solid #FFD700'
                                : hasPoints
                                  ? '2px solid #4CAF50'
                                  : canAdd
                                    ? '2px solid #666'
                                    : '2px solid #444'
                              : '1px solid rgba(255,255,255,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: talent ? (canAdd ? 'pointer' : 'default') : 'default',
                            transition: 'all 0.2s ease',
                            overflow: 'hidden',
                            position: 'relative',
                            opacity: talent ? (canAdd || hasPoints ? 1 : 0.5) : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (talent) {
                              (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)';
                              (e.currentTarget as HTMLElement).style.zIndex = '10';
                              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 12px rgba(76, 175, 80, 0.8)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (talent) {
                              (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                              (e.currentTarget as HTMLElement).style.zIndex = '1';
                              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                            }
                          }}
                        >
                          {talent && (
                            <>
                              <TalentIcon sprite={talent.sprite || null} size={36} spriteIconSize={spriteIconSize} spriteIconsPerRow={spriteIconsPerRow} />
                              {/* Rank badge */}
                              <div style={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                                background: 'rgba(0,0,0,0.85)',
                                color: isMaxed ? '#FFD700' : hasPoints ? '#4CAF50' : '#888',
                                fontSize: 9,
                                fontWeight: 'bold',
                                padding: '0 3px',
                                borderRadius: '3px 0 0 0',
                                lineHeight: '14px',
                              }}>
                                {pts}/{maxR}
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
    </div>
  );
};

export default TalentBuilder;
