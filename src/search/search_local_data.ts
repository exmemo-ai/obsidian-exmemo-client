import { App, TFile, getAllTags } from 'obsidian';
import { extractSnippet, CONTENT_LIMIT, BaseSearchResult, parseSearchInput } from 'src/search/search_data';

export interface LocalSearchResult extends BaseSearchResult {
    file: TFile;
    titleMatch?: number;
    keywordCount?: number;
    consecutiveKeywordScore?: number;
    fuzzyScore?: number;
}

function fuzzyMatch(text: string, pattern: string): { score: number; matchIndex: number } {
    if (!pattern) return { score: 0, matchIndex: -1 };
    
    text = text.toLowerCase();
    pattern = pattern.toLowerCase();
    
    const exactIndex = text.indexOf(pattern);
    if (exactIndex !== -1) {
        return { score: 1000, matchIndex: exactIndex };
    }
    
    let score = 0;
    let textIndex = 0;
    let patternIndex = 0;
    let matchIndex = -1;
    let consecutiveMatches = 0;
    
    while (textIndex < text.length && patternIndex < pattern.length) {
        if (text[textIndex] === pattern[patternIndex]) {
            if (matchIndex === -1) matchIndex = textIndex;
            score += 10 + consecutiveMatches * 5;
            consecutiveMatches++;
            patternIndex++;
        } else {
            consecutiveMatches = 0;
        }
        textIndex++;
    }
    
    if (patternIndex < pattern.length) {
        score = score * (patternIndex / pattern.length);
    }
    
    if (matchIndex !== -1) {
        score = score * (1 - matchIndex / text.length * 0.3);
    }
    
    return { score, matchIndex };
}

function shouldExcludeFile(filePath: string, excludeRules: string): boolean {
    if (!excludeRules || excludeRules.trim() === '') {
        return false;
    }
    
    const rules = excludeRules.split(',').map(rule => rule.trim()).filter(rule => rule !== '');    
    for (const rule of rules) {
        const regexPattern = rule
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
        
        const regex = new RegExp(`^${regexPattern}$`);
        
        // 检查完整路径是否匹配
        if (regex.test(filePath)) {
            return true;
        }
        
        // 检查路径的每个部分是否匹配
        const pathParts = filePath.split('/');
        for (const part of pathParts) {
            if (regex.test(part)) {
                return true;
            }
        }
        
        // 检查每个目录层级的相对路径是否匹配
        for (let i = 0; i < pathParts.length; i++) {
            const partialPath = pathParts.slice(i).join('/');
            if (regex.test(partialPath)) {
                return true;
            }
        }
    }
    
    return false;
}

export async function searchLocalData(
    app: App,
    keyword: string,
    startDate: string,
    endDate: string,
    folderPath: string = '',
    caseSensitive: boolean = false,
    count: number = 100,
    searchMethod: string = 'keywordOnly',
    searchExclude: string = ''
): Promise<LocalSearchResult[]> {
    const results: LocalSearchResult[] = [];
    const files = app.vault.getMarkdownFiles();
    const enableFuzzySearch = searchMethod === 'fuzzySearch';

    // Parse search input
    const parsedInput = parseSearchInput(keyword, searchMethod);
    const { searchType, searchValue, keywordArray } = parsedInput;

    if (keywordArray.length === 0) {
        return results;
    }
    //console.log('keywordArray', keywordArray, searchType)

    for (const file of files) {
        if (shouldExcludeFile(file.path, searchExclude)) {
            continue;
        }
        
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
            let matches = false;
            let fuzzyScore = 0;
            let content = '';
            let contentToSearch = '';
            let titleToSearch = file.basename;

            if (!caseSensitive) {
                titleToSearch = file.basename.toLowerCase();
            }

            switch (searchType) {
                case 'tag':
                    const tags = extractTags(file);
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
                    matches = titleToSearch.indexOf(fileValueToSearch) !== -1;
                    break;

                case 'keyword':
                default:
                    content = await app.vault.read(file);
                    contentToSearch = !caseSensitive ? content.toLowerCase() : content;
                    
                    if (enableFuzzySearch) {
                        let totalFuzzyScore = 0;
                        let hasMatch = false;
                        
                        for (const kw of keywordArray) {
                            const kwToSearch = !caseSensitive ? kw.toLowerCase() : kw;
                            
                            const exactInContent = contentToSearch.indexOf(kwToSearch) !== -1;
                            const exactInTitle = titleToSearch.indexOf(kwToSearch) !== -1;
                            
                            if (exactInContent || exactInTitle) {
                                hasMatch = true;
                                totalFuzzyScore += 1000;
                            } else {
                                const contentFuzzy = fuzzyMatch(contentToSearch, kwToSearch);
                                const titleFuzzy = fuzzyMatch(titleToSearch, kwToSearch);
                                
                                const maxScore = Math.max(contentFuzzy.score, titleFuzzy.score);
                                if (maxScore > 50) {
                                    hasMatch = true;
                                    totalFuzzyScore += maxScore;
                                }
                            }
                        }
                        
                        matches = hasMatch;
                        fuzzyScore = totalFuzzyScore / keywordArray.length; // 平均分数
                    } else {
                        matches = keywordArray.every(kw => {
                            const kwToSearch = !caseSensitive ? kw.toLowerCase() : kw;
                            const inContent = contentToSearch.indexOf(kwToSearch) !== -1;
                            const inTitle = titleToSearch.indexOf(kwToSearch) !== -1;
                            return inContent || inTitle;
                        });
                    }
                    break;
            }

            if (!matches) continue;

            let snippet = "";
            if (searchType === 'keyword') {
                snippet = extractSnippet(content, keywordArray, caseSensitive);
            }

            let keywordCount = 0;
            let consecutiveKeywordScore = 0;
            
            if (searchType === 'keyword') {
                keywordCount = keywordArray.reduce((count, kw) => {
                    const kwToSearch = !caseSensitive ? kw.toLowerCase() : kw;
                    const regex = new RegExp(kwToSearch, 'g');
                    const searchContent = contentToSearch || (!caseSensitive ? content.toLowerCase() : content);
                    return count + (searchContent.match(regex)?.length || 0);
                }, 0);

                consecutiveKeywordScore = keywordArray.reduce((score, kw, index) => {
                    if (index === 0) return score;
                    const prevKw = keywordArray[index - 1];
                    const prevKwToSearch = !caseSensitive ? prevKw.toLowerCase().replace(/\s+/g, '') : prevKw.replace(/\s+/g, '');
                    const kwToSearch = !caseSensitive ? kw.toLowerCase().replace(/\s+/g, '') : kw.replace(/\s+/g, '');
                    const consecutiveRegex = new RegExp(`${prevKwToSearch}\\s*${kwToSearch}|${prevKwToSearch}${kwToSearch}`, 'g');
                    const searchContent = contentToSearch || (!caseSensitive ? content.toLowerCase() : content);
                    return score + (searchContent.match(consecutiveRegex)?.length || 0);
                }, 0);
            }

            let titleMatch = 0;
            if (searchType === 'file' && matches) {
                titleMatch = 1;
            } else if (searchType === 'keyword') {
                const allKeywordsInTitle = keywordArray.every(kw => {
                    const kwToSearch = !caseSensitive ? kw.toLowerCase() : kw;
                    return titleToSearch.includes(kwToSearch);
                });
                titleMatch = allKeywordsInTitle ? 1 : 0;
            }

            results.push({
                title: file.basename,
                createdTime: createdTime,
                addr: file.path,
                etype: 'note',
                content: snippet,
                isRemote: false,
                idx: null,
                // others
                file: file,
                titleMatch,
                keywordCount,
                consecutiveKeywordScore,
                fuzzyScore: enableFuzzySearch ? fuzzyScore : undefined
            });
        }
        if (results.length >= count) {
            break;
        }
    }

    // Sort results based on priority
    results.sort((a, b) => {
        if (enableFuzzySearch && searchType === 'keyword') {
            const fuzzyScoreA = a.fuzzyScore || 0;
            const fuzzyScoreB = b.fuzzyScore || 0;
            if (fuzzyScoreB !== fuzzyScoreA) return fuzzyScoreB - fuzzyScoreA;
        }

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

export function extractTags(file: TFile): string[] {
    const cachedMetadata = this.app.metadataCache.getFileCache(file);
    if (cachedMetadata) {
        const tags = getAllTags(cachedMetadata);
        return tags ? tags : [];
    }
    return [];
}

