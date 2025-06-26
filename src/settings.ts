export interface SearchParams {
    count: number;
    lastUsed: number;
}

export interface ExMemoSettings {
	myUsername: string;
	myPassword: string;
	myToken: string;
	lastSyncTime: number;
	lastIndexTime: number;
	syncInterval: number;
	url: string;
	include: string;
	exclude: string;
	isRemoteSearch: boolean;
	lastSearchType: string;
	lastSearchMethod: string;
	localSearchHistory: Record<string, SearchParams>;
	advancedSearchVisible: boolean;
	searchOpenInModal: boolean;
	searchExclude: string;
}

export const DEFAULT_SETTINGS: ExMemoSettings = {
	myUsername: 'guest',
	myPassword: '123456',
	myToken: '',
	lastSyncTime: 0,
	lastIndexTime: 0,
	syncInterval: 0,
	url: 'http://localhost:8005',
	include: '',
	exclude: '',
	isRemoteSearch: false,
	lastSearchType: 'note',
	lastSearchMethod: 'keywordOnly',
	localSearchHistory: {},
	advancedSearchVisible: false,
	searchOpenInModal: false,
	searchExclude: '',
}

// Re-export the setting tab for convenience
export { ExMemoSettingTab } from './settings_tab';