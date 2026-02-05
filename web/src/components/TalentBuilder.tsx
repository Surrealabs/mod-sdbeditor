import React, { useState } from 'react';

const TalentBuilder: React.FC = () => {
  const [selectedClass, setSelectedClass] = useState<string>('warrior');

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

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ textAlign: 'left' }}>Talent Builder</h2>
      <p style={{ color: '#555', marginBottom: 12 }}>
        Build and preview talent trees for your character class.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 'bold' }}>Select Class:</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 8 }}>
          {classes.map((cls) => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              style={{
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ccc',
                background: selectedClass === cls ? '#007bff' : '#f5f5f5',
                color: selectedClass === cls ? '#fff' : '#000',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {cls}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 16,
          background: '#f9f9f9',
          minHeight: 400,
        }}
      >
        <h3 style={{ marginTop: 0, textTransform: 'capitalize' }}>
          {selectedClass} Talent Tree
        </h3>
        <p style={{ color: '#999' }}>Talent tree builder coming soon...</p>
        <p style={{ fontSize: 12, color: '#ccc' }}>
          This tool will allow you to preview and build custom talent specs for your character.
        </p>
      </div>
    </div>
  );
};

export default TalentBuilder;
