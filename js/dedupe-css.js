import fs from 'node:fs';

const css = fs.readFileSync('css/styles.css', 'utf8');

// Tokenize into top-level blocks with brace matching
// Each block is either an at-rule block (@media, @keyframes etc.) or a rule block.
const blocks = [];
let i = 0;
const n = css.length;

function skipWhitespaceAndComments(idx) {
    while (idx < n) {
        if (/\s/.test(css[idx])) { idx++; continue; }
        if (css[idx] === '/' && css[idx + 1] === '*') {
            idx += 2;
            while (idx < n && !(css[idx] === '*' && css[idx + 1] === '/')) idx++;
            idx += 2;
            continue;
        }
        break;
    }
    return idx;
}

while (i < n) {
    i = skipWhitespaceAndComments(i);
    if (i >= n) break;

    // Find the selector/at-rule up to the first '{'
    let depth = 0;
    let start = i;
    let selectorStart = i;
    let braceIdx = -1;
    // find first { 
    let j = i;
    while (j < n) {
        if (css[j] === '{') { braceIdx = j; break; }
        if (css[j] === '/' && css[j + 1] === '*') {
            j += 2;
            while (j < n && !(css[j] === '*' && css[j + 1] === '/')) j++;
            j += 2;
            continue;
        }
        j++;
    }
    if (braceIdx === -1) break;

    // Determine if this is an at-rule
    const selectorText = css.slice(selectorStart, braceIdx).trim();
    const isAtRule = selectorText.startsWith('@');

    // Find matching close brace
    depth = 1;
    let bodyStart = braceIdx + 1;
    j = braceIdx + 1;
    while (j < n && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        if (depth === 0) break;
        j++;
    }
    let bodyEnd = j; // index of closing brace
    let blockEnd = j + 1;

    blocks.push({
        selector: selectorText,
        isAtRule,
        body: css.slice(bodyStart, bodyEnd),
        start,
        end: blockEnd
    });

    i = blockEnd;
}

// Now process: for non-at-rule top-level blocks, merge duplicates by selector
// For at-rule blocks (especially @media), we leave them intact but can also dedupe inside
// To be safe, we only dedupe top-level non-at-rule blocks.

const merged = {}; // selector -> array of declaration strings (ordered, last wins)
const atRules = []; // {afterIndex, block}

blocks.forEach(b => {
    if (b.isAtRule) {
        // Keep at-rule blocks as-is, in order
        atRules.push(b);
    } else {
        const sel = b.selector.replace(/\s+/g, ' ');
        if (!merged[sel]) {
            merged[sel] = [];
        }
        // Parse declarations from body
        const body = b.body;
        // Split by ';' but careful for values - simple split is fine for CSS declarations
        const decls = body.split(';').map(s => s.trim()).filter(s => s.length > 0);
        decls.forEach(d => {
            // Remove existing declaration with same property if present
            const prop = d.split(':')[0].trim();
            const existingIdx = merged[sel].findIndex(x => x.split(':')[0].trim() === prop);
            if (existingIdx >= 0) {
                merged[sel][existingIdx] = d; // replace (last wins)
            } else {
                merged[sel].push(d);
            }
        });
    }
});

// Rebuild CSS
let out = '';

// We want to preserve original ordering as much as possible.
// Strategy: output blocks in their original order; when we encounter a selector for the
// first time, output its merged block; subsequent occurrences are skipped.
const emitted = new Set();
const atRuleSet = new Set();
// We'll iterate blocks in order
blocks.forEach(b => {
    if (b.isAtRule) {
        // Emit at-rule as-is
        out += b.selector + ' {' + b.body + '}\n\n';
    } else {
        const sel = b.selector.replace(/\s+/g, ' ');
        if (emitted.has(sel)) return; // skip duplicate
        emitted.add(sel);
        out += sel + ' {\n';
        merged[sel].forEach(d => {
            out += '  ' + d + ';\n';
        });
        out += '}\n\n';
    }
});

fs.writeFileSync('css/styles.css', out.trim() + '\n');
console.log('Done. Original blocks:', blocks.length, 'Unique selectors emitted:', emitted.size, 'At-rules:', atRules.length);