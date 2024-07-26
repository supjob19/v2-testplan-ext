console.log(getShortDateTime() + "\n" + "DEBUG: BACKEND REACHED");

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

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.type === 'TEXT_BOX_UPDATED') {
    console.log("DEBUG: Received - " + request.type);
    try {
      const response = await fetch('http://localhost:3001/completion', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(response);

      if (!response.ok) {
        console.error('API request failed');
        sendResponse({ status: 'error', message: 'API request failed' });
        return;
      }

      const data = await response.json();

      const position = request.position;
      if (position > 4) {
        console.log('DEBUG: Position higher than 4, no suggestions will be shown.');
        sendResponse({ status: 'success', message: 'Position higher than 4, no suggestions will be shown.' });
        return;
      }

      if (data.positions && data.positions[position]) {
        const suggestions = data.positions[position].suggestions.map((suggestion, index) => ({
          text: suggestion,
          description: data.positions[position].descriptions[index]
        }));
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'COMPLETION_RECEIVED',
          suggestions: suggestions,
          lastChar: request.lastChar
        });
        console.log("DEBUG: Sent - COMPLETION_RECEIVED");
        sendResponse({ status: 'success' });
      } else {
        console.error('Unexpected response format:', data);
        sendResponse({ status: 'error', message: 'Unexpected response format' });
      }
    } catch (error) {
      console.error('Error during fetch:', error);
      sendResponse({ status: 'error', message: error.message });
    }
  }
  return true;
});
