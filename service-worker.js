
console.log("DEBUG: BACKEND REACHED")

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === 'TEXT_BOX_UPDATED') {
      const useStringForCompletion = true;
      const completions = [
        "example completion 1",
        "example completion 2",
        "example completion 3"
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
  
          console.log(textBoxContent);
  
          if (!response.ok) {
            console.error('API request failed');
            return;
          }
  
          const data = await response.json();
          const completion = data.choices.map(choice => choice.text).join('\n'); // Join completions into a single string
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'COMPLETION_RECEIVED',
            completion: completion
          });
        } catch (error) {
          console.error('Error during fetch:', error);
        }
      }
    }
  });
  