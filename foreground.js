console.log("DEBUG: URL MATCHED");

if (document.readyState !== 'loading') {
    console.log("DEBUG: DOM already loaded");
    setupInputListener();
} else {
    document.addEventListener('DOMContentLoaded', function () {
        console.log('DEBUG: DOM was not loaded yet');
        setupInputListener();
    });
}

function setupInputListener() {
    const textBox = document.getElementById('input');
    if (textBox) {
        textBox.addEventListener('input', handleInput);
        textBox.addEventListener('keydown', handleKeyDown);
    } else {
        console.log("Textfield with this ID not found");
    }
}

let lastValidChar = "";
let completions = [];
let tooltip;
let selectedIndex = 0; // Default to the first element

function handleInput(event) {
    const textBox = event.target;
    const inputValue = textBox.value;

    // Check if the last character is valid
    let lastChar = "";
    if (inputValue.length > 0) {
        for (let i = inputValue.length - 1; i >= 0; i--) {
            const char = inputValue.charAt(i);
            if (char !== " " && char !== "") {
                if (i === 0 || inputValue.charAt(i - 1) === " " || inputValue.charAt(i - 1) === ".") {
                    lastChar = char;
                    break;
                }
            }
        }
    }

    if (lastChar !== "" && lastChar !== " ") {
        lastValidChar = lastChar;
        console.log('Last valid character:', lastValidChar);
        chrome.runtime.sendMessage({ type: 'TEXT_BOX_UPDATED', lastChar: lastValidChar });
    } else {
        console.log('No valid last character to process.');
        hideCompletionPopup();
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'COMPLETION_RECEIVED' && request.completion) {
            completions = request.completion.split('\n');
            const sortedCompletions = sortCompletions(completions, request.lastChar);
            showCompletionPopup(textBox, sortedCompletions);
        }
    });
}

function handleKeyDown(event) {
    const textBox = event.target;
    if (tooltip && tooltip.style.display === 'block') {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveSelection(1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(-1);
        } else if (event.key === 'Tab') {
            event.preventDefault();
            selectCompletion();
        }
    }
}

function moveSelection(delta) {
    const items = tooltip.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    selectedIndex = (selectedIndex + delta + items.length) % items.length;
    items.forEach((item, index) => {
        if (index === selectedIndex) {
            item.classList.add('highlight');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('highlight');
        }
    });
}

function selectCompletion() {
    if (selectedIndex < 0 || selectedIndex >= completions.length) return;

    const textBox = document.getElementById('input');
    const currentValue = textBox.value;
    const selectedCompletion = completions[selectedIndex];
    const lastWord = currentValue.split(/[\s.]+/).pop().toLowerCase();
    const selectedCompletionLowerCase = selectedCompletion.toLowerCase();

    if (selectedCompletionLowerCase.startsWith(lastWord)) {
        const remainingText = selectedCompletion.slice(lastWord.length);
        textBox.value += remainingText;
    } else {
        textBox.value += selectedCompletion;
    }

    hideCompletionPopup();
}

function sortCompletions(completions, lastChar) {
    return completions.sort((a, b) => {
        const aStartsWith = a.toLowerCase().startsWith(lastChar.toLowerCase());
        const bStartsWith = b.toLowerCase().startsWith(lastChar.toLowerCase());
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return 0;
    });
}

function adjustTooltipWidth(tooltip, completions) {
    const span = document.createElement('span');
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'nowrap';
    span.style.position = 'absolute';
    span.style.font = getComputedStyle(document.body).font; // Get the font style of the body or any common element
    document.body.appendChild(span);

    let maxWidth = 0;

    completions.forEach(completion => {
        span.textContent = completion;
        const itemWidth = span.offsetWidth;
        if (itemWidth > maxWidth) {
            maxWidth = itemWidth;
        }
    });

    document.body.removeChild(span);

    // Add some extra space to ensure the text doesn't overflow
    tooltip.style.width = `${maxWidth + 20}px`;
}

function showCompletionPopup(textBox, completions) {
    const cursorPosition = textBox.selectionStart;
    const coords = getCaretCoordinates(textBox, cursorPosition);

    tooltip = document.getElementById('autocomplete-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'autocomplete-tooltip';
        document.body.appendChild(tooltip);
    }
    tooltip.innerHTML = '';
    selectedIndex = 0; // Default to the first element whenever the suggestions are shown

    completions.forEach((completion, index) => {
        const item = document.createElement('div');
        item.textContent = completion;
        item.classList.add('autocomplete-item');
        if (index === selectedIndex) {
            item.classList.add('highlight');
        }
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const currentValue = textBox.value;
            const lastWord = currentValue.split(/[\s.]+/).pop().toLowerCase(); // Get the last word after a space or a dot, in lower case
            const completionLowerCase = completion.toLowerCase();
            if (completionLowerCase.startsWith(lastWord)) {
                const remainingText = completion.slice(lastWord.length); // Only add the part that is not already typed
                textBox.value += remainingText;
            } else {
                textBox.value += completion; // Fallback: Add the whole completion if no match
            }
            hideCompletionPopup();
        });
        tooltip.appendChild(item);
    });

    adjustTooltipWidth(tooltip, completions);

    tooltip.style.left = `${coords.left}px`;
    tooltip.style.top = `${coords.top}px`; // Adjust the position as needed
    tooltip.style.display = 'block';

    // Highlight the first item by default
    const items = tooltip.querySelectorAll('.autocomplete-item');
    if (items.length > 0) {
        items[0].classList.add('highlight');
    }
}

function hideCompletionPopup() {
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

function getCaretCoordinates(element, position) {
    const div = document.createElement('div');
    const style = getComputedStyle(element);
    Array.from(style).forEach(prop => {
        div.style[prop] = style[prop];
    });

    const textContent = element.value.substr(0, position);
    div.textContent = textContent;

    if (element.nodeName === 'INPUT') {
        div.textContent = div.textContent.replace(/\s/g, '\u00a0');
    }

    const span = document.createElement('span');
    span.textContent = element.value.substr(position) || '.';
    div.appendChild(span);

    document.body.appendChild(div);
    const coordinates = span.getBoundingClientRect();
    document.body.removeChild(div);

    return {
        top: coordinates.top + window.scrollY,
        left: coordinates.left + window.scrollX
    };
}

const style = document.createElement('style');
style.innerHTML = `
    .autocomplete-item {
        padding: 5px;
        cursor: pointer;
        background-color: #fff;
        border: 1px solid #ccc;
        margin-top: -1px; /* Prevent double borders */
        font-family: Arial, sans-serif; /* Modern font */
    }
    .autocomplete-item.highlight {
        background-color: #f0f0f0; /* Light gray background for the selected item */
    }
    .autocomplete-item:hover {
        background-color: #ddd;
    }
    #autocomplete-tooltip {
        position: absolute;
        z-index: 1000;
        background-color: #fff;
        border: 1px solid #ccc;
        box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
    }
`;
document.head.appendChild(style);
