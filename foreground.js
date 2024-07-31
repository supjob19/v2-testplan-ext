console.log(getShortDateTime() + "\n" + "DEBUG: URL MATCHED");

if (document.readyState !== 'loading') {
  console.log(getShortDateTime() + "\n" + "DEBUG: DOM already loaded");
  initializeEditorListeners();
  fetchSuggestions();
} else {
  document.addEventListener('DOMContentLoaded', function () {
    console.log(getShortDateTime() + "\n" + "DEBUG: DOM was not loaded yet");
    initializeEditorListeners();
    fetchSuggestions();
  });
}

function getShortDateTime() {
  const now = new Date();
  const timeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };

  const time = now.toLocaleTimeString('de-DE', timeOptions);

  return `${time}`;
}

let isRequestInProgress = false;
let inputTimeout;
let suggestionUsed = false;
let previousSuggestions = [];
let activeEditorIframe = null;
let activeObserver = null;
let warningMessage = null;
let completions = {};
let tooltip;
let selectedIndex = 0;
let validSuggestionsSet = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COMPLETION_RECEIVED') {
    completions = message.suggestions;
    updateValidSuggestionsSet();
    console.log('DEBUG: Suggestions received and stored.', completions);
  }
});

function fetchSuggestions() {
  chrome.runtime.sendMessage({ type: 'FETCH_SUGGESTIONS' }, response => {
    if (response && response.status === 'success') {
      completions = response.suggestions;
      updateValidSuggestionsSet();
    } else {
      console.error('Error fetching suggestions:', response ? response.message : 'No response');
    }
  });
}

function updateValidSuggestionsSet() {
  validSuggestionsSet.clear();
  for (const position in completions) {
    completions[position].forEach(completion => {
      validSuggestionsSet.add(completion.text);
    });
  }
}

function initializeEditorListeners() {
  setInterval(() => {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      if (!iframe._hasFocusListener) {
        setupEditorFocusListener(iframe);
        iframe._hasFocusListener = true;
      }
    });
  }, 100);

  document.addEventListener('click', function (event) {
    if (tooltip && tooltip.style.display === 'block' && !tooltip.contains(event.target)) {
      hideCompletionPopup();
    }
  });
}

function setupEditorFocusListener(iframe) {
  const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;

  iframeDocument.addEventListener('focusin', function (event) {
    const editorBody = event.target.closest('#tinymce');
    if (editorBody) {
      if (activeEditorIframe !== iframe) {
        console.log('DEBUG: Editor focus changed.');
        activeEditorIframe = iframe;
        monitorEditorContent(iframe);
      }
    }
  });

  iframeDocument.addEventListener('click', function (event) {
    const editorBody = event.target.closest('#tinymce');
    if (editorBody) {
      if (activeEditorIframe !== iframe) {
        console.log('DEBUG: Editor clicked and focus changed.');
        activeEditorIframe = iframe;
        monitorEditorContent(iframe);
      }
    }
  });

  const activeElement = iframeDocument.activeElement;
  if (activeElement && activeElement.closest('#tinymce')) {
    activeEditorIframe = iframe;
    monitorEditorContent(iframe);
  }
}

function monitorEditorContent(editorIframe) {
  if (activeObserver) {
    activeObserver.disconnect();
  }

  const iframeDocument = editorIframe.contentDocument || editorIframe.contentWindow.document;
  const editorBody = iframeDocument.getElementById('tinymce');

  if (editorBody) {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          handleInput();
        }
      });
    });

    observer.observe(editorBody, {
      childList: true,
      characterData: true,
      subtree: true
    });

    activeObserver = observer;

    editorBody.addEventListener('keydown', handleKeyDown);

    console.log("DEBUG: Editor listeners and observer set up");
  } else {
    console.log('DEBUG: Editor body not found. Retrying...');
    setTimeout(() => monitorEditorContent(editorIframe), 100);
  }
}

function getCurrentPosition(inputValue) {
  const parts = inputValue.split(/[\s.:]+/);
  return parts.length;
}

function isValidCommand(inputValue) {
  if (inputValue === "") return true;

  const cleanedInput = inputValue.replace(/\(.*?\)$/, '');

  const inputParts = cleanedInput.split(/[\s.:]+/);

  return inputParts.every(part => validSuggestionsSet.has(part));
}

function handleInput() {
  clearTimeout(inputTimeout);

 
  inputTimeout = setTimeout(() => {
    if (!activeEditorIframe) return;

    const editorContent = activeEditorIframe.contentDocument.body.innerText.trim();
    const inputValue = editorContent.split('\n').pop().trim();

    // Ignorieren Sie alles innerhalb der Klammern am Ende
    const cleanedInput = inputValue.replace(/\(.*?\)$/, '');

    const position = getCurrentPosition(cleanedInput);

    let lastChar = "";
    if (inputValue.length > 0) {
      for (let i = inputValue.length - 1; i >= 0; i--) {
        const char = inputValue.charAt(i);
        if (char !== " " && char !== "") {
          if (i === 0 || inputValue.charAt(i - 1) === " " || inputValue.charAt(i - 1) === "." || inputValue.charAt(i - 1) === ":") {
            lastChar = char;
            break;
          }
        }
      }
    }

    if (!isValidCommand(cleanedInput)) {
      showWarningMessage();
    } else {
      hideWarningMessage();
    }

    const inputParts = cleanedInput.split(/[\s.:]+/);

    if (position >= 5 && inputParts[3] !== "CAS") {
      hideCompletionPopup();
      return;
    }

    if (lastChar !== "" && lastChar !== " " && lastChar !== "." && lastChar !== ":") {
      if (!suggestionUsed) {
        lastValidChar = lastChar;
        localStorage.setItem('lastValidChar', lastValidChar);
        previousSuggestions = editorContent.split(/[\s.:()]+/);
        let relevantSuggestions = completions[position] || [];

        relevantSuggestions = sortCompletions(relevantSuggestions, lastValidChar);

        if (relevantSuggestions.length > 0) {
          showCompletionPopup(inputValue, relevantSuggestions);
        } else {
          hideCompletionPopup();
        }
      }
    } else {
      suggestionUsed = false;
      hideCompletionPopup();
    }
  }, 300);
}

function handleKeyDown(event) {
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
  
  if (event.key === ' ' || event.key === '.' || event.key === ':') {
    suggestionUsed = false;
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
  const items = tooltip.querySelectorAll('.autocomplete-item');
  if (selectedIndex < 0 || selectedIndex >= items.length) return;

  const selectedCompletion = items[selectedIndex].querySelector('.autocomplete-suggestion-text').textContent;

  const editorContent = activeEditorIframe.contentDocument.body.innerText;
  const lastWord = editorContent.split(/[\s.:]+/).pop().toLowerCase();

  suggestionUsed = true;

  const selection = activeEditorIframe.contentWindow.getSelection();
  const range = selection.getRangeAt(0);
  range.setStart(range.endContainer, range.endOffset - lastWord.length);
  range.deleteContents();

  insertTextAtCursor(selectedCompletion);
  hideCompletionPopup();
}

function insertTextAtCursor(text) {
  const selection = activeEditorIframe.contentWindow.getSelection();
  const range = selection.getRangeAt(0);
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function showCompletionPopup(inputValue, completions) {
  const iframeWindow = activeEditorIframe.contentWindow;
  const selection = iframeWindow.getSelection();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const iframeRect = activeEditorIframe.getBoundingClientRect();

  const coords = {
    top: iframeRect.top + rect.bottom + window.scrollY,
    left: iframeRect.left + rect.left + window.scrollX
  };

  tooltip = document.getElementById('autocomplete-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'autocomplete-tooltip';
    document.body.appendChild(tooltip);
  }
  tooltip.innerHTML = '';
  selectedIndex = 0;

  completions.forEach((completion, index) => {
    const item = document.createElement('div');
    item.classList.add('autocomplete-item');
    if (index === selectedIndex) {
      item.classList.add('highlight');
    }

    const suggestionText = document.createElement('div');
    suggestionText.textContent = completion.text;
    suggestionText.classList.add('autocomplete-suggestion-text');

    const suggestionDescription = document.createElement('div');
    suggestionDescription.textContent = completion.description;
    suggestionDescription.classList.add('autocomplete-suggestion-description');

    item.appendChild(suggestionText);
    item.appendChild(suggestionDescription);

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectedIndex = index;
      selectCompletion();
    });
    tooltip.appendChild(item);
  });
  
  adjustTooltipWidth(tooltip, completions);

  tooltip.style.left = `${coords.left}px`;
  tooltip.style.top = `${coords.top}px`;
  tooltip.style.display = 'block';

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

function showWarningMessage() {
  if (!warningMessage) {
    warningMessage = document.createElement('div');
    warningMessage.id = 'warning-message';
    warningMessage.textContent = 'Ungültiger Befehl!';
    document.body.appendChild(warningMessage);
  }

  const iframeRect = activeEditorIframe.getBoundingClientRect();
  warningMessage.style.position = 'fixed';
  warningMessage.style.color = 'red';
  warningMessage.style.fontWeight = 'bold';
  warningMessage.style.marginLeft = '5px';
  warningMessage.style.top = `${iframeRect.top}px`;
  warningMessage.style.left = `${iframeRect.right + 10}px`;
  warningMessage.style.display = 'block';
}

function hideWarningMessage() {
  if (warningMessage) {
    warningMessage.style.display = 'none';
  }
}

function adjustTooltipWidth(tooltip, completions) {
  const span = document.createElement('span');
  span.style.visibility = 'hidden';
  span.style.whiteSpace = 'nowrap';
  span.style.position = 'absolute';
  span.style.font = getComputedStyle(document.body).font;
  document.body.appendChild(span);

  let maxWidth = 0;

  completions.forEach(completion => {
    span.textContent = completion.text;
    const itemWidth = span.offsetWidth;
    if (itemWidth > maxWidth) {
      maxWidth = itemWidth;
    }
  });

  document.body.removeChild(span);

  tooltip.style.width = `${maxWidth + 100}px`;
}

function sortCompletions(completions, lastChar) {
  return completions.sort((a, b) => {
    const aStartsWith = a.text.toLowerCase().startsWith(lastChar.toLowerCase());
    const bStartsWith = b.text.toLowerCase().startsWith(lastChar.toLowerCase());
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return 0;
  });
}

const style = document.createElement('style');
style.innerHTML = `
    .autocomplete-item {
        padding: 5px;
        cursor: pointer;
        background-color: #fff;
        border: 1px solid #ccc;
        margin-top: -1px;
        font-family: Arial, sans-serif;
    }
    .autocomplete-suggestion-text {
        font-weight: bold;
    }
    .autocomplete-suggestion-description {
        font-size: 0.8em;
        color: #666;
    }
    .autocomplete-item.highlight {
        background-color: #f0f0f0;
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
    #warning-message {
        background-color: #ffe6e6;
        border: 1px solid red;
        padding: 5px;
        border-radius: 4px;
        display: none;
        margin-left: 5px;
    }
`;
document.head.appendChild(style);

window.addEventListener('scroll', () => {
  if (tooltip && tooltip.style.display === 'block') {
    const selection = activeEditorIframe.contentWindow.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const iframeRect = activeEditorIframe.getBoundingClientRect();

    const coords = {
      top: iframeRect.top + rect.bottom + window.scrollY,
      left: iframeRect.left + rect.left + window.scrollX
    };

    tooltip.style.left = `${coords.left}px`;
    tooltip.style.top = `${coords.top}px`;
  }

  if (warningMessage && warningMessage.style.display === 'block') {
    const iframeRect = activeEditorIframe.getBoundingClientRect();
    warningMessage.style.top = `${iframeRect.top}px`;
    warningMessage.style.left = `${iframeRect.right + 10}px`;
  }
});
