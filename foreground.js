console.log(getShortDateTime() + "\n" + "DEBUG: URL MATCHED");

if (document.readyState !== 'loading') {
  console.log(getShortDateTime() + "\n" + "DEBUG: DOM already loaded");
  waitForEditorInitialization();
} else {
  document.addEventListener('DOMContentLoaded', function () {
    console.log(getShortDateTime() + "\n" + "DEBUG: DOM was not loaded yet");
    waitForEditorInitialization();
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

function waitForEditorInitialization() {
  const editorIframe = document.querySelector('iframe#mce_0_ifr');

  if (!editorIframe) {
    setTimeout(waitForEditorInitialization, 100);
  } else {
    if (editorIframe.contentDocument.readyState === 'complete') {
      monitorEditorContent(editorIframe);
    } else {
      editorIframe.addEventListener('load', function() {
        monitorEditorContent(editorIframe);
      });
    }
  }
}

function monitorEditorContent(editorIframe) {
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

    editorBody.addEventListener('keydown', handleKeyDown);

    console.log("DEBUG: Editor listeners and observer set up");
  } else {
    console.log('DEBUG: Editor body not found. Retrying...');
    setTimeout(() => monitorEditorContent(editorIframe), 100);
  }
}

let lastValidChar = "";
let completions = [];
let tooltip;
let selectedIndex = 0;

function getCurrentPosition(inputValue) {
  const parts = inputValue.split(/[\s.:()]+/);
  return parts.length;
}

function handleInput() {
  clearTimeout(inputTimeout);

  inputTimeout = setTimeout(() => {
    if (isRequestInProgress) return;

    const editorIframe = document.querySelector('iframe#mce_0_ifr');
    const editorContent = editorIframe.contentDocument.body.innerText;
    const inputValue = editorContent.trim();

    const position = getCurrentPosition(inputValue);

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

    if (lastChar !== "" && lastChar !== " " && lastChar !== "." && lastChar !== ":") {
      if (!suggestionUsed) {
        lastValidChar = lastChar;
        console.log('DEBUG: Last valid character:', lastValidChar);

        localStorage.setItem('lastValidChar', lastValidChar);

        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          isRequestInProgress = true;
          chrome.runtime.sendMessage({ type: 'TEXT_BOX_UPDATED', lastChar: lastValidChar, position: position }, response => {
            isRequestInProgress = false;
            if (chrome.runtime.lastError) {
              console.error('DEBUG: ' + chrome.runtime.lastError.message);
            } else {
              console.log('DEBUG: Message sent successfully');
            }
          });
        } else {
          console.log('DEBUG: Chrome runtime API is not available.');
        }
      }
    } else {
      suggestionUsed = false;
      console.log('DEBUG: No valid last character to process.');
      hideCompletionPopup();
    }
  }, 300); // 300ms Timeout, um schnelle wiederholte Eingaben abzufangen
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
      const editorIframe = document.querySelector('iframe#mce_0_ifr');
      const editorContent = editorIframe.contentDocument.body.innerText;
      selectCompletion(editorContent);
    }
  }
  
  if (event.key === ' ' || event.key === '.' || event.key === ':') {
    suggestionUsed = false; // Reset suggestionUsed flag on space, dot, or colon
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

function selectCompletion(inputValue) {
  if (selectedIndex < 0 || selectedIndex >= completions.length) return;

  const currentValue = inputValue;
  const selectedCompletion = completions[selectedIndex].text;
  const lastWord = currentValue.split(/[\s.:]+/).pop().toLowerCase();
  const selectedCompletionLowerCase = selectedCompletion.toLowerCase();

  suggestionUsed = true; // Mark suggestion as used

  const editorIframe = document.querySelector('iframe#mce_0_ifr');
  const selection = editorIframe.contentWindow.getSelection();
  const range = selection.getRangeAt(0);
  range.setStart(range.endContainer, range.endOffset - lastWord.length);
  range.deleteContents();

  insertTextAtCursor(selectedCompletion);
  hideCompletionPopup();

  // After inserting the text, show the tooltip again
  showCompletionPopupAfterSelection();
}

function insertTextAtCursor(text) {
  const editorIframe = document.querySelector('iframe#mce_0_ifr');
  const selection = editorIframe.contentWindow.getSelection();
  const range = selection.getRangeAt(0);
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function showCompletionPopupAfterSelection() {
  const editorIframe = document.querySelector('iframe#mce_0_ifr');
  const editorContent = editorIframe.contentDocument.body.innerText;
  const position = getCurrentPosition(editorContent);
  chrome.runtime.sendMessage({ type: 'TEXT_BOX_UPDATED', lastChar: lastValidChar, position: position }, response => {
    if (chrome.runtime.lastError) {
      console.error('DEBUG: ' + chrome.runtime.lastError.message);
    } else {
      console.log('DEBUG: Message sent successfully');
    }
  });
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

function showCompletionPopup(inputValue, completions) {
  const editorIframe = document.querySelector('iframe#mce_0_ifr');
  const iframeWindow = editorIframe.contentWindow;
  const selection = iframeWindow.getSelection();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const iframeRect = editorIframe.getBoundingClientRect();

  const coords = {
    top: iframeRect.top + rect.bottom,
    left: iframeRect.left + rect.left
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
      selectedIndex = index; // Set the selected index to the clicked item
      selectCompletion(inputValue);
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
`;
document.head.appendChild(style);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COMPLETION_RECEIVED') {
    console.log('DEBUG: Completion received:', message.suggestions);
    completions = message.suggestions;
    const editorIframe = document.querySelector('iframe#mce_0_ifr');
    const editorContent = editorIframe.contentDocument.body.innerText;
    showCompletionPopup(editorContent, completions);
    sendResponse({ status: 'received' });
  }
});
