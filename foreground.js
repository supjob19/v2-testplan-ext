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
    } else {
        console.log("Textfield with this ID not found");
    }
}

function handleInput(event) {
    const textBox = event.target;
    const inputValue = textBox.value;
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

    if (lastChar !== "") {
        console.log('Last character:', lastChar);
        chrome.runtime.sendMessage({ type: 'TEXT_BOX_UPDATED', lastChar: lastChar });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'COMPLETION_RECEIVED' && request.completion) {
            showCompletionPopup(textBox, request.completion.split('\n'));
        }
    });
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

function showCompletionPopup(textBox, completions) {
    const cursorPosition = textBox.selectionStart;
    const coords = getCaretCoordinates(textBox, cursorPosition);

    let tooltip = document.getElementById('autocomplete-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'autocomplete-tooltip';
        document.body.appendChild(tooltip);
    }
    tooltip.innerHTML = '';

    completions.forEach(completion => {
        const item = document.createElement('div');
        item.textContent = completion;
        item.classList.add('autocomplete-item');
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            textBox.value += completion;
            tooltip.style.display = 'none';
        });
        tooltip.appendChild(item);
    });

    tooltip.style.left = `${coords.left}px`;
    tooltip.style.top = `${coords.top + 20}px`; // Adjust the position as needed
    tooltip.style.display = 'block';
}

const style = document.createElement('style');
style.innerHTML = `
    .autocomplete-item {
        padding: 5px;
        cursor: pointer;
        background-color: #fff;
        border: 1px solid #ccc;
        margin-top: -1px; /* Prevent double borders */
    }
    .autocomplete-item:hover {
        background-color: #ddd;
    }
`;
document.head.appendChild(style);
