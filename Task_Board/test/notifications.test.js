const { expect } = require('chai');
const { io } = require('socket.io-client');
const { app, db, server } = require('../src/app');
const axios = require('axios');

let testServer;
let clientSocket;

describe('Testes de Notificações Socket.IO', function () {
  this.timeout(10000);

  before((done) => {
    testServer = server;
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

  after((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    done();
  });

  beforeEach((done) => {
    db.run('DELETE FROM tasks', done);
  });

  it('deve emitir "new-task" ao adicionar nova tarefa', (done) => {
    const taskContent = 'Tarefa Teste 1';

    clientSocket.once('new-task', (data) => {
      try {
        expect(data).to.have.property('content', taskContent);
        expect(data).to.have.property('status', 'novo');
        done();
      } catch (err) {
        done(err);
      }
    });

    const port = testServer.address().port;
    axios.post(`http://localhost:${port}/submit-task`, 
      `task=${encodeURIComponent(taskContent)}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }).catch(done);
  });

  it('deve emitir "task-status-updated" ao alterar o status de uma tarefa', (done) => {
    const taskContent = 'Tarefa para Atualizar Status';
    
    db.run('INSERT INTO tasks (content, status) VALUES (?, ?)', 
      [taskContent, 'novo'], function(err) {
        if (err) return done(err);
        
        const taskId = this.lastID;
        
        clientSocket.once('task-status-updated', (data) => {
          try {
            expect(data).to.have.property('taskId', taskId);
            expect(data).to.have.property('newStatus', 'em_andamento');
            done();
          } catch (err) {
            done(err);
          }
        });

        const port = testServer.address().port;
        axios.post(`http://localhost:${port}/update-task-status`, 
          `taskId=${taskId}&newStatus=em_andamento`, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }).catch(done);
      });
  });

  it('deve bloquear exclusão de tarefa concluída e emitir notificação', (done) => {
    const taskContent = 'Tarefa Concluída para Teste';
    
    db.run('INSERT INTO tasks (content, status) VALUES (?, ?)', 
      [taskContent, 'concluido'], (err) => {
        if (err) return done(err);
        
        clientSocket.once('notification', (data) => {
          try {
            expect(data).to.have.property('type', 'error');
            expect(data.message).to.include('Não é possível excluir tarefas concluídas');
            done();
          } catch (err) {
            done(err);
          }
        });

        const port = testServer.address().port;
        axios.post(`http://localhost:${port}/delete-task`, 
          `task=${encodeURIComponent(taskContent)}`, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }).catch(err => {
            if (err.response && err.response.status === 403) {
              return; 
            }
            done(err);
          });
      });
  });
});
