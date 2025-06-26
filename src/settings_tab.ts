import { PluginSettingTab, Setting, App } from 'obsidian';
import { t } from "src/lang/helpers"

export class ExMemoSettingTab extends PluginSettingTab {
	plugin;

	constructor(app: App, plugin: any) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.addServerSettings();
		this.addSyncSettings();
		this.addSearchSettings();
		this.addDonationSettings();
	}

	private addSyncSettings(): void {
		const syncContainer = this.containerEl.createEl('div');
		const collapseEl = syncContainer.createEl('details', { cls: 'setting-item-collapse' });
		collapseEl.createEl('summary', { text: t('syncSettings') });
		const descEl = collapseEl.createEl('div', { cls: 'setting-item-description' });
		descEl.setText(t('syncSettingsDesc'));

		new Setting(collapseEl)
			.setName(t('include_name'))
			.setDesc(t('include_desc'))
			.addText(text => text
				.setPlaceholder('dir1, dir2, ... default is all')
				.setValue(this.plugin.settings.include)
				.onChange(async (value) => {
					this.plugin.settings.include = value;
					await this.plugin.saveSettings();
				}));

		new Setting(collapseEl)
			.setName(t('exclude_name'))
			.setDesc(t('exclude_desc'))
			.addText(text => text
				.setPlaceholder('dir1, *_xxx.md default is null')
				.setValue(this.plugin.settings.exclude)
				.onChange(async (value) => {
					this.plugin.settings.exclude = value;
					await this.plugin.saveSettings();
				}));

		new Setting(collapseEl)
			.setName(t('auto_sync_interval'))
			.setDesc(t('auto_sync_interval_desc'))
			.addText(text => text
				.setPlaceholder('0')
				.setValue(this.plugin.settings.syncInterval.toString())
				.onChange(async (value) => {
					if (isNaN(parseInt(value))) {
						value = '0';
					}
					this.plugin.settings.syncInterval = parseInt(value);
					await this.plugin.saveSettings();
					this.plugin.resetSyncInterval();
				}));
	}

	private addSearchSettings(): void {
		const searchContainer = this.containerEl.createEl('div');
		const collapseEl = searchContainer.createEl('details', { cls: 'setting-item-collapse' });
		collapseEl.createEl('summary', { text: t('searchSettings') });
		const descEl = collapseEl.createEl('div', { cls: 'setting-item-description' });
		descEl.setText(t('searchSettingsDesc'));

		new Setting(collapseEl)
			.setName(t('searchOpenMode'))
			.setDesc(t('searchOpenModeDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.searchOpenInModal)
				.onChange(async (value) => {
					this.plugin.settings.searchOpenInModal = value;
					await this.plugin.saveSettings();
				}));

		new Setting(collapseEl)
			.setName(t('searchExclude'))
			.setDesc(t('searchExcludeDesc'))
			.addText(text => text
				.setPlaceholder('dir1, *_xxx.md default is null')
				.setValue(this.plugin.settings.searchExclude)
				.onChange(async (value) => {
					this.plugin.settings.searchExclude = value;
					await this.plugin.saveSettings();
				}));
	}

	private addServerSettings(): void {
		const serverContainer = this.containerEl.createEl('div');
		const collapseEl = serverContainer.createEl('details', { cls: 'setting-item-collapse' });
		collapseEl.createEl('summary', { text: t('serverSettings') });
		const descEl = collapseEl.createEl('div', { cls: 'setting-item-description' });
		
		const fragment = document.createDocumentFragment();
		const link = document.createElement('a');
		link.href = 'https://github.com/ExMemo/exmemo/';
		link.text = 'GitHub project: exmemo';
		fragment.append(t('service_desc1'));
		fragment.append(link);
		fragment.append(t('service_desc2'));
		descEl.appendChild(fragment);

		new Setting(collapseEl)
			.setName(t('serverAddress'))
			.setDesc(t('serverAddressDesc'))
			.addText(text => text
				.setPlaceholder('http://localhost:8005')
				.setValue(this.plugin.settings.url)
				.onChange(async (value) => {
					this.plugin.settings.url = value;
					this.plugin.settings.myToken = '';
					await this.plugin.saveSettings();
				}));

		new Setting(collapseEl)
			.setName(t('username'))
			.setDesc(t('username_desc'))
			.addText(text => text
				.setPlaceholder(t('username'))
				.setValue(this.plugin.settings.myUsername)
				.onChange(async (value) => {
					this.plugin.settings.myUsername = value;
					this.plugin.settings.myToken = '';
					await this.plugin.saveSettings();
				}));

		new Setting(collapseEl)
			.setName(t('password'))
			.addText(text => text
				.setPlaceholder(t('password'))
				.setValue(this.plugin.settings.myPassword)
				.onChange(async (value) => {
					this.plugin.settings.myPassword = value;
					this.plugin.settings.myToken = '';
					await this.plugin.saveSettings();
				}).inputEl.type = 'password');
	}

	private addDonationSettings(): void {
		const donationContainer = this.containerEl.createEl('div');
		const collapseEl = donationContainer.createEl('details', { cls: 'setting-item-collapse' });
		collapseEl.createEl('summary', { text: t('donate') });

		new Setting(collapseEl)
			.setName(t('supportThisPlugin'))
			.setDesc(t('supportThisPluginDesc'))
			.addButton((button) => {
				button.setButtonText(t('bugMeACoffee'))
					.setCta()
					.onClick(() => {
						window.open('https://buymeacoffee.com/xieyan0811y', '_blank');
					});
			});
	}
}
