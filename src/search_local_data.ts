import { App, TFile } from 'obsidian';
import { parseKeywords, extractSnippet, CONTENT_LIMIT } from 'src/search_data';

export interface LocalSearchResult {
    title: string;
    createdTime: string;
    addr: string;
    content: string;
    etype: string;
    isRemote: boolean;

    tags: string[];
    file: TFile;
    keywordIndex?: number;
    keywordLength?: number;
    titleMatch?: number;
    keywordCount?: number;
    consecutiveKeywordScore?: number;
}

export async function searchLocalData(
    app: App,
    keyword: string, 
    startDate: string, 
    endDate: string, 
    folderPath: string = '', 
    caseSensitive: boolean = false,
    count: number = 100
): Promise<LocalSearchResult[]> {
    const results: LocalSearchResult[] = [];
    const files = app.vault.getMarkdownFiles();
    
    // Parse search type
    let searchType: 'tag' | 'file' | 'keyword' = 'keyword';
    let searchValue = keyword;
    
    if (keyword.startsWith('tag:')) {
        searchType = 'tag';
        searchValue = keyword.substring(4).trim();
    } 
    else if (keyword.startsWith('file:')) {
        searchType = 'file';
        searchValue = keyword.substring(5).trim();
    }
    
    // Process keywords
    let keywordArray: string[] = [];
    if (searchType === 'keyword') {
        keywordArray = parseKeywords(searchValue);
    } else if (searchType === 'tag') {
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
    } else {
        keywordArray = [searchValue];
    }

    //console.log('keywordArray', keywordArray)
    
    for (const file of files) {
        if (folderPath && !file.path.startsWith(folderPath + '/') && file.path !== folderPath) {
            continue;
        }
        
        const stat = await app.vault.adapter.stat(file.path);
        if (!stat) continue;
        const createdTime = new Date(stat.ctime).toISOString().split('T')[0];
        const matchesDateRange = (!startDate || new Date(createdTime) >= new Date(startDate)) &&
                                 (!endDate || new Date(createdTime) <= new Date(endDate));
        if (!matchesDateRange) continue;
        
        if (keyword) {
            const content = await app.vault.read(file);
            
            let matches = false;
            let keywordIndex = -1;
            let titleIndex = -1;
            let contentToSearch = content;
            let titleToSearch = file.basename;
            
            if (!caseSensitive) {
                contentToSearch = content.toLowerCase();
                titleToSearch = file.basename.toLowerCase();
            }
            
            switch (searchType) {
                case 'tag':
                    const tags = extractTags(content);
                    matches = keywordArray.every(tagToFind => {
                        const normalizedTagToFind = !caseSensitive ? tagToFind.toLowerCase() : tagToFind;
                        return tags.some(tag => {
                            const currentTag = !caseSensitive ? tag.toLowerCase() : tag;
                            return currentTag === normalizedTagToFind || currentTag.includes(normalizedTagToFind);
                        });
                    });
                    break;
                    
                case 'file':
                    const fileValueToSearch = !caseSensitive ? searchValue.toLowerCase() : searchValue;
                    titleIndex = titleToSearch.indexOf(fileValueToSearch);
                    matches = titleIndex !== -1;
                    break;
                    
                case 'keyword':
                default:
                    matches = keywordArray.every(kw => {
                        const kwToSearch = !caseSensitive ? kw.toLowerCase() : kw;
                        const inContent = contentToSearch.indexOf(kwToSearch) !== -1;
                        const inTitle = titleToSearch.indexOf(kwToSearch) !== -1;
                        return inContent || inTitle;
                    });
                    
                    if (matches && keywordArray.length > 0) {
                        const firstKw = !caseSensitive ? keywordArray[0].toLowerCase() : keywordArray[0];
                        keywordIndex = contentToSearch.indexOf(firstKw);
                    }
                    break;
            }
            
            if (!matches) continue;
            
            // Extract appropriate snippet
            let snippet = "";
            if (searchType === 'tag' || searchType === 'file') {
                snippet = content.substring(0, CONTENT_LIMIT) + (content.length > CONTENT_LIMIT ? "..." : "");
            } else {
                snippet = extractSnippet(content, keywordArray, caseSensitive);
            }
            
            const keywordCount = keywordArray.reduce((count, kw) => {
                const kwToSearch = !caseSensitive ? kw.toLowerCase() : kw;
                const regex = new RegExp(kwToSearch, 'g');
                return count + (contentToSearch.match(regex)?.length || 0);
            }, 0);

            const consecutiveKeywordScore = keywordArray.reduce((score, kw, index) => {
                if (index === 0) return score;
                const prevKw = keywordArray[index - 1];
                const prevKwToSearch = !caseSensitive ? prevKw.toLowerCase().replace(/\s+/g, '') : prevKw.replace(/\s+/g, '');
                const kwToSearch = !caseSensitive ? kw.toLowerCase().replace(/\s+/g, '') : kw.replace(/\s+/g, '');
                const consecutiveRegex = new RegExp(`${prevKwToSearch}\\s*${kwToSearch}|${prevKwToSearch}${kwToSearch}`, 'g');
                return score + (contentToSearch.match(consecutiveRegex)?.length || 0);
            }, 0);

            results.push({
                title: file.basename,
                createdTime: createdTime,
                addr: file.path,
                etype: 'note',
                content: snippet,
                isRemote: false,
                // others
                tags: extractTags(content),
                file: file,
                keywordIndex: keywordIndex === -1 ? undefined : keywordIndex,
                keywordLength: keywordArray.length > 0 ? keywordArray[0].length : 0,
                titleMatch: titleToSearch.includes(keywordArray[0]) ? 1 : 0,
                keywordCount,
                consecutiveKeywordScore
            });

            if ((searchType === 'tag' || searchType === 'file') && results.length >= count) {
                break; // Limit results to 'count'
            }
        } else {
            const content = await app.vault.read(file);
            results.push({
                title: file.basename,
                createdTime: createdTime,
                addr: file.path,
                etype: 'note',
                content: content.substring(0, CONTENT_LIMIT) + (content.length > CONTENT_LIMIT ? "..." : ""),
                isRemote: false,
                // others
                tags: extractTags(content),
                file: file,
            });

            if (results.length >= count) {
                break; // Limit results to 'count'
            }
        }
    }

    // Sort results based on priority
    results.sort((a, b) => {
        const titleMatchA = a.titleMatch || 0;
        const titleMatchB = b.titleMatch || 0;
        if (titleMatchB !== titleMatchA) return titleMatchB - titleMatchA;
                
        const consecutiveScoreA = a.consecutiveKeywordScore || 0;
        const consecutiveScoreB = b.consecutiveKeywordScore || 0;
        if (consecutiveScoreB !== consecutiveScoreA) return consecutiveScoreB - consecutiveScoreA;

        const keywordCountA = a.keywordCount || 0;
        const keywordCountB = b.keywordCount || 0;
        if (keywordCountB !== keywordCountA) return keywordCountB - keywordCountA;

        const timeA = new Date(a.createdTime).getTime();
        const timeB = new Date(b.createdTime).getTime();
        return timeB - timeA;
    });

    // Limit results to 'count'
    return results.slice(0, count);
}

export function extractTags(content: string): string[] {
    const tags: string[] = [];
    
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n\s*---/);
    if (frontmatterMatch && frontmatterMatch[1]) {
        const frontmatter = frontmatterMatch[1];
        
        const inlineArrayMatch = frontmatter.match(/tags\s*:\s*\[(.*?)\]/);
        if (inlineArrayMatch && inlineArrayMatch[1]) {
            const tagList = inlineArrayMatch[1].split(',').map(tag => tag.trim());
            for (const tag of tagList) {
                const cleanTag = tag.replace(/^['"]|['"]$/g, '');
                if (cleanTag) {
                    const formattedTag = cleanTag.startsWith('#') ? cleanTag : '#' + cleanTag;
                    tags.push(formattedTag);
                }
            }
        } else {
            const tagsSection = frontmatter.match(/tags\s*:\s*\n((?:\s+-.*\n?)+)/);
            if (tagsSection && tagsSection[1]) {
                const tagMatches = tagsSection[1].matchAll(/\s+-\s*([^\n]+)/g);
                for (const match of tagMatches) {
                    if (match[1]) {
                        const cleanTag = match[1].trim().replace(/^['"]|['"]$/g, '');
                        if (cleanTag) {
                            const formattedTag = cleanTag.startsWith('#') ? cleanTag : '#' + cleanTag;
                            tags.push(formattedTag);
                        }
                    }
                }
            }
        }
    }
    
    const tagRegex = /#[^\s#]+/g;
    const matches = content.match(tagRegex) || [];
    
    return [...new Set([...tags, ...matches])];
}

