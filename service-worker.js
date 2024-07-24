console.log("DEBUG: BACKEND REACHED");

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === 'TEXT_BOX_UPDATED') {
        try {
            const response = await fetch('https://2192325f-d109-4481-8342-3a4189739f5b.mock.pstmn.io/completion', {
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
    return true; // Indicate that sendResponse will be called asynchronously
});
