
import React, { useState } from 'react';
import './App.css';

import TalentEditor from './components/TalentEditor';
import SpellIconEditor from './components/SpellIconEditor';

function App() {
  const [tab, setTab] = useState<'talent' | 'spellicon'>('talent');

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #ccc', marginBottom: 16 }}>
        <button
          style={{
            padding: '8px 16px',
            border: 'none',
            borderBottom: tab === 'talent' ? '2px solid #007bff' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontWeight: tab === 'talent' ? 'bold' : 'normal',
          }}
          onClick={() => setTab('talent')}
        >
          Talent Editor
        </button>
        <button
          style={{
            padding: '8px 16px',
            border: 'none',
            borderBottom: tab === 'spellicon' ? '2px solid #007bff' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontWeight: tab === 'spellicon' ? 'bold' : 'normal',
          }}
          onClick={() => setTab('spellicon')}
        >
          Spell Icon Editor
        </button>
      </div>
      <div>
        {tab === 'talent' && <TalentEditor />}
        {tab === 'spellicon' && <SpellIconEditor />}
      </div>
    </div>
  );
}

export default App;
