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

function waitForEditorInitialization() {
  const editorIframe = document.querySelector('iframe#mce_0_ifr');

  if (!editorIframe) {
    console.log(getShortDateTime() + "\n" + "DEBUG: Waiting for editor to be initialized");
    setTimeout(waitForEditorInitialization, 100);
  } else {
    console.log(getShortDateTime() + "\n" + "DEBUG: Editor found");
    monitorEditorContent(editorIframe);
  }
}

function monitorEditorContent(editorIframe) {
  editorIframe.addEventListener('load', function() {
    const iframeDocument = editorIframe.contentDocument || editorIframe.contentWindow.document;
    const editorBody = iframeDocument.getElementById('tinymce');

    if (editorBody) {
      console.log('Editor initialized:', editorBody.innerHTML);  // Log the initial HTML inside the TinyMCE editor

      // Set up an observer to watch for changes in the editor
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

      // Additionally, listen for keydown events inside the TinyMCE editor
      editorBody.addEventListener('input', handleInput);
      editorBody.addEventListener('keydown', handleKeyDown);

      console.log("DEBUG: Editor listeners and observer set up");
    } else {
      console.log('Editor body not found. Retrying...');
      setTimeout(waitForEditorInitialization, 100);
    }
  });
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
  const editorIframe = document.querySelector('iframe#mce_0_ifr');
  const editorContent = editorIframe.contentDocument.body.innerText;
  const inputValue = editorContent.trim();

  console.log('Editor content:', editorContent);
  console.log('Trimmed input value:', inputValue);

  const position = getCurrentPosition(inputValue);
  console.log('Current position:', position);

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

  console.log('Last character found:', lastChar);

  if (lastChar !== "" && lastChar !== " ") {
    lastValidChar = lastChar;
    console.log('Last valid character:', lastValidChar);

    localStorage.setItem('lastValidChar', lastValidChar);

    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'TEXT_BOX_UPDATED', lastChar: lastValidChar, position: position }, response => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
        } else {
          console.log("Message sent successfully");
        }
      });
    } else {
      console.log('Chrome runtime API is not available.');
    }
  } else {
    console.log('No valid last character to process.');
    hideCompletionPopup();
  }
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

  if (selectedCompletionLowerCase.startsWith(lastWord)) {
    const remainingText = selectedCompletion.slice(lastWord.length);
    const editorIframe = document.querySelector('iframe#mce_0_ifr');
    editorIframe.contentDocument.body.innerText = currentValue + remainingText;
  } else {
    const editorIframe = document.querySelector('iframe#mce_0_ifr');
    editorIframe.contentDocument.body.innerText = currentValue + selectedCompletion;
  }

  hideCompletionPopup();
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
  const cursorPosition = editorIframe.contentWindow.getSelection().getRangeAt(0).startOffset;
  const coords = getCaretCoordinates(editorIframe.contentDocument.body, cursorPosition);

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
      const currentValue = inputValue;
      const lastWord = currentValue.split(/[\s.:]+/).pop().toLowerCase();
      const completionLowerCase = completion.text.toLowerCase();
      if (completionLowerCase.startsWith(lastWord)) {
        const remainingText = completion.text.slice(lastWord.length);
        editorIframe.contentDocument.body.innerText = currentValue + remainingText;
      } else {
        editorIframe.contentDocument.body.innerText = currentValue + completion.text;
      }
      hideCompletionPopup();
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

function getCaretCoordinates(element, position) {
  const div = document.createElement('div');
  const style = getComputedStyle(element);
  Array.from(style).forEach(prop => {
    div.style[prop] = style[prop];
  });

  const textContent = element.innerText.substr(0, position);
  div.textContent = textContent;

  if (element.nodeName === 'INPUT') {
    div.textContent = div.textContent.replace(/\s/g, '\u00a0');
  }

  const span = document.createElement('span');
  span.textContent = element.innerText.substr(position) || '.';
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
