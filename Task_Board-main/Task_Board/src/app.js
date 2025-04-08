const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// config do banco de dados
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});


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

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));


app.get('/admin', async (req, res) => {
    try {
        // await q espera a promise ser resolvida antes de continuar
        const tasks = await dbAll(
            'SELECT content FROM tasks ORDER BY timestamp DESC'
        );

        res.render('admin', {
            tasks: tasks.map(t => t.content),
            error: req.query.error
        });

    } catch (err) {
        console.error('Erro ao buscar tarefas:', err.message);
        
        io.emit('database-error', {
            message: 'Erro ao carregar tarefas'
        });

        res.status(500).render('admin', {
            tasks: [],
            error: 'Erro ao carregar tarefas'
        });
    }
});

app.post('/submit-task', async (req, res) => {
    const newTask = req.body.task.trim();

    try {
        // verifica se tarefa já existe
        const existingTask = await dbGet(
            'SELECT content FROM tasks WHERE content = ?', 
            [newTask]
        );

        if (existingTask) {
            io.emit('duplicate-task');
            return res.redirect('/admin?error=' + encodeURIComponent('Tarefa já existe!'));
        }

        // insere nova tarefa no banco
        const result = await dbRun(
            'INSERT INTO tasks (content) VALUES (?)', 
            [newTask]
        );

        // notificação de sucesso via Socket.IO
        io.emit('new-task', {
            task: newTask,
            message: 'Nova tarefa cadastrada com sucesso!'
        });

        res.redirect('/admin');

    } catch (err) {
        console.error('Erro no processamento da tarefa:', err.message);
        
        io.emit('database-error', {
            message: 'Erro ao processar a tarefa'
        });

        res.status(500).redirect('/admin?error=' + encodeURIComponent('Erro ao processar a tarefa'));
    }
});

app.post('/delete-task', async (req, res) => {
    const taskContent = req.body.task;

    try {
        // executa a deleção e espera pelo resultado
        const result = await dbRun(
            'DELETE FROM tasks WHERE content = ?',
            [taskContent]
        );

        // verifica se realmente deletou algo
        if (result.changes === 0) {
            io.emit('task-not-found', {
                message: 'Tarefa não encontrada para exclusão'
            });
            return res.status(404).redirect('/admin?error=' + encodeURIComponent('Tarefa não encontrada'));
        }

        // notificação de sucesso
        io.emit('task-deleted', {
            task: taskContent,
            message: 'Tarefa removida com sucesso!'
        });

        res.redirect('/admin');

    } catch (err) {
        console.error('Erro ao deletar tarefa:', err.message);
        
        io.emit('database-error', {
            message: 'Erro ao excluir tarefa'
        });

        res.status(500).redirect('/admin?error=' + encodeURIComponent('Erro ao excluir tarefa'));
    }
});

app.get('/user', async (req, res) => {
    try {
        const tasks = await dbAll(
            'SELECT content FROM tasks ORDER BY timestamp DESC'
        );

        res.render('user', { 
            tasks: tasks.map(t => t.content) 
        });

    } catch (err) {
        console.error('Erro ao buscar tarefas:', err.message);
        
        io.emit('database-error', {
            message: 'Erro ao carregar tarefas'
        });

        res.status(500).render('user', { 
            tasks: [],
            error: 'Erro ao carregar tarefas'
        });
    }
});

io.on('connection', async (socket) => {
    console.log('Um usuário conectou:', socket.id);

    try {
        // envia tarefas iniciais ao conectar
        const tasks = await dbAll(
            'SELECT content FROM tasks ORDER BY timestamp DESC'
        );
        socket.emit('initial-tasks', tasks.map(t => t.content));

    } catch (err) {
        console.error('Erro ao enviar tarefas iniciais:', err.message);
        socket.emit('database-error', {
            message: 'Erro ao carregar tarefas iniciais'
        });
    }

    socket.on('disconnect', () => {
        console.log('Um usuário desconectou:', socket.id);
    });
});

if (require.main === module) {
    server.listen(port, () => {
        console.log(`Servidor rodando em http://localhost:${port}`);
    });
}

module.exports = {
    app,
    db, 
    server 
};