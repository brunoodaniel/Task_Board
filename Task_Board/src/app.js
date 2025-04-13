const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configuração do Banco de Dados
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            status TEXT DEFAULT 'novo',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Funções auxiliares do banco
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
};

const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = 3000;

// Configuração do Express
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Rotas
app.get('/admin', async (req, res) => {
    try {
        const tasks = await dbAll(
            'SELECT id, content, status FROM tasks ORDER BY timestamp DESC'
        );

        res.render('admin', {
            tasks: tasks,
            error: req.query.error
        });

    } catch (err) {
        console.error('Erro ao buscar tarefas:', err.message);
        io.emit('database-error', { message: 'Erro ao carregar tarefas' });
        res.status(500).render('admin', {
            tasks: [],
            error: 'Erro ao carregar tarefas'
        });
    }
});

app.post('/submit-task', async (req, res) => {
    const newTask = req.body.task.trim();

    try {
        const existingTask = await dbGet(
            'SELECT content FROM tasks WHERE content = ?', 
            [newTask]
        );

        if (existingTask) {
            io.emit('notification', {
                type: 'error',
                message: 'Tarefa já existe!'
            });
            return res.redirect('/admin?error=Tarefa já existe!');
        }

        const result = await dbRun(
            'INSERT INTO tasks (content) VALUES (?)', 
            [newTask]
        );

        const newTaskData = {
            id: result.lastID,
            content: newTask,
            status: 'novo'
        };

        io.emit('new-task', newTaskData);
        io.emit('notification', {
            type: 'success',
            message: 'Tarefa adicionada com sucesso!'
        });

        res.redirect('/admin');

    } catch (err) {
        console.error('Erro no processamento da tarefa:', err.message);
        io.emit('notification', {
            type: 'error',
            message: 'Erro ao processar tarefa'
        });
        res.status(500).redirect('/admin?error=Erro ao processar a tarefa');
    }
});

app.post('/delete-task', async (req, res) => {
    const taskContent = req.body.task;

    try {
        const taskToDelete = await dbGet(
            'SELECT id, content, status FROM tasks WHERE content = ?',
            [taskContent]
        );

        if (!taskToDelete) {
            io.emit('notification', {
                type: 'error',
                message: 'Tarefa não encontrada'
            });
            return res.status(404).redirect('/admin?error=Tarefa não encontrada');
        }

        // Verificar se a tarefa está concluída
        if (taskToDelete.status === 'concluido') {
            io.emit('notification', {
                type: 'error',
                message: 'Não é possível excluir tarefas concluídas!'
            });
            return res.status(403).redirect('/admin?error=Não é possível excluir tarefas concluídas');
        }

        await dbRun(
            'DELETE FROM tasks WHERE content = ?',
            [taskContent]
        );

        io.emit('task-deleted', taskToDelete);
        io.emit('notification', {
            type: 'warning',
            message: 'Tarefa removida com sucesso!'
        });

        res.redirect('/admin');

    } catch (err) {
        console.error('Erro ao deletar tarefa:', err.message);
        io.emit('notification', {
            type: 'error',
            message: 'Erro ao excluir tarefa'
        });
        res.status(500).redirect('/admin?error=Erro ao excluir tarefa');
    }
});

app.get('/user', async (req, res) => {
    try {
        const tasks = await dbAll(
            'SELECT id, content, status FROM tasks ORDER BY timestamp DESC'
        );

        res.render('user', { 
            tasks: tasks
        });

    } catch (err) {
        console.error('Erro ao buscar tarefas:', err.message);
        io.emit('database-error', { message: 'Erro ao carregar tarefas' });
        res.status(500).render('user', { 
            tasks: [],
            error: 'Erro ao carregar tarefas'
        });
    }
});

app.post('/update-task-status', async (req, res) => {
    const { taskId, newStatus } = req.body;

    try {
        const result = await dbRun(
            'UPDATE tasks SET status = ? WHERE id = ?',
            [newStatus, taskId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
        }

        const updatedTask = await dbGet(
            'SELECT id, content, status FROM tasks WHERE id = ?',
            [taskId]
        );

        io.emit('task-status-updated', {
            taskId: parseInt(taskId),
            newStatus: newStatus,
            content: updatedTask.content
        });

        io.emit('notification', {
            type: 'info',
            message: `Status atualizado: "${updatedTask.content}" para ${newStatus}`
        });

        res.status(200).json({ success: true });

    } catch (err) {
        console.error('Erro ao atualizar status:', err.message);
        io.emit('notification', {
            type: 'error',
            message: 'Erro ao atualizar status'
        });
        res.status(500).json({ success: false, error: err.message });
    }
});

// Socket.IO
io.on('connection', async (socket) => {
    console.log('Usuário conectado:', socket.id);

    try {
        const tasks = await dbAll(
            'SELECT id, content, status FROM tasks ORDER BY timestamp DESC'
        );
        socket.emit('initial-tasks', tasks);
    } catch (err) {
        console.error('Erro ao enviar tarefas iniciais:', err.message);
        socket.emit('database-error', { message: 'Erro ao carregar tarefas' });
    }

    socket.on('disconnect', () => {
        console.log('Usuário desconectado:', socket.id);
    });
});

// Inicialização do Servidor
server.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

module.exports = {
    app,
    db, 
    server 
};