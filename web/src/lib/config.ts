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
    const fileConfig: AppConfig = await response.json();

    let storedSettings: AppSettings | null = null;
    const stored = localStorage.getItem('appConfig');
    if (stored) {
      try {
        storedSettings = (JSON.parse(stored) as AppConfig).settings || null;
      } catch (error) {
        console.warn('Failed to parse stored settings:', error);
      }
    }

    cachedConfig = {
      ...fileConfig,
      settings: {
        ...fileConfig.settings,
        ...(storedSettings || {}),
      },
    };
    
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
        dbc: 'dbc',
        icons: 'Icon',
        description: 'Default WoW 3.3.5 WotLK files (read-only reference)',
      },
      custom: {
        dbc: 'custom-dbc',
        icons: 'custom-icon',
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
  localStorage.setItem('appConfig', JSON.stringify({ settings: config.settings }));
}

export function getActiveDBCPath(config: AppConfig): string {
  return `/${config.paths.custom.dbc}`;
}

export function getActiveIconPath(config: AppConfig): string {
  return `/${config.paths.custom.icons}`;
}
