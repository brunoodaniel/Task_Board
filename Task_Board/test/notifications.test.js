const { expect } = require('chai');
const { io } = require('socket.io-client');
const { server, db } = require('../src/app');

let testServer;
let clientSocket;

describe('Testes de Notificações Socket.IO', function () {
  this.timeout(10000); 

  before((done) => {
    testServer = server.listen(0, () => {
      const port = testServer.address().port;

      clientSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });

      clientSocket.on('connect', () => {
        done();
      });

      clientSocket.on('connect_error', (err) => {
        done(err); 
      });
    });
  });

  after((done) => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
    testServer.close(done);
  });

  beforeEach((done) => {
    db.run('DELETE FROM tasks', done); 
  });

  it('deve emitir "new-task" ao adicionar nova tarefa', (done) => {
    const taskContent = 'Tarefa Teste 1';

    clientSocket.once('new-task', (data) => {
      try {
        expect(data).to.have.property('task', taskContent);
        expect(data).to.have.property('message', 'Nova tarefa cadastrada com sucesso!');
        done();
      } catch (err) {
        done(err);
      }
    });

    const axios = require('axios');
    const port = testServer.address().port;
    axios.post(`http://localhost:${port}/submit-task`, `task=${encodeURIComponent(taskContent)}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }).catch(done); 
  });

  it('deve emitir "duplicate-task" ao tentar adicionar tarefa repetida', (done) => {
    const taskContent = 'Tarefa Duplicada';

    db.run('INSERT INTO tasks (content) VALUES (?)', [taskContent], (err) => {
      if (err) return done(err);

      clientSocket.once('duplicate-task', () => {
        done();
      });

      const axios = require('axios');
      const port = testServer.address().port;
      axios.post(`http://localhost:${port}/submit-task`, `task=${encodeURIComponent(taskContent)}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }).catch(done);
    });
  });

  it('deve emitir "task-deleted" ao remover uma tarefa existente', (done) => {
    const taskContent = 'Tarefa para Deletar';

    db.run('INSERT INTO tasks (content) VALUES (?)', [taskContent], (err) => {
      if (err) return done(err);

      clientSocket.once('task-deleted', (data) => {
        try {
          expect(data.task).to.equal(taskContent);
          expect(data.message).to.equal('Tarefa removida com sucesso!');
          done();
        } catch (err) {
          done(err);
        }
      });

      const axios = require('axios');
      const port = testServer.address().port;
      axios.post(`http://localhost:${port}/delete-task`, `task=${encodeURIComponent(taskContent)}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }).catch(done);
    });
  });

});
