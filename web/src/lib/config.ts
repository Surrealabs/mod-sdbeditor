export interface PathConfig {
  base: {
    dbc: string;
    icons: string;
    description: string;
  };
  custom: {
    dbc: string;
    icons: string;
    description: string;
  };
}

export interface AppSettings {
  activeDBCSource: 'base' | 'custom';
  activeIconSource: 'base' | 'custom';
  allowBaseModification: boolean;
  initialized: boolean;
}

export interface AppConfig {
  paths: PathConfig;
  settings: AppSettings;
}

let cachedConfig: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;
  
  try {
    const response = await fetch('/config.json');
    if (!response.ok) {
      throw new Error('Failed to load config');
    }
    cachedConfig = await response.json();
    
    // Check if initialization is needed
    if (cachedConfig && !cachedConfig.settings.initialized) {
      await initializeApp(cachedConfig);
    }
    
    return cachedConfig!;
  } catch (error) {
    console.error('Error loading config:', error);
    // Return default config
    return getDefaultConfig();
  }
}

export async function initializeApp(config: AppConfig): Promise<void> {
  try {
    // Mark as initialized
    config.settings.initialized = true;
    saveConfig(config);
    
    console.log('✓ Application initialized');
    console.log(`Setup instructions:`);
    console.log(`1. Copy base DBC files from /${config.paths.base.dbc}/ to /${config.paths.custom.dbc}/`);
    console.log(`2. Copy base icons from /${config.paths.base.icons}/ to /${config.paths.custom.icons}/`);
    console.log(`Custom folders will contain both base (backup) and new icons you create`);
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

function getDefaultConfig(): AppConfig {
  return {
    paths: {
      base: {
        dbc: 'DBC_335_wotlk',
        icons: 'INT_335_wotlk',
        description: 'Default WoW 3.3.5 WotLK files (read-only reference)',
      },
      custom: {
        dbc: 'custom_dbc',
        icons: 'custom_icon',
        description: 'Custom user-modified files for server integration',
      },
    },
    settings: {
      activeDBCSource: 'custom',
      activeIconSource: 'custom',
      allowBaseModification: false,
      initialized: false,
    },
  };
}

export function saveConfig(config: AppConfig): void {
  cachedConfig = config;
  localStorage.setItem('appConfig', JSON.stringify(config));
}

export function getActiveDBCPath(config: AppConfig): string {
  const source = config.settings.activeDBCSource;
  return `/${config.paths[source].dbc}`;
}

export function getActiveIconPath(config: AppConfig): string {
  const source = config.settings.activeIconSource;
  return `/${config.paths[source].icons}`;
}
