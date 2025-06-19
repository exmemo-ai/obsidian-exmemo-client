export const CONTENT_LIMIT = 100;

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
    const paragraphs = content.split(/\n\s*\n|\n\s*\*/);
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
        const snippet = targetParagraph.substring(posInParagraph, posInParagraph + CONTENT_LIMIT);
        return snippet + (snippet.length < CONTENT_LIMIT ? "" : "...");
    }
    
    const snippetStart = sentenceStart;
    const snippet = content.substring(snippetStart, snippetStart + CONTENT_LIMIT);
    return snippet + (snippetStart + CONTENT_LIMIT < content.length ? "..." : "");
}

export function extractSnippet(content: string, keywords: string[], caseSensitive: boolean = false): string {
    if (!keywords || keywords.length === 0) return content.substring(0, CONTENT_LIMIT) + (content.length > CONTENT_LIMIT ? "..." : "");
    
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