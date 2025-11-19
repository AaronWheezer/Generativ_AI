document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatWindow = document.getElementById('chat-window');

    // Auto-focus input
    userInput.focus();

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = userInput.value.trim();
        if (message) {
            addMessage(message, 'user');
            userInput.value = '';
            
            // Simulate bot thinking and response
            showTypingIndicator();
            setTimeout(() => {
                removeTypingIndicator();
                handleBotResponse(message);
            }, 1000);
        }
    });

    function addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        
        // Icon based on sender
        if (sender === 'bot') {
            avatarDiv.innerHTML = '<i class="fa-solid fa-user-police"></i>';
        } else {
            avatarDiv.innerHTML = '<i class="fa-solid fa-user"></i>';
        }

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        contentDiv.innerHTML = `<p>${text}</p>`;

        const timestampDiv = document.createElement('div');
        timestampDiv.classList.add('timestamp');
        const now = new Date();
        timestampDiv.innerText = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

        // Assemble
        if (sender === 'bot') {
            messageDiv.appendChild(avatarDiv);
            messageDiv.appendChild(contentDiv);
        } else {
            messageDiv.appendChild(contentDiv);
            messageDiv.appendChild(avatarDiv);
        }
        messageDiv.appendChild(timestampDiv);

        chatWindow.appendChild(messageDiv);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.classList.add('message', 'bot-message');
        typingDiv.innerHTML = `
            <div class="avatar"><i class="fa-solid fa-user-police"></i></div>
            <div class="message-content" style="padding: 15px;">
                <i class="fa-solid fa-ellipsis fa-beat-fade"></i>
            </div>
        `;
        chatWindow.appendChild(typingDiv);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) {
            typingDiv.remove();
        }
    }

    // Simple logic to simulate the flow (Placeholder for backend logic)
    // let step = 0; // REMOVED: We no longer need local state for steps, the backend handles context
    
    async function handleBotResponse(userMessage) {
        // Call the backend API
        try {
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: userMessage,
                    sessionId: 'session-123' // In a real app, generate a unique ID per user
                })
            });

            if (!response.ok) {
                throw new Error('Netwerk respons was niet ok');
            }

            const data = await response.json();
            addMessage(data.response, 'bot');

        } catch (error) {
            console.error('Fout bij ophalen antwoord:', error);
            addMessage("Sorry, ik kan momenteel geen verbinding maken met de server. Controleer of de backend draait.", 'bot');
        }
    }
});
