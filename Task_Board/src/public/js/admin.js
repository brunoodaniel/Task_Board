const socket = io();

socket.on('duplicate-task', () => {
    showNotification('Esta tarefa já existe!', true);
});

function requestNotificationPermission() {
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
}

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.classList.add('notification');
    if (isError) {
        notification.classList.add('error');
    }
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, 4000);
}

function checkForDuplicateTask(taskContent) {
    const taskCards = document.querySelectorAll('.task-content');
    for (const card of taskCards) {
        if (card.textContent.trim().toLowerCase() === taskContent.trim().toLowerCase()) {
            return true;
        }
    }
    return false;
}

function deleteTask(taskContent) {
    if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
        fetch('/delete-task', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `task=${encodeURIComponent(taskContent)}`
        })
            .then(response => {
                if (response.redirected) {
                    window.location.href = response.url;
                }
            })
            .catch(error => console.error('Erro:', error));
    }
}

function createTaskCard(taskContent) {
    const card = document.createElement('div');
    card.classList.add('task-card');

    const contentSpan = document.createElement('span');
    contentSpan.classList.add('task-content');
    contentSpan.textContent = taskContent;

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.textContent = '×';
    deleteBtn.onclick = () => deleteTask(taskContent);

    card.appendChild(contentSpan);
    card.appendChild(deleteBtn);

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

socket.on('initial-tasks', (tasks) => {
    const newColumn = document.getElementById('new-column');
    newColumn.querySelectorAll('.task-card').forEach(card => card.remove());

    tasks.forEach(taskContent => {
        const card = createTaskCard(taskContent);
        newColumn.appendChild(card);
    });
});

socket.on('new-task', (data) => {
    const newColumn = document.getElementById('new-column');
    const card = createTaskCard(data.task);
    newColumn.appendChild(card);
    showNotification(data.message);
});

window.onload = function () {
    const urlParams = new URLSearchParams(window.location.search);
    const errorMessage = urlParams.get('error');
    if (errorMessage) {
        showNotification(errorMessage, true);
        history.replaceState(null, '', window.location.pathname); // Remove o erro da URL
    }
};

socket.on('task-deleted', (data) => {
    const newColumn = document.getElementById('new-column');
    const cards = newColumn.querySelectorAll('.task-card');

    cards.forEach(card => {
        const taskContent = card.querySelector('.task-content').textContent;
        if (taskContent === data.task) {
            card.remove();
        }
    });

    showNotification(data.message);
});

document.querySelector('.task-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const taskInput = document.getElementById('task');
    const errorMessage = document.getElementById('error-message');
    const taskValue = taskInput.value.trim();

    errorMessage.style.display = 'none';

    if (!taskValue) {
        return;
    }

    taskInput.value = '';
});
