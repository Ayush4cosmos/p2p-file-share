const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('signal', ({ to, data, from }) => {
    io.to(to).emit('signal', { from: from || socket.id, data });
  });

  socket.on('get-id', () => {
    socket.emit('your-id', socket.id);
  });
});

http.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
