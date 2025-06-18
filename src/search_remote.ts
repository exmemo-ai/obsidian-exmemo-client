import { App, Modal } from 'obsidian';
import { t } from "src/lang/helpers"
import { searchRemoteData, writeSearchResultsToEditor } from "src/search_remote_data";

export async function getDataList(plugin: any, ctype: string, etype: string,
    status: string, keyword: string, maxCount = '', startDate = '', endDate = '', auto_login = true) {
    const data = await searchRemoteData(
        plugin, 
        keyword,
        startDate,
        endDate,
        '',
        false,
        parseInt(maxCount) || 100,
        ctype,
        etype,
        status,
        auto_login
    );
    if (data) {
        await writeSearchResultsToEditor(plugin, data, keyword);
    }
}

export class SearchModal extends Modal {
    plugin: any;

    constructor(app: App, plugin: any) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        let { contentEl } = this;
        contentEl.createEl('h2').textContent = t('search');
        contentEl.createEl('label').textContent = t('searchKeyword') + ":";
        let inputEl = contentEl.createEl('input', {
            attr: {
                style: 'margin-left: 10px; margin-right: 10px;'
            }
        });
        inputEl.type = 'text';
        contentEl.createEl('br');
        contentEl.createEl('br');
        // 
        contentEl.createEl('label').textContent = t('etype') + ":";
        let selectEl = contentEl.createEl('select', {
            attr: {
                style: 'margin-left: 10px; margin-right: 10px;'
            }
        });
        selectEl.id = 'selectEl';
        let optionNoteEl = contentEl.createEl('option');
        optionNoteEl.value = 'note';
        optionNoteEl.textContent = t('note');
        selectEl.appendChild(optionNoteEl);
        let optionWebEl = contentEl.createEl('option');
        optionWebEl.value = 'web';
        optionWebEl.textContent = t('web');
        selectEl.appendChild(optionWebEl);
        let optionRecordEl = contentEl.createEl('option');
        optionRecordEl.value = 'record';
        optionRecordEl.textContent = t('record');
        selectEl.appendChild(optionRecordEl);
        contentEl.createEl('br');
        contentEl.createEl('br');
        //
        contentEl.createEl('label').textContent = t('item_count_max') + ":";
        let selectMaxCountEl = contentEl.createEl('select', {
            attr: {
                style: 'margin-left: 10px; margin-right: 10px;'
            }
        });
        selectMaxCountEl.id = 'selectMaxCountEl';
        let optionMaxCount10El = contentEl.createEl('option');
        optionMaxCount10El.value = '10';
        optionMaxCount10El.textContent = '10';
        selectMaxCountEl.appendChild(optionMaxCount10El);
        let optionMaxCount20El = contentEl.createEl('option');
        optionMaxCount20El.value = '20';
        optionMaxCount20El.textContent = '20';
        selectMaxCountEl.appendChild(optionMaxCount20El);
        let optionMaxCount50El = contentEl.createEl('option');
        optionMaxCount50El.value = '50';
        optionMaxCount50El.textContent = '50';
        selectMaxCountEl.appendChild(optionMaxCount50El);
        let optionMaxCount100El = contentEl.createEl('option');
        optionMaxCount100El.value = '100';
        optionMaxCount100El.textContent = '100';
        selectMaxCountEl.appendChild(optionMaxCount100El);
        contentEl.createEl('br');
        contentEl.createEl('br');
        //
        contentEl.createEl('label').textContent = t('range') + ":";
        let dateStartEl = contentEl.createEl('input', {
            attr: {
                style: 'margin-left: 10px; margin-right: 10px;'
            }
        });
        dateStartEl.type = 'date';
        dateStartEl.id = 'dateStartEl';
        contentEl.createEl('label').textContent = "-";
        let dateEndEl = contentEl.createEl('input', {
            attr: {
                style: 'margin-left: 10px; margin-right: 10px;'
            }
        });
        dateEndEl.type = 'date';
        dateEndEl.id = 'dateEndEl';
        //
        let buttonEl = contentEl.createEl('button');
        buttonEl.textContent = t('search');
        buttonEl.addEventListener('click', () => {
            getDataList(this.plugin, '', selectEl.value, '', inputEl.value, selectMaxCountEl.value, dateStartEl.value, dateEndEl.value);
            //searchData(this.plugin, inputEl.value);
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}