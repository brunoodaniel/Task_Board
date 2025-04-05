const socket = io();

function requestNotificationPermission() {
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.classList.add('notification');
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, 4000);
}

function createTaskCard(taskContent) {
    const card = document.createElement('div');
    card.classList.add('task-card');
    card.textContent = taskContent;

    // Efeitos de hover originais
    card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-3px)';
        card.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'none';
        card.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    });

    return card;
}

// Carregar tarefas iniciais
socket.on('initial-tasks', (tasks) => {
    const newColumn = document.getElementById('new-column');
    newColumn.querySelectorAll('.task-card').forEach(card => card.remove());

    tasks.forEach(taskContent => {
        const card = createTaskCard(taskContent);
        newColumn.appendChild(card);
    });
});

// Nova tarefa em tempo real
socket.on('new-task', (data) => {
    const newColumn = document.getElementById('new-column');
    const card = createTaskCard(data.task);
    newColumn.appendChild(card);
    showNotification(data.message);
});

// Atualizar quando uma tarefa é deletada
socket.on('task-deleted', (data) => {
    const newColumn = document.getElementById('new-column');
    const cards = newColumn.querySelectorAll('.task-card');

    cards.forEach(card => {
        if (card.textContent === data.task) {
            card.remove();
        }
    });

    showNotification(data.message);
});

window.onload = requestNotificationPermission;