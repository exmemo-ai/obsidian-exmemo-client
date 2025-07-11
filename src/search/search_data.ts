import { App, Editor, View } from 'obsidian';

export const CONTENT_LIMIT = 100;

export interface BaseSearchResult {
    title: string;
    createdTime: string;
    addr: string;
    content: string;
    etype: string;
    isRemote: boolean;
    idx: string | null;
}

export interface ParsedSearchInput {
    searchType: 'tag' | 'file' | 'keyword';
    searchValue: string;
    keywordArray: string[];
}

export function parseSearchInput(keyword: string): ParsedSearchInput {
    let searchType: 'tag' | 'file' | 'keyword' = 'keyword';
    let searchValue = keyword;
    let keywordArray: string[] = [];

    if (keyword.startsWith('tag:')) {
        searchType = 'tag';
        searchValue = keyword.substring(4).trim();
        
        const tagTerms = searchValue.split(/\s+/).filter(term => term.length > 0);
        for (const term of tagTerms) {
            const formattedTag = term.startsWith('#') ? term : '#' + term;
            keywordArray.push(formattedTag);
        }
        if (keywordArray.length === 0 && searchValue.trim()) {
            const tagValue = searchValue.trim();
            const formattedTag = tagValue.startsWith('#') ? tagValue : '#' + tagValue;
            keywordArray.push(formattedTag);
        }
    } else if (keyword.startsWith('file:')) {
        searchType = 'file';
        searchValue = keyword.substring(5).trim();
        keywordArray = [searchValue];
    } else {
        searchType = 'keyword';
        searchValue = keyword;
        keywordArray = parseKeywords(searchValue);
    }

    keywordArray = keywordArray.map(kw => kw.trim()).filter(kw => kw.length > 0);

    return {
        searchType,
        searchValue,
        keywordArray
    };
}

export function parseKeywords(searchValue: string): string[] {
    const keywordArray: string[] = [];
    // Match phrases in quotes and words outside quotes
    const regex = /"([^"]+)"|(\S+)/g;
    let match;
    while ((match = regex.exec(searchValue)) !== null) {
        const term = match[1] || match[2];
        if (term && term.trim()) {
            keywordArray.push(term.trim());
        }
    }
    return keywordArray;
}

function createSnippet(content: string, index: number, matchLength: number): string {
    const paragraphs = content.split('\n').filter(line => line.trim() !== '');
    let currentPos = 0;
    let targetParagraph = '';
    let paragraphStart = 0;
    
    for (const para of paragraphs) {
        const paraStart = content.indexOf(para, currentPos);
        const paraEnd = paraStart + para.length;
        
        if (paraStart <= index && index < paraEnd) {
            targetParagraph = para.trim();
            paragraphStart = paraStart;
            break;
        }
        currentPos = paraEnd;
    }
    
    if (!targetParagraph) {
        return content.substring(0, CONTENT_LIMIT) + (content.length > CONTENT_LIMIT ? "..." : "");
    }
    
    const posInParagraph = index - paragraphStart;
    if (posInParagraph + matchLength <= 50) {
        return targetParagraph.substring(0, CONTENT_LIMIT) + 
               (targetParagraph.length > CONTENT_LIMIT ? "..." : "");
    }
    
    //console.log(`Target paragraph: "${targetParagraph}" at index ${index}, posInParagraph: ${posInParagraph}, matchLength: ${matchLength}`);
    const sentenceMatches = [...targetParagraph.matchAll(/[^.!?。！？]+[.!?。！？]|[^.!?。！？]+$/g)];
    let targetSentence = '';
    let sentenceStart = 0;
    let sentencePosInParagraph = 0;
    
    for (const match of sentenceMatches) {
        if (!match.index) continue;
        const sentEnd = match.index + match[0].length;
        
        if (match.index <= posInParagraph && posInParagraph < sentEnd) {
            targetSentence = match[0].trim();
            sentencePosInParagraph = match.index;
            sentenceStart = paragraphStart + match.index;
            break;
        }
    }
    
    if (!targetSentence) {
        const maxLength = Math.min(CONTENT_LIMIT, targetParagraph.length - posInParagraph);
        const snippet = targetParagraph.substring(posInParagraph, posInParagraph + maxLength);
        return snippet + (posInParagraph + maxLength < targetParagraph.length ? "..." : "");
    }
    
    const snippetStart = sentencePosInParagraph;
    const maxLength = Math.min(CONTENT_LIMIT, targetParagraph.length - snippetStart);
    const snippet = targetParagraph.substring(snippetStart, snippetStart + maxLength);
    return snippet + (snippetStart + maxLength < targetParagraph.length ? "..." : "");
}

export function extractSnippet(content: string, keywords: string[], caseSensitive: boolean = false): string {
    if (!keywords || keywords.length === 0) 
        return content.substring(0, CONTENT_LIMIT) + (content.length > CONTENT_LIMIT ? "..." : "");
    if (!content || content.length === 0) return "";

    let contentToSearch = caseSensitive ? content : content.toLowerCase();
    // First try to find consecutive keywords match
    if (keywords.length > 1) {
        let bestConsecutiveMatchIndex = -1;
        
        for (let i = 0; i < keywords.length - 1; i++) {
            const prevKw = keywords[i];
            const nextKw = keywords[i + 1];
            const prevKwToSearch = caseSensitive ? prevKw.replace(/\s+/g, '') : prevKw.toLowerCase().replace(/\s+/g, '');
            const nextKwToSearch = caseSensitive ? nextKw.replace(/\s+/g, '') : nextKw.toLowerCase().replace(/\s+/g, '');
            
            const consecutiveRegex = new RegExp(`${prevKwToSearch}\\s*${nextKwToSearch}|${prevKwToSearch}${nextKwToSearch}`, 'g');
            const match = consecutiveRegex.exec(contentToSearch);
            
            if (match) {
                bestConsecutiveMatchIndex = match.index;
                break;
            }
        }
        
        // If we found a consecutive match, use that position
        if (bestConsecutiveMatchIndex !== -1) {
            const matchLength = Math.min(40, keywords.join(' ').length); // Estimate match length
            return createSnippet(content, bestConsecutiveMatchIndex, matchLength);
        }
    }
    
    // If no consecutive match found, fall back to first keyword
    const keywordToSearch = caseSensitive ? keywords[0] : keywords[0].toLowerCase();
    
    const index = contentToSearch.indexOf(keywordToSearch);
    if (index === -1) return "";
    
    return createSnippet(content, index, keywords[0].length);
}

export async function openNote(app : App, addr: string, keyword: string,  
            caseSensitive?: boolean) {
    await app.workspace.openLinkText(addr, '', false);
    await new Promise(resolve => setTimeout(resolve, 300));

    const searchValue = keyword; //this.keywordInputEl.value;
    const parsedInput = parseSearchInput(searchValue);
    const searchType = parsedInput.searchType;
    
    if (searchType === 'tag' || searchType === 'file') {
        return;
    }

    const view = app.workspace.getActiveViewOfType(View);
    if (view && 'editor' in view) {
        const editor = (view as any).editor as Editor;
        if (editor) {
            if (!searchValue) return;
            //console.log(`Searching for: ${searchValue}`);
            editor.focus();
            const keyword = searchValue;
            const content = editor.getValue();
            //
            //const caseSensitive = this.caseSensitiveChecked;
            const searchContent = caseSensitive ? content : content.toLowerCase();
            const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();
            const index = searchContent.indexOf(searchKeyword);
            if (index >= 0) {
                const startPos = editor.offsetToPos(index);
                const endPos = editor.offsetToPos(index + keyword.length);
                setTimeout(() => {
                    editor.setSelection(startPos, endPos);
                    const pos = editor.offsetToPos(index);
                    const betterPos = { line: pos.line - 5, ch: 0 };
                    editor.scrollIntoView({ from: betterPos, to: betterPos }, true);
                    //this.app.commands.executeCommandById("editor:open-search");
                }, 100);
            }
        }
    }
}
