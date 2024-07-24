console.log("DEBUG: BACKEND REACHED");

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === 'TEXT_BOX_UPDATED') {
        const useStringForCompletion = false;
        const completions = [
            "example 1",
            "example 2",
            "example 3"
        ];

        if (useStringForCompletion) {
            const completion = completions.join('\n');
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'COMPLETION_RECEIVED',
                completion: completion
            });
        } else {
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
                    return;
                }

                const data = await response.json();

                if (data.suggestions && Array.isArray(data.suggestions)) {
                    const completion = data.suggestions.map(suggestion => suggestion).join('\n');
                    chrome.tabs.sendMessage(sender.tab.id, {
                        type: 'COMPLETION_RECEIVED',
                        completion: completion,
                        lastChar: request.lastChar
                    });
                } else {
                    console.error('Unexpected response format:', data);
                }
            } catch (error) {
                console.error('Error during fetch:', error);
            }
        }
    }
});
