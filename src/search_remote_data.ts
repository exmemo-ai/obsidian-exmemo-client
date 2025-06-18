import { MarkdownView, Notice, Plugin } from 'obsidian';
import { t } from "src/lang/helpers"
import { requestWithToken } from "src/utils";

export interface SearchResult {
    title: string;
    created_time: string;
    ctype: string;
    etype: string;
    addr: string;
    raw: string; 
}

export async function searchRemoteData(
    plugin: any,
    keyword: string, 
    startDate: string, 
    endDate: string, 
    folderPath: string = '', 
    caseSensitive: boolean = false,
    count: number = 100,
    ctype: string = '',
    etype: string = '',
    status: string = '',
    auto_login: boolean = true
): Promise<SearchResult[]> {
    if (!plugin) {
        throw new Error('ExMemo plugin not found');
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

    url.searchParams.append('max_count', count.toString());

    const requestOptions = {
        url: url.toString(),
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Token ' + plugin.settings.myToken
        }
    };

    try {
        const response = await requestWithToken(plugin, requestOptions, auto_login);
        const rawData = await response.json;
        return rawData.map((item: any) => ({
            title: item.title,
            created_time: item.created_time,
            ctype: item.ctype,
            etype: item.etype,
            addr: item.addr,
            raw: item.content ? item.content : item.raw
        }));
    } catch (err) {
        plugin.showNotice('search', t('searchFailed') + ': ' + err.status, { timeout: 3000 });
        console.error(err);
        return [];
    }
}

export async function writeSearchResultsToEditor(
    plugin: Plugin,
    data: SearchResult[],
    keyword: string
): Promise<void> {
    const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    if (!editor) return;

    editor.replaceSelection('\n');
    editor.replaceSelection(t('total') + ":" + data.length + '\n\n');

    for (const item of data) {
        let desc = '';
        if (item.etype == 'web') {
            desc = '* ' + JSON.stringify(item.title) + '\n'
                + '  ' + item.created_time + " " + item.ctype + "\n"
                + '  [' + JSON.stringify(item.title) + "](" + item.addr + ")\n\n";
        } else if (item.etype == 'record') {
            let content = item.raw.replace(/[\r\n]+/g, '\n');
            desc = '* ' + JSON.stringify(item.title) + "\n"
                + '  ' + item.created_time + " " + item.ctype + "\n"
                + "  " + content + "\n\n";
        } else if (item.etype == 'note') {
            desc = formatNoteResult(plugin, item, keyword);
        }
        editor.replaceSelection(desc);
    }
}

function formatNoteResult(plugin: Plugin, item: SearchResult, keyword: string): string {
    let addr = item.addr;
    let path = addr.split('/');
    let vault_name = path[0];
    let rel_path = path.slice(1).join('/');
    let current_vault = plugin.app.vault.getName();
    
    let desc = current_vault == vault_name
        ? `* [${item.title}](${rel_path})\n`
        : `* ${item.title}: ${addr}\n`;
    
    desc += `  ${item.created_time} ${item.ctype}\n`;

    if (item.raw) {
        let content = item.raw.replace(/[\r\n]+/g, '\n');
        let content_lines = content.split('\n');
        for (let line of content_lines) {
            if (line.indexOf(keyword) != -1) {
                desc += line.replace(keyword, `**${keyword}**`) + '\n';
                break;
            }
        }
    }

    return desc;
}

