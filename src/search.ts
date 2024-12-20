import { App, Modal, requestUrl } from 'obsidian';
import { MarkdownView, Notice } from 'obsidian';
import { t } from "src/lang/helpers"


export async function getDataList(plugin: any, ctype: string, etype: string,
    status: string, keyword: string, maxCount = '', startDate = '', endDate = '', auto_login = true) {
    if (plugin.settings.myToken == '') {
        await plugin.getMyToken();
    }
    if (plugin.settings.myToken == '') {
        return;
    }

    const url = new URL(plugin.settings.url + '/api/entry/data/');
    if (ctype && ctype != '') {
        url.searchParams.append('ctype', ctype);
    }
    if (etype && etype != '') {
        url.searchParams.append('etype', etype);
    }
    if (status && status != '') {
        url.searchParams.append('status', status);
    }
    if (startDate && startDate != '') {
        url.searchParams.append('start_date', startDate);
    }
    if (endDate && endDate != '') {
        url.searchParams.append('end_date', endDate);
    }
    if (keyword && keyword != '') {
        url.searchParams.append('keyword', keyword);
        new Notice(t('search') + ': ' + keyword);
    }

    url.searchParams.append('max_count', maxCount);

    const requestOptions = {
        url: url.toString(),
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Token ' + plugin.settings.myToken
        }
    };

    try {
        const response = await requestUrl(requestOptions);
        if (response.status !== 200) {
            throw response;
        }
        const data = await response.json;
        if (data.results) {
            const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
            editor.replaceSelection('\n')
            editor.replaceSelection(t('total') + ":" + data.results.length + '\n\n');
            let desc = '';
            for (let i = 0; i < data.results.length; i++) {
                if (data.results[i].etype == 'web') {
                    desc = '* ' + JSON.stringify(data.results[i].title) + '\n'
                    desc = desc + '  ' + data.results[i].created_time + " " + data.results[i].ctype + "\n";
                    desc = desc + '  [' + JSON.stringify(data.results[i].title) + "](" + data.results[i].addr + ")\n\n";
                    editor.replaceSelection(desc);
                } else if (data.results[i].etype == 'record') {
                    let content = data.results[i].raw.replace(/[\r\n]+/g, '\n');
                    desc = '* ' + JSON.stringify(data.results[i].title) + "\n"
                    desc = desc + '  ' + data.results[i].created_time + " " + data.results[i].ctype + "\n";
                    desc = desc + "  " + content + "\n\n"
                    editor.replaceSelection(desc);
                } else if (data.results[i].etype == 'note') {
                    let addr = data.results[i].addr;
                    let path = addr.split('/');
                    let vault_name = path[0];
                    let rel_path = path.slice(1).join('/');
                    let current_vault = this.app.vault.getName()
                    if (current_vault == vault_name) {
                        desc = '* [' + data.results[i].title + '](' + rel_path + ')\n'
                    } else {
                        desc = '* ' + data.results[i].title + ': ' + addr + '\n'
                    }
                    desc = desc + '  ' + data.results[i].created_time + " " + data.results[i].ctype + "\n";
                    let content = data.results[i].raw
                    if (content) {
                        content = content.replace(/[\r\n]+/g, '\n');
                        let content_lines = content.split('\n');
                        for (let j = 0; j < content_lines.length; j++) {
                            if (content_lines[j].indexOf(keyword) != -1) {
                                let line = content_lines[j].replace(keyword, '**' + keyword + '**');
                                desc = desc + line + '\n';
                                break
                            }
                        }
                    }
                    if (data.results[i].content) {
                        data.results[i].content = data.results[i].content.replace(/[\r\n]+/g, '\n');
                        desc = desc + data.results[i].content + '\n';
                    }
                    editor.replaceSelection(desc);
                }
            }
        }
    } catch (err) {
        plugin.parseError(err, false);
        if (err.status === 401) {
            if (auto_login) {
                await getDataList(plugin, ctype, etype, status, keyword, maxCount, startDate, endDate, false);
            }
        } else {
            console.error(err);
        }
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