export function highlightElement(element: HTMLElement, keywordArray: string[], caseSensitive: boolean = false) {
    const validKeywords = keywordArray.filter(keyword => keyword && keyword.trim() !== '');
    if (!validKeywords.length) return;

    const textNodes: Text[] = [];
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    
    let node;
    while (node = walk.nextNode()) {
        textNodes.push(node as Text);
    }
    
    for (const textNode of textNodes) {
        const text = textNode.nodeValue || "";
        const parent = textNode.parentNode;
        
        if (!parent || text.trim() === "") continue;
        
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let matches: {index: number, length: number}[] = [];

        validKeywords.forEach(keyword => {
            const searchText = caseSensitive ? text : text.toLowerCase();
            const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();
            
            let index = 0;
            while ((index = searchText.indexOf(searchKeyword, index)) !== -1) {
                matches.push({
                    index,
                    length: keyword.length
                });
                index += keyword.length;
            }
        });

        matches = matches.sort((a, b) => a.index - b.index)
            .reduce((acc: typeof matches, curr) => {
                if (!acc.length) return [curr];
                
                const prev = acc[acc.length - 1];
                if (curr.index <= prev.index + prev.length) {
                    prev.length = Math.max(prev.length, curr.index + curr.length - prev.index);
                } else {
                    acc.push(curr);
                }
                return acc;
            }, []);

        matches.forEach(({index, length}) => {
            if (index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
            }
            
            const highlightSpan = document.createElement('span');
            highlightSpan.className = 'search-highlight';
            highlightSpan.textContent = text.substring(index, index + length);
            fragment.appendChild(highlightSpan);
            
            lastIndex = index + length;
        });
        
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }
        
        parent.replaceChild(fragment, textNode);
    }
}
